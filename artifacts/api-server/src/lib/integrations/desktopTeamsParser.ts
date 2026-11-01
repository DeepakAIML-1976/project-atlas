import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { logger } from "../logger.js";
import { isDeepakIdentity, isAddressedToDeepak, ingestCleanChatMessage } from "./chatMonitoringService.js";

export interface TaskManagerStatus {
  outlook: boolean;
  teams: boolean;
  zoom: boolean;
}

/**
 * Checks system task manager for running desktop applications
 */
export function checkSystemTasks(): TaskManagerStatus {
  if (process.platform !== "win32") {
    return { outlook: false, teams: false, zoom: false };
  }
  try {
    const taskOut = execSync("tasklist /FO CSV /NH", { encoding: "utf8", windowsHide: true }).toLowerCase();
    const outlook = taskOut.includes("outlook.exe");
    const teams = taskOut.includes("ms-teams.exe") || taskOut.includes("teams.exe");
    const zoom = taskOut.includes("zoom.exe");
    return { outlook, teams, zoom };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to check system tasks");
    return { outlook: false, teams: false, zoom: false };
  }
}

/**
 * Scans local LevelDB files of Microsoft Teams desktop app
 */
export function extractDesktopTeamsMessages(): Array<{
  senderName: string;
  senderEmail?: string;
  incomingMessage: string;
  chatId: string;
  messageId: string;
  createdAt: Date;
}> {
  const localApp = process.env.LOCALAPPDATA || "";
  const roamingApp = process.env.APPDATA || "";

  const candidateDirs = [
    path.join(
      localApp,
      "Packages",
      "MSTeams_8wekyb3d8bbwe",
      "LocalCache",
      "Microsoft",
      "MSTeams",
      "EBWebView",
      "WV2Profile_tfw",
      "IndexedDB",
      "https_teams.microsoft.com_0.indexeddb.leveldb"
    ),
    path.join(
      localApp,
      "Packages",
      "MSTeams_8wekyb3d8bbwe",
      "LocalCache",
      "Microsoft",
      "MSTeams",
      "EBWebView",
      "WV2Profile_tfl",
      "IndexedDB",
      "https_teams.microsoft.com_0.indexeddb.leveldb"
    ),
    path.join(
      roamingApp,
      "Microsoft",
      "Teams",
      "IndexedDB",
      "https_teams.microsoft.com_0.indexeddb.leveldb"
    ),
  ];

  const results: Array<{
    senderName: string;
    senderEmail?: string;
    incomingMessage: string;
    chatId: string;
    messageId: string;
    createdAt: Date;
  }> = [];

  const seenHashes = new Set<string>();
  const needle = Buffer.from([0x22, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x22]); // "\x22\x07content\x22"

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".ldb") || f.endsWith(".log"));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        // Only inspect files modified within last 14 days
        if (Date.now() - stat.mtimeMs > 14 * 86400 * 1000) continue;

        const b = fs.readFileSync(fullPath);
        let pos = 0;

        while ((pos = b.indexOf(needle, pos)) !== -1) {
          const marker = pos;
          pos += needle.length;

          // Varint string length
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

            // Discard telemetry / system tokens
            if (clean.startsWith("8:orgid:") || clean.startsWith("1785") || clean.startsWith("28:app:")) {
              continue;
            }

            // Skip AI representative notices to avoid loops
            if (
              clean.includes("AI Representative") ||
              clean.includes("my twin is currently offline") ||
              clean.includes("🔔 [Digital Twin") ||
              clean.includes("i am an AI representative")
            ) {
              continue;
            }

            // Look for sender name in previous 500 bytes
            const pre = b.slice(Math.max(0, marker - 500), marker).toString("latin1");
            const m = pre.match(/imDisplayName[^\w]{1,4}([A-Z][a-zA-Z\s\.\-]{2,35})/i);
            const sender = m ? m[1].replace(/[^\x20-\x7E]/g, "").trim() : "Colleague";

            // RULE 1: NEVER INGEST MESSAGES ORIGINATED BY DEEPAK PARANJAPE
            if (isDeepakIdentity(sender)) {
              continue;
            }

            // Extract chat / topic id if available
            let chatId = "Teams Direct Chat";
            const convMatch = pre.match(/19:[a-zA-Z0-9_\-]+@thread\.v2/);
            if (convMatch) {
              chatId = convMatch[0];
            }

            // Determine if direct message
            const isDirectMessage =
              chatId.includes("uni01") ||
              !chatId.includes("@thread.v2") ||
              pre.includes("personal_dm") ||
              pre.includes("oneOnOne");

            // RULE 2: ONLY INGEST 1-ON-1 DMS OR MESSAGES SPECIFICALLY ADDRESSED TO DEEPAK
            if (
              !isAddressedToDeepak({
                senderName: sender,
                messageText: clean,
                isDirectMessage,
              })
            ) {
              continue;
            }

            const hash = crypto.createHash("md5").update(`${sender}:::${clean}`).digest("hex");
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);

            // Clean unprintable characters from text
            clean = clean.replace(/[^\x20-\x7E\r\n]/g, "").trim();
            if (clean.length < 4) continue;

            const messageId = `teams_local_${hash.substring(0, 24)}`;
            results.push({
              senderName: sender,
              incomingMessage: clean,
              chatId,
              messageId,
              createdAt: stat.mtime || new Date(),
            });
          }
        }
      } catch (e: any) {
        logger.debug({ err: e?.message, file }, "Notice parsing leveldb file");
      }
    }
  }

  return results;
}

/**
 * Ingests all desktop Teams messages directly from the running desktop app into Supabase
 */
export async function syncFromDesktopTeamsApp(workspaceId: string): Promise<number> {
  const { teams } = checkSystemTasks();
  if (!teams) {
    logger.info("Microsoft Teams is not running in system tasks; skipping desktop Teams ingestion");
    return 0;
  }

  const messages = extractDesktopTeamsMessages();
  let count = 0;

  for (const m of messages) {
    const { isNew } = await ingestCleanChatMessage({
      workspaceId,
      platform: "teams",
      chatId: m.chatId,
      messageId: m.messageId,
      senderName: m.senderName,
      incomingMessage: m.incomingMessage,
      createdAt: m.createdAt,
    });
    if (isNew) count++;
  }

  return count;
}
