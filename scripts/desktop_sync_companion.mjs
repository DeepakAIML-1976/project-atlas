import { execSync } from "node:child_process";
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const require = createRequire("C:/Users/dpeng/Documents/Digital-Twin-Suite/lib/db/package.json");
const { Pool } = require("pg");

const WORKSPACE_ID = "1a39970a-abf0-48c3-8b89-08b669e80bbe";
const TARGET_ACCOUNT = "deepak.paranjape@kentplc.com";

const pool = new Pool({
  host: "aws-0-ap-northeast-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.fiqjwkaoowcfqbenqnxa",
  password: "Ripeace1976#",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

function isDeepak(s) {
  if (!s) return false;
  const l = s.toLowerCase();
  return l.includes("deepak.paranjape") || l.includes("deepak paranjape") || l === "deepak" || l.includes("dpengineering");
}

function checkTasks() {
  if (process.platform !== "win32") return { ol: false, tm: false, zm: false };
  try {
    const out = execSync("tasklist /FO CSV /NH", { encoding: "utf8", windowsHide: true }).toLowerCase();
    const ol = out.includes("outlook.exe");
    const tm = out.includes("ms-teams.exe") || out.includes("teams.exe");
    const zm = out.includes("zoom.exe");
    return { ol, tm, zm };
  } catch {
    return { ol: false, tm: false, zm: false };
  }
}

async function syncCycle() {
  const { ol, tm, zm } = checkTasks();
  const timestamp = new Date().toLocaleTimeString();

  const client = await pool.connect();
  try {
    // 1. Update Real-Time App Health Heartbeat in Supabase
    const healthId = "health_" + WORKSPACE_ID;
    await client.query(`
      INSERT INTO atlas_app_health (id, workspace_id, device_name, outlook_running, teams_running, zoom_running, account_email, last_heartbeat)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO UPDATE SET
        outlook_running = EXCLUDED.outlook_running,
        teams_running = EXCLUDED.teams_running,
        zoom_running = EXCLUDED.zoom_running,
        last_heartbeat = NOW()
    `, [healthId, WORKSPACE_ID, "Windows Workstation", ol, tm, zm, TARGET_ACCOUNT]);

    // Status Log
    console.log(`[${timestamp}] Heartbeat -> Outlook: ${ol ? "RUNNING" : "CLOSED"}, Teams: ${tm ? "RUNNING" : "CLOSED"}, Zoom: ${zm ? "RUNNING" : "CLOSED"}`);

    // 2. Direct Teams Ingestion (if running in Task Manager)
    if (tm) {
      const localApp = process.env.LOCALAPPDATA || "";
      const candidateDirs = [
        path.join(localApp, "Packages", "MSTeams_8wekyb3d8bbwe", "LocalCache", "Microsoft", "MSTeams", "EBWebView", "WV2Profile_tfw", "IndexedDB", "https_teams.microsoft.com_0.indexeddb.leveldb"),
        path.join(localApp, "Packages", "MSTeams_8wekyb3d8bbwe", "LocalCache", "Microsoft", "MSTeams", "EBWebView", "WV2Profile_tfl", "IndexedDB", "https_teams.microsoft.com_0.indexeddb.leveldb"),
        path.join(process.env.APPDATA || "", "Microsoft", "Teams", "IndexedDB", "https_teams.microsoft.com_0.indexeddb.leveldb"),
      ];

      const needle = Buffer.from([0x22, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x22]);
      let teamsAdded = 0;

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
            if (Date.now() - stat.mtimeMs > 14 * 86400 * 1000) continue;

            const b = fs.readFileSync(fullPath);
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
                if (clean.length < 5) continue;
                if (clean.startsWith("8:orgid:") || clean.startsWith("1785") || clean.startsWith("28:app:")) continue;
                if (clean.includes("AI Representative") || clean.includes("my twin is currently offline") || clean.includes("🔔 [Digital Twin")) continue;

                const pre = b.slice(Math.max(0, marker - 500), marker).toString("latin1");
                const m = pre.match(/imDisplayName[^\w]{1,4}([A-Z][a-zA-Z\s\.\-]{2,35})/i);
                const sender = m ? m[1].replace(/[^\x20-\x7E]/g, "").trim() : "Colleague";

                // Never ingest messages originated by Deepak
                if (isDeepak(sender)) continue;

                clean = clean.replace(/[^\x20-\x7E\r\n]/g, "").trim();
                if (clean.length < 4) continue;

                const hash = crypto.createHash("md5").update(`${sender}:::${clean}`).digest("hex");
                const msgId = `teams_desktop_${hash.substring(0, 24)}`;

                const existCheck = await client.query("SELECT id FROM atlas_chat_drafts WHERE workspace_id = $1 AND message_id = $2", [WORKSPACE_ID, msgId]);
                if (existCheck.rows.length === 0) {
                  await client.query(`
                    INSERT INTO atlas_chat_drafts (id, workspace_id, platform, chat_id, message_id, sender_name, sender_email, incoming_message, twin_draft_response, status, created_at)
                    VALUES ($1, $2, 'teams', 'Teams Direct Chat', $3, $4, null, $5, '', 'ingested', $6)
                  `, [crypto.randomUUID(), WORKSPACE_ID, msgId, sender, clean, stat.mtime || new Date()]);
                  teamsAdded++;
                }
              }
            }
          } catch {}
        }
      }
      if (teamsAdded > 0) {
        console.log(`[${timestamp}] Ingested ${teamsAdded} new Teams message(s) from running Teams app.`);
      }
    }

    // 3. Direct Zoom Ingestion (if running in Task Manager)
    if (zm) {
      const zoomBase = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Documents", "Zoom") : "";
      if (fs.existsSync(zoomBase)) {
        let zoomAdded = 0;
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
              const msg = match[4].trim();
              if (isDeepak(sender)) continue;

              const msgId = crypto.createHash("sha256").update("zoom:::" + f.name + ":::" + sender + ":::" + msg).digest("hex").substring(0, 32);
              const existCheck = await client.query("SELECT id FROM atlas_chat_drafts WHERE workspace_id = $1 AND message_id = $2", [WORKSPACE_ID, msgId]);
              if (existCheck.rows.length === 0) {
                await client.query(`
                  INSERT INTO atlas_chat_drafts (id, workspace_id, platform, chat_id, message_id, sender_name, incoming_message, twin_draft_response, status, created_at)
                  VALUES ($1, $2, 'zoom', $3, $4, $5, $6, '', 'ingested', NOW())
                `, [crypto.randomUUID(), WORKSPACE_ID, f.name, msgId, sender, msg]);
                zoomAdded++;
              }
            }
          }
        }
        if (zoomAdded > 0) {
          console.log(`[${timestamp}] Ingested ${zoomAdded} new Zoom meeting chat(s).`);
        }
      }
    }
  } catch (err) {
    console.warn(`[${timestamp}] Sync notice:`, err.message);
  } finally {
    client.release();
  }
}

async function main() {
  console.log("===============================================================");
  console.log("   DIGITAL TWIN SUITE - CONTINUOUS DESKTOP SYNC COMPANION      ");
  console.log("===============================================================");
  console.log("Monitoring system tasks: OUTLOOK.EXE, ms-teams.exe, Zoom.exe");
  console.log("Syncing directly from desktop applications to cloud database...");
  console.log("Press Ctrl+C to terminate at any time.\n");

  // Run initial tick
  await syncCycle();

  // Run every 20 seconds
  setInterval(() => {
    syncCycle().catch(console.error);
  }, 20000);
}

main().catch(console.error);
