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

function readVarint64(buf: Buffer, pos: number): { val: bigint; pos: number } {
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

/**
 * Pure JavaScript Snappy decompressor for LevelDB compressed table blocks
 */
export function decompressSnappy(buf: Buffer): Buffer {
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
      if (len < 60) {
        len += 1;
      } else if (len === 60) {
        len = buf[pos++] + 1;
      } else if (len === 61) {
        len = buf.readUInt16LE(pos) + 1;
        pos += 2;
      } else if (len === 62) {
        len = buf.readUIntLE(pos, 3) + 1;
        pos += 3;
      } else if (len === 63) {
        len = buf.readUInt32LE(pos) + 1;
        pos += 4;
      }
      if (pos + len > buf.length || outPos + len > uncompressedLen) break;
      buf.copy(out, outPos, pos, pos + len);
      pos += len;
      outPos += len;
    } else if (element === 1) {
      const len = ((tag >> 2) & 0x07) + 4;
      const offset = ((tag >> 5) << 8) | buf[pos++];
      for (let i = 0; i < len; i++) {
        out[outPos] = out[outPos - offset];
        outPos++;
      }
    } else if (element === 2) {
      const len = (tag >> 2) + 1;
      const offset = buf.readUInt16LE(pos);
      pos += 2;
      for (let i = 0; i < len; i++) {
        out[outPos] = out[outPos - offset];
        outPos++;
      }
    } else if (element === 3) {
      const len = (tag >> 2) + 1;
      const offset = buf.readUInt32LE(pos);
      pos += 4;
      for (let i = 0; i < len; i++) {
        out[outPos] = out[outPos - offset];
        outPos++;
      }
    }
  }

  return Buffer.from(out.subarray(0, outPos));
}

/**
 * Parses LevelDB SSTable data blocks using the footer index block
 */
export function parseLevelDbBlocks(buf: Buffer): Buffer[] {
  const blocks: Buffer[] = [];
  if (buf.length < 48) return blocks;
  const footer = Buffer.from(buf.subarray(buf.length - 48));
  const magic = footer.slice(40).toString("hex");
  if (magic !== "57fb808b247547db") return blocks;

  try {
    let p = 0;
    const metaHandle = readVarint64(footer, p);
    p = metaHandle.pos;
    const metaSize = readVarint64(footer, p);
    p = metaSize.pos;
    const indexOffset = readVarint64(footer, p);
    p = indexOffset.pos;
    const indexSize = readVarint64(footer, p);

    const idxOff = Number(indexOffset.val);
    const idxSz = Number(indexSize.val);
    if (idxOff + idxSz + 5 > buf.length) return blocks;
    const idxType = buf[idxOff + idxSz];
    let idxBlockData: Buffer = Buffer.from(buf.subarray(idxOff, idxOff + idxSz));
    if (idxType === 1) {
      idxBlockData = Buffer.from(decompressSnappy(idxBlockData));
    }

    if (idxBlockData.length < 4) return blocks;
    const numRestarts = idxBlockData.readUInt32LE(idxBlockData.length - 4);
    const restartsOffset = idxBlockData.length - 4 - numRestarts * 4;

    let pos = 0;
    while (pos < restartsOffset && pos < idxBlockData.length) {
      const sharedLen = readVarint64(idxBlockData, pos);
      pos = sharedLen.pos;
      const nonSharedLen = readVarint64(idxBlockData, pos);
      pos = nonSharedLen.pos;
      const valLen = readVarint64(idxBlockData, pos);
      pos = valLen.pos;

      pos += Number(nonSharedLen.val);
      const val = Buffer.from(idxBlockData.subarray(pos, pos + Number(valLen.val)));
      pos += Number(valLen.val);

      let vp = 0;
      const bOffset = readVarint64(val, vp);
      vp = bOffset.pos;
      const bSize = readVarint64(val, vp);

      const blockOff = Number(bOffset.val);
      const blockSize = Number(bSize.val);
      if (blockOff + blockSize <= buf.length) {
        const compressionType = buf[blockOff + blockSize];
        let data: Buffer = Buffer.from(buf.subarray(blockOff, blockOff + blockSize));
        if (compressionType === 1) {
          data = Buffer.from(decompressSnappy(data));
        }
        blocks.push(data);
      }
    }
  } catch {
    // Return partial blocks if corrupted
  }
  return blocks;
}

