import { spawn } from "node:child_process";
import { createRequire } from "module";
import crypto from "crypto";

const require = createRequire("C:/Users/dpeng/Documents/Digital-Twin-Suite/lib/db/package.json");
const pg = require("pg");
const { Pool } = pg;

const WORKSPACE_ID = "1a39970a-abf0-48c3-8b89-08b669e80bbe";
const USER_ID = "user_deepak_sme";
const TARGET_ACCOUNT = "deepak.paranjape@kentplc.com";
const SINCE_DATE = "2026-10-18T00:00:00";

const PS_SCRIPT = `
$ErrorActionPreference = "Stop"
$targetAccount = "${TARGET_ACCOUNT}"
$sinceDateStr = "${SINCE_DATE}"

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

$folder = $null
foreach ($f in $ns.Folders) {
  $n = $f.Name
  if ($n -notlike "*Online Archive*" -and $n -notlike "*Public Folders*" -and ($n -eq $targetAccount -or $n -like "*$targetAccount*" -or $targetAccount -like "*$n*")) {
    try {
      $targetFolder = $f.Folders.Item("Inbox")
      if ($targetFolder) { $folder = $targetFolder; break }
    } catch { }
  }
}
if (-not $folder) {
  $folder = $ns.GetDefaultFolder(6)
}

$items = $folder.Items
$items.Sort("[ReceivedTime]", $true)

$cutoff = [DateTime]::Parse($sinceDateStr)
$out = New-Object System.Collections.ArrayList

foreach ($m in $items) {
  if ($out.Count -ge 150) { break }
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
    
    [void]$out.Add([pscustomobject]@{
      subject = [string]$m.Subject
      senderName = [string]$m.SenderName
      senderEmail = [string]$email
      to = [string]$m.To
      receivedAt = $when.ToString("o")
      unread = [bool]$m.UnRead
      body = $body
    })
  } catch { }
}

$json = ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
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

async function fetchFromOutlook() {
  return new Promise((resolve, reject) => {
    console.log("Reading Outlook desktop messages via COM MAPI...");
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT], {
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`PowerShell failed: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim() || "[]");
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function run() {
  const emails = await fetchFromOutlook();
  console.log(`Fetched ${emails.length} email(s) from Outlook desktop inbox received since ${SINCE_DATE}.`);

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
  let inserted = 0;
  let skippedAutomated = 0;

  try {
    for (const mail of emails) {
      const sender = mail.senderEmail
        ? `${mail.senderName} <${mail.senderEmail}>`
        : mail.senderName || "Unknown Sender";

      const subject = mail.subject || "No Subject";
      const isProjectWorkflow = /aconex|bpo-w-btap|5884|5533/i.test(sender) || /5884|5533|alky|reactor|piping|flare|iso|valve|rfi|hazard/i.test(subject);

      if (!isProjectWorkflow && (AUTOMATED_SENDER.test(sender) || AUTOMATED_SENDER.test(mail.senderName))) {
        skippedAutomated++;
        continue;
      }

      const incomingBody = cleanBody(mail.body);
      const id = crypto.randomUUID();
      const createdAt = mail.receivedAt ? new Date(mail.receivedAt) : new Date();

      await client.query(
        `INSERT INTO atlas_email_drafts 
          (id, workspace_id, sender, subject, incoming_body, twin_draft_response, reasoning, confidence, status, is_llm_fallback, authorized_at, created_at)
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          WORKSPACE_ID,
          sender,
          subject,
          incomingBody,
          "", // No AI draft generated yet
          null, // No reasoning yet
          null, // No confidence yet
          "ingested", // Ingested - awaiting user draft request
          false,
          null,
          createdAt,
        ],
      );

      await client.query(
        `INSERT INTO atlas_activity (id, workspace_id, user_id, action, record_type, record_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          WORKSPACE_ID,
          USER_ID,
          "ingested_email",
          "email_draft",
          id,
          createdAt,
        ],
      );

      inserted++;
    }

    const check = await client.query(
      "SELECT COUNT(*) FROM atlas_email_drafts WHERE workspace_id = $1",
      [WORKSPACE_ID],
    );

    console.log(`\n================ INGESTION SUMMARY ================`);
    console.log(`Total Outlook scanned: ${emails.length}`);
    console.log(`Skipped non-engineering automated blasts: ${skippedAutomated}`);
    console.log(`Successfully ingested into Supabase: ${inserted}`);
    console.log(`Total email drafts in workspace now: ${check.rows[0].count}`);
    console.log(`====================================================\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
