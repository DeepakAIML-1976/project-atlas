import { spawn, execSync } from "node:child_process";
import { createRequire } from "module";
import crypto from "crypto";

const require = createRequire("C:/Users/dpeng/Documents/Digital-Twin-Suite/lib/db/package.json");
const pg = require("pg");
const { Pool } = pg;

const WORKSPACE_ID = "1a39970a-abf0-48c3-8b89-08b669e80bbe";
const USER_ID = "user_deepak_sme";
const TARGET_ACCOUNT = "deepak.paranjape@kentplc.com";
const SINCE_DATE = "2026-10-18T00:00:00";

function isOutlookRunning() {
  if (process.platform !== "win32") return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq OUTLOOK.EXE" /NH', { encoding: "utf8", windowsHide: true });
    return out.toLowerCase().includes("outlook.exe");
  } catch {
    return false;
  }
}

function promptUserToOpenOutlook() {
  if (process.platform !== "win32") return;
  console.log("\n[PROMPT] Outlook is not running. Displaying Windows prompt to user...");
  try {
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.MessageBox]::Show(
        "Digital Twin Suite Notice:\`n\`nPlease open your Outlook desktop application to allow daily email and meetings calendar ingestion.",
        "Digital Twin Suite - Outlook Sync Required",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      )
    `;
    execSync(`powershell -NoProfile -Command "${ps.replace(/\r?\n/g, ' ')}"`, { windowsHide: false });
  } catch (err) {
    console.warn("Could not display dialog prompt:", err.message);
  }
}

const PS_SYNC_SCRIPT = `
$ErrorActionPreference = "Stop"
$targetAccount = "${TARGET_ACCOUNT}"
$sinceDateStr  = "${SINCE_DATE}"

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

# 1. READ INBOX
$inbox = $null
foreach ($f in $ns.Folders) {
  $n = $f.Name
  if ($n -notlike "*Online Archive*" -and $n -notlike "*Public Folders*" -and ($n -eq $targetAccount -or $n -like "*$targetAccount*" -or $targetAccount -like "*$n*")) {
    try {
      $tf = $f.Folders.Item("Inbox")
      if ($tf) { $inbox = $tf; break }
    } catch { }
  }
}
if (-not $inbox) { $inbox = $ns.GetDefaultFolder(6) }

$items = $inbox.Items
$items.Sort("[ReceivedTime]", $true)
$cutoff = [DateTime]::Parse($sinceDateStr)
$emailsList = New-Object System.Collections.ArrayList

foreach ($m in $items) {
  if ($emailsList.Count -ge 150) { break }
  try {
    if ($m.Class -ne 43) { continue }
    $when = $m.ReceivedTime
    if ($cutoff -and $when -lt $cutoff) { break }
    $email = $m.SenderEmailAddress
    if ($m.SenderEmailType -eq "EX") {
      try { $email = $m.Sender.GetExchangeUser().PrimarySmtpAddress } catch { }
    }
    $body = if ($m.Body) { ($m.Body -replace "\\s+", " ").Trim() } else { "" }
    if ($body.Length -gt 4000) { $body = $body.Substring(0, 4000) }
    [void]$emailsList.Add([pscustomobject]@{
      subject = [string]$m.Subject; senderName = [string]$m.SenderName; senderEmail = [string]$email
      to = [string]$m.To; receivedAt = $when.ToString("o"); body = $body
    })
  } catch { }
}

# 2. READ CALENDAR (Upcoming 14 Days)
$cal = $null
if ($targetAccount) {
  foreach ($f in $ns.Folders) {
    $n = $f.Name
    if ($n -notlike "*Online Archive*" -and $n -notlike "*Public Folders*" -and ($n -eq $targetAccount -or $n -like "*$targetAccount*" -or $targetAccount -like "*$n*")) {
      try {
        $tf = $f.Folders.Item("Calendar")
        if ($tf) { $cal = $tf; break }
      } catch { }
    }
  }
}
if (-not $cal) { $cal = $ns.GetDefaultFolder(9) }

$calItems = $cal.Items
$calItems.Sort("[Start]", $false)
$calItems.IncludeRecurrences = $true
$cStart = (Get-Date).AddDays(-1)
$cEnd   = (Get-Date).AddDays(14)
$cFilter = "[Start] >= '" + $cStart.ToString("g") + "' AND [Start] <= '" + $cEnd.ToString("g") + "'"
$rangeItems = $calItems.Restrict($cFilter)
$meetingsList = New-Object System.Collections.ArrayList

foreach ($m in $rangeItems) {
  try {
    $sub = [string]$m.Subject
    if (-not $sub) { $sub = "Untitled Meeting" }
    if ($sub -like "Canceled:*" -or $sub -like "Cancelled:*") { continue }

    $url = ""
    $platform = "teams"
    $body = if ($m.Body) { [string]$m.Body } else { "" }
    $loc = if ($m.Location) { [string]$m.Location } else { "" }
    $combined = $body + " " + $loc

    if ($combined -match 'https://teams\\.microsoft\\.com/l/meetup-join/[^\\s>"\\'']+') {
      $url = $matches[0]; $platform = "teams"
    } elseif ($combined -match 'https://[a-zA-Z0-9\\.\\-_]*zoom\\.us/j/[^\\s>"\\'']+') {
      $url = $matches[0]; $platform = "zoom"
    } elseif ($combined -match 'https://[a-zA-Z0-9\\.\\-_]*webex\\.com/[^\\s>"\\'']+') {
      $url = $matches[0]; $platform = "webex"
    } elseif ($combined -match 'https://meet\\.google\\.com/[^\\s>"\\'']+') {
      $url = $matches[0]; $platform = "meet"
    }

    [void]$meetingsList.Add([pscustomobject]@{
      subject = $sub; start = $m.Start.ToString("o"); end = $m.End.ToString("o")
      location = $loc; duration = [int]$m.Duration; meetingUrl = $url; platform = $platform
    })
  } catch { }
}

$payload = [pscustomobject]@{
  emails = @($emailsList)
  meetings = @($meetingsList)
}

$json = ConvertTo-Json -InputObject $payload -Depth 5 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json
`;

function cleanBody(text) {
  if (!text) return "";
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AUTOMATED_SENDER =
  /no-?reply|do-?not-?reply|mailer-daemon|postmaster|servicedesk|marketing|mailers|newsletter|promo|e?news|offers|campaign|bounce|broadcast/i;

async function executeSync() {
  console.log("========================================================");
  console.log("   DIGITAL TWIN SUITE - DAILY OUTLOOK INGESTION ENGINE   ");
  console.log("========================================================");

  // Check if Outlook is open
  if (!isOutlookRunning()) {
    promptUserToOpenOutlook();
    // Wait up to 30 seconds to see if user opens Outlook
    console.log("Waiting for user to open Outlook desktop application...");
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (isOutlookRunning()) {
        console.log("Outlook is now open! Proceeding with sync...");
        break;
      }
    }
  }

  if (!isOutlookRunning()) {
    console.log("Outlook was not opened. Daily sync skipped until Outlook is launched.");
    return;
  }

  console.log(`Connecting to desktop Outlook application (${TARGET_ACCOUNT})...`);
  const rawData = await new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SYNC_SCRIPT], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`PowerShell error: ${stderr}`));
      try {
        resolve(JSON.parse(stdout.trim() || '{"emails":[],"meetings":[]}'));
      } catch (err) {
        reject(err);
      }
    });
  });

  const emails = rawData.emails || [];
  const meetings = rawData.meetings || [];
  console.log(`Scanned ${emails.length} email(s) and ${meetings.length} active calendar meeting(s).`);

  const pool = new Pool({
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.fiqjwkaoowcfqbenqnxa",
    password: "Ripeace1976#",
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();
  try {
    // 1. INGEST EMAILS (cleanly, without automated draft)
    const existingEmailsRes = await client.query(
      "SELECT subject, sender, incoming_body FROM atlas_email_drafts WHERE workspace_id = $1",
      [WORKSPACE_ID],
    );
    const existingEmailKeys = new Set(
      existingEmailsRes.rows.map((r) => `${(r.subject || "").trim().toLowerCase()}:::${(r.sender || "").trim().toLowerCase()}`),
    );

    let emailsInserted = 0;
    for (const mail of emails) {
      const sender = mail.senderEmail ? `${mail.senderName} <${mail.senderEmail}>` : mail.senderName || "Unknown Sender";
      const subject = mail.subject || "No Subject";
      const key = `${subject.trim().toLowerCase()}:::${sender.trim().toLowerCase()}`;

      if (existingEmailKeys.has(key)) continue;

      const isProjectWorkflow = /aconex|bpo-w-btap|5884|5533/i.test(sender) || /5884|5533|alky|reactor|piping|flare|iso|valve|rfi|hazard/i.test(subject);
      if (!isProjectWorkflow && (AUTOMATED_SENDER.test(sender) || AUTOMATED_SENDER.test(mail.senderName))) {
        continue;
      }

      const id = crypto.randomUUID();
      const createdAt = mail.receivedAt ? new Date(mail.receivedAt) : new Date();
      await client.query(
        `INSERT INTO atlas_email_drafts (id, workspace_id, sender, subject, incoming_body, twin_draft_response, status, created_at)
         VALUES ($1, $2, $3, $4, $5, '', 'ingested', $6)`,
        [id, WORKSPACE_ID, sender, subject, cleanBody(mail.body), createdAt],
      );
      existingEmailKeys.add(key);
      emailsInserted++;
    }

    // 2. INGEST CALENDAR MEETINGS
    const existingMeetingsRes = await client.query(
      "SELECT meeting_title, scheduled_at FROM atlas_live_meetings WHERE workspace_id = $1",
      [WORKSPACE_ID],
    );
    const existingMeetingKeys = new Set(
      existingMeetingsRes.rows.map((r) => `${(r.meeting_title || "").trim().toLowerCase()}:::${r.scheduled_at ? new Date(r.scheduled_at).toISOString() : ""}`),
    );

    let meetingsInserted = 0;
    for (const m of meetings) {
      const scheduledDate = m.start ? new Date(m.start) : new Date();
      const key = `${m.subject.trim().toLowerCase()}:::${scheduledDate.toISOString()}`;

      if (existingMeetingKeys.has(key)) continue;

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO atlas_live_meetings (id, workspace_id, meeting_title, platform, meeting_url, location, scheduled_at, bot_status, bot_display_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, WORKSPACE_ID, m.subject, m.platform, m.meetingUrl || null, m.location || null, scheduledDate, 'idle', "Deepak's AI Representative (Atlas)", new Date()],
      );
      existingMeetingKeys.add(key);
      meetingsInserted++;
    }

    console.log("\n================ SYNC REPORT ================");
    console.log(`New Emails Ingested (No AI Draft): ${emailsInserted}`);
    console.log(`New Calendar Meetings Added:       ${meetingsInserted}`);
    console.log(`Database updated successfully on Supabase (syncs with Render).`);
    console.log("=============================================\n");
  } finally {
    client.release();
    await pool.end();
  }
}

executeSync().catch((err) => {
  console.error("Daily sync error:", err);
  process.exit(1);
});