/**
 * Scans local LevelDB files of Microsoft Teams desktop app with full Snappy decompression
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
        // Look back 60 days
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

              if (clean.startsWith("8:orgid:") || clean.startsWith("1785") || clean.startsWith("28:app:")) {
                continue;
              }

              if (
                clean.includes("AI Representative") ||
                clean.includes("my twin is currently offline") ||
                clean.includes("🔔 [Digital Twin") ||
                clean.includes("i am an AI representative")
              ) {
                continue;
              }

              // Context analysis (600 bytes before and after)
              const pre = b.slice(Math.max(0, marker - 600), marker).toString("latin1");
              const post = b.slice(marker, Math.min(b.length, marker + 600)).toString("latin1");

              // RULE 1: NEVER INGEST MESSAGES ORIGINATED BY DEEPAK PARANJAPE
              if (pre.includes("isSentByCurrentUserT") || post.includes("isSentByCurrentUserT")) {
                continue;
              }

              const m =
                pre.match(/imDisplayName[^\w]{1,4}([A-Z][a-zA-Z\s\.\-]{2,35})/i) ||
                pre.match(/fromDisplayNameInToken[^\w]{1,4}([A-Z][a-zA-Z\s\.\-]{2,35})/i);
              const sender = m ? m[1].replace(/[^\x20-\x7E]/g, "").trim() : "Colleague";

              if (isDeepakIdentity(sender)) {
                continue;
              }

              // Extract conversation ID
              let chatId = "Teams Direct Chat";
              const convMatch = (pre + post).match(/19:[a-zA-Z0-9_\-]+@[a-zA-Z0-9_\.]+/);
              if (convMatch) {
                chatId = convMatch[0];
              }

              // Direct message detection (unq.gbl.spaces is Teams 1-on-1 direct chat space)
              const isDirectMessage =
                chatId.includes("unq.gbl.spaces") ||
                chatId.includes("uni01_") ||
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
        }
      } catch (e: any) {
        logger.debug({ err: e?.message, file }, "Notice parsing leveldb file");
      }
    }
  }

  return results;
}

/**
 * Scans local Zoom documents and chat logs
 */
export function extractDesktopZoomMessages(): Array<{
  senderName: string;
  incomingMessage: string;
  chatId: string;
  messageId: string;
  createdAt: Date;
}> {
  const zoomBase = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Documents", "Zoom") : "";
  if (!fs.existsSync(zoomBase)) return [];

  const results: Array<{
    senderName: string;
    incomingMessage: string;
    chatId: string;
    messageId: string;
    createdAt: Date;
  }> = [];

  const seen = new Set<string>();

  try {
    const folders = fs.readdirSync(zoomBase, { withFileTypes: true });
    for (const f of folders) {
      if (!f.isDirectory()) continue;
      const chatFile = path.join(zoomBase, f.name, "meeting_saved_chat.txt");
      if (!fs.existsSync(chatFile)) continue;

      const lines = fs.readFileSync(chatFile, "utf8").split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+From\s+([^:]+?)(?:\s+to\s+([^:]+?))?\s*:\s*(.+)$/i);
        if (!match) continue;

        const sender = match[2].trim();
        const recipient = match[3] ? match[3].trim() : undefined;
        const msg = match[4].trim();

        if (isDeepakIdentity(sender)) continue;

        const isDirect = recipient ? isDeepakIdentity(recipient) : false;
        if (!isAddressedToDeepak({ senderName: sender, recipientName: recipient, messageText: msg, isDirectMessage: isDirect })) {
          continue;
        }

        const hash = crypto.createHash("sha256").update(`zoom:::${f.name}:::${sender}:::${msg}`).digest("hex").substring(0, 32);
        if (seen.has(hash)) continue;
        seen.add(hash);

        results.push({
          senderName: sender,
          incomingMessage: msg,
          chatId: f.name,
          messageId: `zoom_local_${hash.substring(0, 24)}`,
          createdAt: new Date(),
        });
      }
    }
  } catch (err: any) {
    logger.debug({ err: err?.message }, "Notice parsing Zoom meeting logs");
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

/**
 * Ingests all desktop Zoom messages directly from the running desktop app into Supabase
 */
export async function syncFromDesktopZoomApp(workspaceId: string): Promise<number> {
  const { zoom } = checkSystemTasks();
  if (!zoom) {
    logger.info("Zoom is not running in system tasks; skipping desktop Zoom ingestion");
    return 0;
  }

  const messages = extractDesktopZoomMessages();
  let count = 0;

  for (const m of messages) {
    const { isNew } = await ingestCleanChatMessage({
      workspaceId,
      platform: "zoom",
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
