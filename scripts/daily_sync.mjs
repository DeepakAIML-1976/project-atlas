import { spawn, execSync } from "node:child_process";
import { createRequire } from "module";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";

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
    if (out.toLowerCase().includes("outlook.exe")) return true;
  } catch {}
  try {
    const ps = execSync('powershell.exe -NoProfile -Command "Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"', { encoding: "utf8", windowsHide: true }).trim();
    if (ps.length > 0) return true;
  } catch {}
  return false;
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

# 1b. READ SENT ITEMS (for Context Verification)
$sentList = New-Object System.Collections.ArrayList
try {
  $sent = $ns.GetDefaultFolder(5)
  if ($sent) {
    $sentItems = $sent.Items
    $sentItems.Sort("[SentOn]", $true)
    foreach ($m in $sentItems) {
      if ($sentList.Count -ge 150) { break }
      try {
        if ($m.Class -ne 43) { continue }
        $when = $m.SentOn
        $to = [string]$m.To
        $body = if ($m.Body) { ($m.Body -replace "\\s+", " ").Trim() } else { "" }
        if ($body.Length -gt 4000) { $body = $body.Substring(0, 4000) }
        [void]$sentList.Add([pscustomobject]@{
          subject = [string]$m.Subject; to = $to; sentAt = $when.ToString("o"); body = $body
        })
      } catch { }
    }
  }
} catch { }

