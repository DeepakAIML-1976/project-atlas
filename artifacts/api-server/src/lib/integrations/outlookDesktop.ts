import { spawn } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { db, atlasEmailDraftsTable } from "@workspace/db";
import { processIncomingEmail } from "../atlasEmailIngest";
import { logger } from "../logger";

/**
 * Local Outlook desktop provider (Windows, classic Outlook via COM).
 *
 * Reads the signed-in Outlook profile directly, so it needs no Azure app
 * registration, no admin consent and no extra login. READ-ONLY: it never sends,
 * moves or deletes mail. Replies are only ever created as drafts that wait in
 * the Executive Authorization queue for a human to approve.
 */

export interface DesktopMail {
  subject: string;
  senderName: string;
  senderEmail: string;
  to: string;
  receivedAt: string;
  unread: boolean;
  body: string;
}

const PS_SCRIPT = `
$ErrorActionPreference = "Stop"
$folderId = [int]$env:ATLAS_OL_FOLDER
$count    = [int]$env:ATLAS_OL_COUNT
$hours    = [int]$env:ATLAS_OL_HOURS
$unread   = $env:ATLAS_OL_UNREAD -eq "1"
$targetAccount = [string]$env:ATLAS_OL_ACCOUNT

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

$folder = $null
if ($targetAccount) {
  foreach ($f in $ns.Folders) {
    if ($f.Name -like "*$targetAccount*") {
      try {
        $folder = if ($folderId -eq 5) { $f.Folders.Item("Sent Items") } else { $f.Folders.Item("Inbox") }
        if ($folder) { break }
      } catch { }
    }
  }
}
if (-not $folder) {
  $folder = $ns.GetDefaultFolder($folderId)
}

$items = $folder.Items
$prop = if ($folderId -eq 5) { "[SentOn]" } else { "[ReceivedTime]" }
$items.Sort($prop, $true)
$cutoff = (Get-Date).AddHours(-$hours)
$out = New-Object System.Collections.ArrayList
foreach ($m in $items) {
  if ($out.Count -ge $count) { break }
  try {
    if ($m.Class -ne 43) { continue }
    $when = if ($folderId -eq 5) { $m.SentOn } else { $m.ReceivedTime }
    if ($hours -gt 0 -and $when -lt $cutoff) { break }
    if ($unread -and -not $m.UnRead) { continue }
    $email = $m.SenderEmailAddress
    if ($m.SenderEmailType -eq "EX") {
      try { $email = $m.Sender.GetExchangeUser().PrimarySmtpAddress } catch { }
    }
    $body = if ($m.Body) { ($m.Body -replace "\\s+", " ").Trim() } else { "" }
    if ($body.Length -gt 4000) { $body = $body.Substring(0, 4000) }
    [void]$out.Add([pscustomobject]@{
      subject = [string]$m.Subject; senderName = [string]$m.SenderName; senderEmail = [string]$email
      to = [string]$m.To; receivedAt = $when.ToString("o"); unread = [bool]$m.UnRead; body = $body
    })
  } catch { }
}
$json = ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json
`;

