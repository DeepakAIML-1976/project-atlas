import { spawn, execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { db, atlasLiveMeetingsTable } from "@workspace/db";
import { logger } from "../logger.js";

export interface CalendarMeetingItem {
  subject: string;
  start: string;
  end: string;
  location: string;
  duration: number;
  meetingUrl: string;
  platform: "teams" | "zoom" | "webex" | "meet" | "other";
  organizer: string;
  isCanceled: boolean;
}

export function isOutlookProcessRunning(): boolean {
  if (process.platform !== "win32") return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq OUTLOOK.EXE" /NH', { encoding: "utf8", windowsHide: true });
    return out.toLowerCase().includes("outlook.exe");
  } catch {
    return false;
  }
}

const PS_CALENDAR_SCRIPT = `
$ErrorActionPreference = "Stop"
$daysAhead = [int]$env:ATLAS_CAL_DAYS
if ($daysAhead -le 0) { $daysAhead = 14 }
$targetAccount = [string]$env:ATLAS_CAL_ACCOUNT

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

$folder = $null
if ($targetAccount) {
  foreach ($f in $ns.Folders) {
    $n = $f.Name
    if ($n -notlike "*Online Archive*" -and $n -notlike "*Public Folders*" -and ($n -eq $targetAccount -or $n -like "*$targetAccount*" -or $targetAccount -like "*$n*")) {
      try {
        $tf = $f.Folders.Item("Calendar")
        if ($tf) { $folder = $tf; break }
      } catch { }
    }
  }
}
if (-not $folder) {
  $folder = $ns.GetDefaultFolder(9)
}

$items = $folder.Items
$items.Sort("[Start]", $false)
$items.IncludeRecurrences = $true

$start = (Get-Date).AddDays(-1)
$end   = (Get-Date).AddDays($daysAhead)
$filter = "[Start] >= '" + $start.ToString("g") + "' AND [Start] <= '" + $end.ToString("g") + "'"

$rangeItems = $items.Restrict($filter)
$out = New-Object System.Collections.ArrayList

foreach ($m in $rangeItems) {
  try {
    $sub = [string]$m.Subject
    if (-not $sub) { $sub = "Untitled Meeting" }
    $isCanceled = ($sub -like "Canceled:*" -or $sub -like "Cancelled:*")
    if ($isCanceled) { continue }

    $url = ""
    $platform = "teams"
    $body = if ($m.Body) { [string]$m.Body } else { "" }
    $loc = if ($m.Location) { [string]$m.Location } else { "" }
    $combined = $body + " " + $loc

    if ($combined -match 'https://teams\\.microsoft\\.com/l/meetup-join/[^\\s>"\\'']+') {
      $url = $matches[0]
      $platform = "teams"
    } elseif ($combined -match 'https://[a-zA-Z0-9\\.\\-_]*zoom\\.us/j/[^\\s>"\\'']+') {
      $url = $matches[0]
      $platform = "zoom"
    } elseif ($combined -match 'https://[a-zA-Z0-9\\.\\-_]*webex\\.com/[^\\s>"\\'']+') {
      $url = $matches[0]
      $platform = "webex"
    } elseif ($combined -match 'https://meet\\.google\\.com/[^\\s>"\\'']+') {
      $url = $matches[0]
      $platform = "meet"
    }

    $organizer = ""
    try { $organizer = [string]$m.Organizer } catch { }

    [void]$out.Add([pscustomobject]@{
      subject = $sub
      start = $m.Start.ToString("o")
      end = $m.End.ToString("o")
      location = $loc
      duration = [int]$m.Duration
      meetingUrl = $url
      platform = $platform
      organizer = $organizer
      isCanceled = $isCanceled
    })
  } catch { }
}

$json = ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json
`;

export async function readOutlookCalendar(
  daysAhead: number = 14,
  targetAccount: string = "deepak.paranjape@kentplc.com",
): Promise<CalendarMeetingItem[]> {
  if (process.platform !== "win32") {
    throw new Error("Desktop Outlook calendar reading is only available on Windows workstations with Outlook installed.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_CALENDAR_SCRIPT],
      {
        env: {
          ...process.env,
          ATLAS_CAL_DAYS: String(daysAhead),
          ATLAS_CAL_ACCOUNT: targetAccount,
        },
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Outlook calendar read timed out after 60s"));
    }, 60_000);

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Outlook calendar read failed (exit ${code}): ${stderr.trim().slice(0, 300)}`));
        return;
      }
      try {
        const text = stdout.trim();
        const parsed = text ? JSON.parse(text) : [];
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err: any) {
        reject(new Error(`Could not parse Outlook calendar output: ${err?.message}`));
      }
    });
  });
}

export async function syncOutlookCalendar(
  workspaceId: string,
  daysAhead: number = 14,
  targetAccount: string = "deepak.paranjape@kentplc.com",
) {
  try {
    const meetings = await readOutlookCalendar(daysAhead, targetAccount);
    logger.info({ count: meetings.length, workspaceId }, "Scanned Outlook calendar items");

    // Load existing live meetings for workspace to deduplicate
    const existing = await db
      .select({
        id: atlasLiveMeetingsTable.id,
        meetingTitle: atlasLiveMeetingsTable.meetingTitle,
        scheduledAt: atlasLiveMeetingsTable.scheduledAt,
      })
      .from(atlasLiveMeetingsTable)
      .where(eq(atlasLiveMeetingsTable.workspaceId, workspaceId));

    const existingKeys = new Set(
      existing.map(
        (m) =>
          `${(m.meetingTitle || "").trim().toLowerCase()}:::${m.scheduledAt ? new Date(m.scheduledAt).toISOString() : ""}`,
      ),
    );

    let added = 0;
    const syncedMeetings = [];

    for (const m of meetings) {
      const scheduledDate = m.start ? new Date(m.start) : new Date();
      const key = `${m.subject.trim().toLowerCase()}:::${scheduledDate.toISOString()}`;

      if (existingKeys.has(key)) {
        continue;
      }

      const [record] = await db
        .insert(atlasLiveMeetingsTable)
        .values({
          workspaceId,
          meetingTitle: m.subject,
          platform: m.platform,
          meetingUrl: m.meetingUrl || null,
          location: m.location || null,
          scheduledAt: scheduledDate,
          botStatus: "idle", // Not assigned to bot by default - user selects
          botDisplayName: "Deepak's AI Representative (Atlas)",
        })
        .returning();

      existingKeys.add(key);
      syncedMeetings.push(record);
      added++;
    }

    return {
      success: true,
      scanned: meetings.length,
      added,
      total: existing.length + added,
      meetings: syncedMeetings,
    };
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to sync Outlook calendar");
    return {
      success: false,
      error: err?.message || "Failed to sync Outlook calendar",
      scanned: 0,
      added: 0,
    };
  }
}