$payload = [pscustomobject]@{
  emails = @($emailsList)
  sentEmails = @($sentList)
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
  const outlookOpen = isOutlookRunning();
  let emails = [];
  let sentEmails = [];
  let meetings = [];

  if (outlookOpen) {
    console.log(`[STATUS] Outlook is RUNNING in Task Manager. Connecting to desktop Outlook (${TARGET_ACCOUNT})...`);
    try {
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
            resolve(JSON.parse(stdout.trim() || '{"emails":[],"meetings":[],"sentEmails":[]}'));
          } catch (err) {
            reject(err);
          }
        });
      });

      emails = rawData.emails || [];
      sentEmails = rawData.sentEmails || [];
      meetings = rawData.meetings || [];
      console.log(`Scanned ${emails.length} incoming email(s), ${sentEmails.length} sent email(s), and ${meetings.length} active calendar meeting(s).`);
    } catch (err) {
      console.warn("Could not extract from Outlook:", err.message);
    }
  } else {
    console.log("[STATUS] Outlook is NOT running in Task Manager. Skipping Outlook ingestion; proceeding with Teams & Zoom sync.");
  }

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
    // 0. RECORD WORKSTATION APP HEALTH (Outlook, Teams, Zoom)
    let ol = outlookOpen;
    let tm = false;
    let zm = false;
    try {
      const taskOut = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true }).toLowerCase();
      ol = ol || taskOut.includes('outlook.exe');
      tm = taskOut.includes('teams.exe') || taskOut.includes('ms-teams.exe');
      zm = taskOut.includes('zoom.exe');
    } catch {}
    if (!tm || !zm) {
      try {
        const psOut = execSync('powershell.exe -NoProfile -Command "Get-Process -Name OUTLOOK, ms-teams, teams, Zoom -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"', { encoding: 'utf8', windowsHide: true }).toLowerCase();
        if (psOut.includes('outlook')) ol = true;
        if (psOut.includes('teams')) tm = true;
        if (psOut.includes('zoom')) zm = true;
      } catch {}
    }
    try {
      const healthId = "health_" + WORKSPACE_ID;
      await client.query(`
        INSERT INTO atlas_app_health (id, workspace_id, device_name, outlook_running, teams_running, zoom_running, account_email, last_heartbeat)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO UPDATE SET
          outlook_running = EXCLUDED.outlook_running,
          teams_running = EXCLUDED.teams_running,
          zoom_running = EXCLUDED.zoom_running,
          last_heartbeat = NOW()
      `, [healthId, WORKSPACE_ID, 'Windows Workstation', ol, tm, zm, TARGET_ACCOUNT]);
      console.log(`[APP HEALTH] Heartbeat updated -> Outlook: ${ol ? 'RUNNING' : 'CLOSED'}, Teams: ${tm ? 'RUNNING' : 'CLOSED'}, Zoom: ${zm ? 'RUNNING' : 'CLOSED'}`);
    } catch (e) {
      console.warn("Could not record app health:", e.message);
    }

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

    // 1b. INGEST OUTLOOK SENT EMAILS (for Tier 2 Context Verification)
    const existingSentRes = await client.query(
      "SELECT subject, recipient, sent_at FROM atlas_sent_emails WHERE workspace_id = $1",
      [WORKSPACE_ID],
    );
    const existingSentKeys = new Set(
      existingSentRes.rows.map((r) => `${(r.subject || "").trim().toLowerCase()}:::${(r.recipient || "").trim().toLowerCase()}:::${r.sent_at ? new Date(r.sent_at).toISOString() : ""}`),
    );

    let sentEmailsInserted = 0;
    for (const mail of sentEmails) {
      const recipient = mail.to || "Unknown Recipient";
      const subject = mail.subject || "No Subject";
      const sentAt = mail.sentAt ? new Date(mail.sentAt) : new Date();
      const key = `${subject.trim().toLowerCase()}:::${recipient.trim().toLowerCase()}:::${sentAt.toISOString()}`;

      if (existingSentKeys.has(key)) continue;

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO atlas_sent_emails (id, workspace_id, recipient, subject, sent_body, sent_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [id, WORKSPACE_ID, recipient, subject, cleanBody(mail.body), sentAt],
      );
      existingSentKeys.add(key);
      sentEmailsInserted++;
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

    // 3. INGEST ZOOM & TEAMS CHAT MESSAGES (Filtered to DMs & addressed to Deepak)
    let chatMessagesInserted = 0;
    try {
      const isDeepak = (s) => {
        if (!s) return false;
        const l = s.toLowerCase();
        return l.includes("deepak.paranjape") || l.includes("deepak paranjape") || l === "deepak" || l.includes("dpengineering");
      };

      const isTargeted = (sender, recipient, msg) => {
        if (isDeepak(sender)) return false;
        if (recipient && isDeepak(recipient)) return true;
        const text = msg.trim();
        if (/@deepak(\b|\s|paranjape)/i.test(text)) return true;
        if (text.toLowerCase().includes("deepak.paranjape@kentplc.com")) return true;
        const addressPattern = /(?:^|[\r\n.!?]\s*)(?:hi|hello|hey|dear)?\s*@?deepak\b(?:\s*paranjape)?(?:\s*[,:\-–—]|\s+(?:please|could|can|what|how|where|when|why|is|are|do|did|will|would|check|confirm|review|verify|note|regards|thanks|thank))/i;
        if (addressPattern.test(text)) return true;
        if (/^@?deepak\b/i.test(text)) return true;
        return false;
      };

      const zoomBase = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Documents", "Zoom") : "";
      if (fs.existsSync(zoomBase)) {
        const folders = fs.readdirSync(zoomBase, { withFileTypes: true });
        for (const f of folders) {
          if (!f.isDirectory()) continue;
          const chatFile = path.join(zoomBase, f.name, "meeting_saved_chat.txt");
          if (!fs.existsSync(chatFile)) continue;
          const lines = fs.readFileSync(chatFile, "utf8").split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+From\s+([^:]+?)(?:\s+to\s+([^:]+?))?\s*:\s*(.+)$/i);
            if (match) {
              const sender = match[2].trim();
              const recipient = match[3] ? match[3].trim() : "";
              const msg = match[4].trim();

              if (!isTargeted(sender, recipient, msg)) continue;

              const msgId = crypto.createHash("sha256").update("zoom:::" + f.name + ":::" + sender + ":::" + msg).digest("hex").substring(0, 32);

              const existCheck = await client.query("SELECT id FROM atlas_chat_drafts WHERE workspace_id = $1 AND message_id = $2", [WORKSPACE_ID, msgId]);
              if (existCheck.rows.length === 0) {
                await client.query(`
                  INSERT INTO atlas_chat_drafts (id, workspace_id, platform, chat_id, message_id, sender_name, incoming_message, twin_draft_response, status, created_at)
                  VALUES ($1, $2, 'zoom', $3, $4, $5, $6, '', 'ingested', NOW())
                `, [crypto.randomUUID(), WORKSPACE_ID, f.name, msgId, sender, msg]);
                chatMessagesInserted++;
              }
            }
          }
        }
      }

      // 4. SCAN TEAMS CHATS DIRECTLY FROM RUNNING TEAMS APP (No MS Graph / No Admin rights needed)
      try {
        const isTeamsActive = tm; // from tasklist check earlier
        if (!isTeamsActive) {
          console.log("[TEAMS] Microsoft Teams is not currently running in system tasks. Open Teams to ingest chat messages.");
        } else {
          console.log("[TEAMS] Scanning messages directly from running Microsoft Teams desktop application (with Snappy decompression)...");
          const localApp = process.env.LOCALAPPDATA || "";
          const candidateDirs = [
            path.join(localApp, "Packages", "MSTeams_8wekyb3d8bbwe", "LocalCache", "Microsoft", "MSTeams", "EBWebView", "WV2Profile_tfw", "IndexedDB", "https_teams.microsoft.com_0.indexeddb.leveldb"),
            path.join(localApp, "Packages", "MSTeams_8wekyb3d8bbwe", "LocalCache", "Microsoft", "MSTeams", "EBWebView", "WV2Profile_tfl", "IndexedDB", "https_teams.microsoft.com_0.indexeddb.leveldb"),
            path.join(process.env.APPDATA || "", "Microsoft", "Teams", "IndexedDB", "https_teams.microsoft.com_0.indexeddb.leveldb"),
          ];

          function readVarint64(buf, pos) {
            let res = 0n;
            let shift = 0n;
            while (pos < buf.length) {
              const b = BigInt(buf[pos++]);
              res |= (b & 0x7fn) << shift;
              if ((b & 0x80n) === 0n) break;
              shift += 7n;
            }
            return { val: res, pos };
          }

          function decompressSnappy(buf) {
            let pos = 0;
            let uncompressedLen = 0;
            let shift = 0;
            while (pos < buf.length) {
              const b = buf[pos++];
              uncompressedLen |= (b & 0x7f) << shift;
              if ((b & 0x80) === 0) break;
              shift += 7;
            }
            const out = Buffer.alloc(uncompressedLen);
            let outPos = 0;
            while (pos < buf.length && outPos < uncompressedLen) {
              const tag = buf[pos++];
              const element = tag & 0x03;
              if (element === 0) {
                let len = tag >> 2;
                if (len < 60) len += 1;
                else if (len === 60) len = buf[pos++] + 1;
                else if (len === 61) { len = buf.readUInt16LE(pos) + 1; pos += 2; }
                else if (len === 62) { len = buf.readUIntLE(pos, 3) + 1; pos += 3; }
                else if (len === 63) { len = buf.readUInt32LE(pos) + 1; pos += 4; }
                if (pos + len > buf.length || outPos + len > uncompressedLen) break;
                buf.copy(out, outPos, pos, pos + len);
                pos += len;
                outPos += len;
              } else if (element === 1) {
                const len = ((tag >> 2) & 0x07) + 4;
                const offset = ((tag >> 5) << 8) | buf[pos++];
                for (let i = 0; i < len; i++) { out[outPos] = out[outPos - offset]; outPos++; }
              } else if (element === 2) {
                const len = (tag >> 2) + 1;
                const offset = buf.readUInt16LE(pos);
                pos += 2;
                for (let i = 0; i < len; i++) { out[outPos] = out[outPos - offset]; outPos++; }
              } else if (element === 3) {
                const len = (tag >> 2) + 1;
                const offset = buf.readUInt32LE(pos);
                pos += 4;
                for (let i = 0; i < len; i++) { out[outPos] = out[outPos - offset]; outPos++; }
              }
            }
            return out.slice(0, outPos);
          }

          function parseLevelDbBlocks(buf) {
            const blocks = [];
            if (buf.length < 48) return blocks;
            const footer = buf.slice(buf.length - 48);
            const magic = footer.slice(40).toString("hex");
            if (magic !== "57fb808b247547db") return blocks;
            try {
              let p = 0;
              const metaHandle = readVarint64(footer, p); p = metaHandle.pos;
              const metaSize = readVarint64(footer, p); p = metaSize.pos;
              const indexOffset = readVarint64(footer, p); p = indexOffset.pos;
              const indexSize = readVarint64(footer, p);
              const idxOff = Number(indexOffset.val);
              const idxSz = Number(indexSize.val);
              if (idxOff + idxSz + 5 > buf.length) return blocks;
              const idxType = buf[idxOff + idxSz];
              let idxBlockData = buf.slice(idxOff, idxOff + idxSz);
              if (idxType === 1) idxBlockData = decompressSnappy(idxBlockData);
              if (idxBlockData.length < 4) return blocks;
              const numRestarts = idxBlockData.readUInt32LE(idxBlockData.length - 4);
              const restartsOffset = idxBlockData.length - 4 - numRestarts * 4;
              let pos = 0;
              while (pos < restartsOffset && pos < idxBlockData.length) {
                const sharedLen = readVarint64(idxBlockData, pos); pos = sharedLen.pos;
                const nonSharedLen = readVarint64(idxBlockData, pos); pos = nonSharedLen.pos;
                const valLen = readVarint64(idxBlockData, pos); pos = valLen.pos;
                pos += Number(nonSharedLen.val);
                const val = idxBlockData.slice(pos, pos + Number(valLen.val));
                pos += Number(valLen.val);
                let vp = 0;
                const bOffset = readVarint64(val, vp); vp = bOffset.pos;
                const bSize = readVarint64(val, vp);
                const blockOff = Number(bOffset.val);
                const blockSize = Number(bSize.val);
                if (blockOff + blockSize <= buf.length) {
                  const compressionType = buf[blockOff + blockSize];
                  let data = buf.slice(blockOff, blockOff + blockSize);
                  if (compressionType === 1) data = decompressSnappy(data);
                  blocks.push(data);
                }
              }
            } catch {}
            return blocks;
          }

          function isAddressed(text, isDirect) {
            if (isDirect) return true;
            if (/@deepak(\b|\s|paranjape)/i.test(text)) return true;
            if (text.toLowerCase().includes("deepak.paranjape@kentplc.com")) return true;
            const addressPattern = /(?:^|[\r\n.!?]\s*)(?:hi|hello|hey|dear)?\s*@?deepak\b(?:\s*paranjape)?(?:\s*[,:\-–—]|\s+(?:please|could|can|what|how|where|when|why|is|are|do|did|will|would|check|confirm|review|verify|note|regards|thanks|thank))/i;
            if (addressPattern.test(text)) return true;
            if (/^@?deepak\b/i.test(text)) return true;
            return false;
          }

          const needle = Buffer.from([0x22, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x22]);
          const seenLocalHashes = new Set();

          for (const dir of candidateDirs) {
            if (!fs.existsSync(dir)) continue;
            let files = [];
            try {
              files = fs.readdirSync(dir).filter(f => f.endsWith(".ldb") || f.endsWith(".log"));
            } catch { continue; }

            for (const file of files) {
              try {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (Date.now() - stat.mtimeMs > 60 * 86400 * 1000) continue;

                const fileBuf = fs.readFileSync(fullPath);
                const blocks = file.endsWith(".ldb") ? parseLevelDbBlocks(fileBuf) : [fileBuf];

                for (const b of blocks) {
                  let pos = 0;
                  while ((pos = b.indexOf(needle, pos)) !== -1) {
                    const marker = pos;
                    pos += needle.length;

                    let p = pos;
                    let len = 0;
                    let shift = 0;
                    while (p < b.length) {
                      const byte = b[p++];
                      len |= (byte & 0x7f) << shift;
                      if ((byte & 0x80) === 0) break;
                      shift += 7;
                    }

                    if (len > 3 && len < 4000 && p + len <= b.length) {
                      const text = b.slice(p, p + len).toString("utf8");
                      let clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                      if (clean.length < 4) continue;
                      if (clean.startsWith("8:orgid:") || clean.startsWith("1785") || clean.startsWith("28:app:")) continue;
                      if (clean.includes("AI Representative") || clean.includes("my twin is currently offline") || clean.includes("🔔 [Digital Twin") || clean.includes("i am an AI representative")) continue;

                      const pre = b.slice(Math.max(0, marker - 600), marker).toString("latin1");
                      const post = b.slice(marker, Math.min(b.length, marker + 600)).toString("latin1");

                      // Rule 1: Never ingest self-sent messages
                      if (pre.includes("isSentByCurrentUserT") || post.includes("isSentByCurrentUserT")) continue;

                      const m = pre.match(/imDisplayName[^\w]{1,4}([A-Z][a-zA-Z\s\.\-]{2,35})/i) ||
                                pre.match(/fromDisplayNameInToken[^\w]{1,4}([A-Z][a-zA-Z\s\.\-]{2,35})/i);
                      const sender = m ? m[1].replace(/[^\x20-\x7E]/g, "").trim() : "Colleague";

                      if (isDeepak(sender)) continue;

                      // Extract chat ID
                      let chatId = "Teams Direct Chat";
                      const convMatch = (pre + post).match(/19:[a-zA-Z0-9_\-]+@[a-zA-Z0-9_\.]+/);
                      if (convMatch) chatId = convMatch[0];

                      const isDirect = chatId.includes("unq.gbl.spaces") || chatId.includes("uni01_") || pre.includes("personal_dm") || pre.includes("oneOnOne");

                      // Rule 2: Only 1-on-1 DMs or messages specifically addressed to Deepak
                      if (!isAddressed(clean, isDirect)) continue;

                      clean = clean.replace(/[^\x20-\x7E\r\n]/g, "").trim();
                      if (clean.length < 4) continue;

                      const hash = crypto.createHash("md5").update(`${sender}:::${clean}`).digest("hex");
                      if (seenLocalHashes.has(hash)) continue;
                      seenLocalHashes.add(hash);

                      const msgId = `teams_desktop_${hash.substring(0, 24)}`;
                      const existCheck = await client.query("SELECT id FROM atlas_chat_drafts WHERE workspace_id = $1 AND message_id = $2", [WORKSPACE_ID, msgId]);
                      if (existCheck.rows.length === 0) {
                        await client.query(`
                          INSERT INTO atlas_chat_drafts (id, workspace_id, platform, chat_id, message_id, sender_name, sender_email, incoming_message, twin_draft_response, status, created_at)
                          VALUES ($1, $2, 'teams', $3, $4, $5, null, $6, '', 'ingested', $7)
                        `, [
                          crypto.randomUUID(),
                          WORKSPACE_ID,
                          chatId,
                          msgId,
                          sender,
                          clean,
                          stat.mtime || new Date(),
                        ]);
                        chatMessagesInserted++;
                      }
                    }
                  }
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.warn("Notice: Desktop Teams chat scan:", e.message);
      }
    } catch (e) {
      console.warn("Notice: Chat scan:", e.message);
    }

    console.log("\n================ SYNC REPORT ================");
    console.log(`New Emails Ingested (No AI Draft):   ${emailsInserted}`);
    console.log(`New Sent Emails (Context Grounding): ${sentEmailsInserted}`);
    console.log(`New Calendar Meetings Added:         ${meetingsInserted}`);
    console.log(`New Teams & Zoom Messages Ingested:  ${chatMessagesInserted}`);
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