function runOutlookRead(opts: {
  folder: "inbox" | "sent";
  count: number;
  sinceHours: number;
  unreadOnly: boolean;
  targetEmail?: string;
}): Promise<DesktopMail[]> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Outlook desktop provider is only available on Windows."));
      return;
    }
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      {
        env: {
          ...process.env,
          ATLAS_OL_FOLDER: opts.folder === "sent" ? "5" : "6",
          ATLAS_OL_COUNT: String(opts.count),
          ATLAS_OL_HOURS: String(opts.sinceHours),
          ATLAS_OL_UNREAD: opts.unreadOnly ? "1" : "0",
          ATLAS_OL_ACCOUNT: opts.targetEmail || "",
        },
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Outlook read timed out after 90s"));
    }, 90_000);

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Outlook read failed (exit ${code}): ${stderr.trim().slice(0, 300)}`));
        return;
      }
      try {
        const text = stdout.trim();
        const parsed = text ? JSON.parse(text) : [];
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err: any) {
        reject(new Error(`Could not parse Outlook output: ${err?.message}`));
      }
    });
  });
}

export async function isOutlookDesktopAvailable(): Promise<boolean> {
  try {
    await runOutlookRead({ folder: "inbox", count: 1, sinceHours: 0, unreadOnly: false });
    return true;
  } catch {
    return false;
  }
}

export function readOutlookInbox(count = 10, sinceHours = 48, unreadOnly = false, targetEmail?: string) {
  return runOutlookRead({ folder: "inbox", count, sinceHours, unreadOnly, targetEmail });
}

export function readOutlookSent(count = 10, sinceHours = 0, targetEmail?: string) {
  return runOutlookRead({ folder: "sent", count, sinceHours, unreadOnly: false, targetEmail });
}

/** Automated senders, newsletters, and marketing blasts that should never generate a reply draft. */
const AUTOMATED_SENDER =
  /no-?reply|do-?not-?reply|notification|mailer-daemon|postmaster|servicedesk|itservicedesk|marketing|mailers|newsletter|promo|e?news|offers|campaign|bounce|broadcast/i;

export interface DesktopSyncResult {
  success: boolean;
  source: "outlook_desktop";
  scanned: number;
  drafted: number;
  skippedAutomated: number;
  skippedDuplicate: number;
  emails: Array<typeof atlasEmailDraftsTable.$inferSelect>;
  error?: string;
}

/**
 * Pull recent Inbox mail from desktop Outlook and turn each human-sent message
 * into a Twin reply draft awaiting authorization. Sent Items give the Twin
 * Deepak's real writing style. Nothing is sent automatically.
 */
export async function syncOutlookDesktop(
  workspaceId: string,
  userId: string,
  opts: { count?: number; sinceHours?: number; unreadOnly?: boolean; targetEmail?: string } = {},
): Promise<DesktopSyncResult> {
  const result: DesktopSyncResult = {
    success: false,
    source: "outlook_desktop",
    scanned: 0,
    drafted: 0,
    skippedAutomated: 0,
    skippedDuplicate: 0,
    emails: [],
  };

  try {
    const inbox = await readOutlookInbox(opts.count ?? 10, opts.sinceHours ?? 48, opts.unreadOnly ?? true, opts.targetEmail);
    result.scanned = inbox.length;

    // Real examples of how Deepak writes, used to match tone in drafts.
    let styleExamples: string[] = [];
    try {
      const sent = await readOutlookSent(5, 0, opts.targetEmail);
      styleExamples = sent.map((s) => s.body).filter((b) => b.length > 40).map((b) => b.slice(0, 600));
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Could not load Sent Items for style context");
    }

    for (const mail of inbox) {
      const sender = mail.senderEmail
        ? `${mail.senderName} <${mail.senderEmail}>`
        : mail.senderName;

      if (AUTOMATED_SENDER.test(sender) || AUTOMATED_SENDER.test(mail.senderName)) {
        result.skippedAutomated++;
        continue;
      }

      const subject = mail.subject || "No Subject";
      const body = mail.body || "";

      let isDuplicate = false;
      try {
        const existing = await db
          .select({ id: atlasEmailDraftsTable.id })
          .from(atlasEmailDraftsTable)
          .where(
            and(
              eq(atlasEmailDraftsTable.workspaceId, workspaceId),
              eq(atlasEmailDraftsTable.sender, sender),
              eq(atlasEmailDraftsTable.subject, subject),
              eq(atlasEmailDraftsTable.incomingBody, body),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          isDuplicate = true;
        }
      } catch (dbErr: any) {
        logger.warn({ err: dbErr?.message }, "Deduplication query fallback in syncOutlookDesktop");
      }

      if (isDuplicate) {
        result.skippedDuplicate++;
        continue;
      }

      try {
        const draft = await processIncomingEmail(workspaceId, userId, sender, subject, body, styleExamples);
        result.emails.push(draft);
        result.drafted++;
      } catch (ingestErr: any) {
        logger.warn({ err: ingestErr?.message, subject, sender }, "Failed to process incoming email draft");
      }
    }

    result.success = true;
    logger.info(
      { scanned: result.scanned, drafted: result.drafted, skippedAutomated: result.skippedAutomated, skippedDuplicate: result.skippedDuplicate },
      "Outlook desktop sync complete",
    );
    return result;
  } catch (err: any) {
    logger.error({ err: err?.message }, "Outlook desktop sync failed");
    return { ...result, error: err?.message || "Outlook desktop sync failed" };
  }
}
