import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { atlasChatDraftsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../logger.js";
import { verifyContextAndResolve } from "../contextVerificationEngine.js";

export interface IngestedChatMessage {
  id: string;
  workspaceId: string;
  platform: "teams" | "zoom";
  chatId: string;
  messageId: string;
  senderName: string;
  senderEmail?: string | null;
  incomingMessage: string;
  twinDraftResponse: string;
  reasoning?: string | null;
  confidence?: number | null;
  status: string;
  createdAt: Date;
}

/**
 * Verifies if a sender name or email represents Deepak Paranjape
 */
export function isDeepakIdentity(nameOrEmail?: string | null): boolean {
  if (!nameOrEmail) return false;
  const s = nameOrEmail.toLowerCase().trim();
  return (
    s.includes("deepak.paranjape") ||
    s.includes("deepak paranjape") ||
    s.includes("user_deepak") ||
    s === "deepak" ||
    s.includes("dpengineeringservices")
  );
}

/**
 * Checks if a message is directly addressed to Deepak Paranjape.
 * Rules:
 * 1. If sent by Deepak, return false (never ingest self-messages).
 * 2. If it is an explicit 1-on-1 Direct Message (isDirectMessage = true), return true.
 * 3. If recipient specifically targets Deepak (e.g. Zoom private message), return true.
 * 4. In group/meeting chats, requires explicit address or @mention:
 *    - Explicit @mention (@Deepak, @Deepak Paranjape, @deepak.paranjape)
 *    - Direct salutation at start of message or sentences: "Hi Deepak", "Hello Deepak", "Hey Deepak", "Dear Deepak", "Deepak,", "Deepak:", "Deepak -"
 *    - In-text mention of deepak.paranjape@kentplc.com
 * 5. Otherwise returns false (skips general chatter between others).
 */
export function isAddressedToDeepak(params: {
  senderName: string;
  senderEmail?: string | null;
  recipientName?: string | null;
  messageText: string;
  isDirectMessage?: boolean;
}): boolean {
  const { senderName, senderEmail, recipientName, messageText, isDirectMessage } = params;

  // Rule 1: Never ingest self-sent messages
  if (isDeepakIdentity(senderName) || isDeepakIdentity(senderEmail)) {
    return false;
  }

  // Rule 2: Explicit 1-on-1 DM
  if (isDirectMessage) {
    return true;
  }

  // Rule 3: Recipient specifically targets Deepak (e.g. Zoom private message to Deepak)
  if (recipientName && isDeepakIdentity(recipientName)) {
    return true;
  }

  // Rule 4: Group chats / meeting chats: require explicit mention or address
  const text = messageText.trim();
  const lower = text.toLowerCase();

  // Explicit @mention
  if (/@deepak(\b|\s|paranjape)/i.test(text)) {
    return true;
  }

  // Email mention
  if (lower.includes("deepak.paranjape@kentplc.com")) {
    return true;
  }

  // Salutation / direct addressing patterns (at start of text or after punctuation/newline)
  // e.g. "Hi Deepak", "Hello Deepak", "Deepak, what is...", "Deepak: please clarify", "Deepak - can we check..."
  const addressPattern = /(?:^|[\r\n.!?]\s*)(?:hi|hello|hey|dear)?\s*@?deepak\b(?:\s*paranjape)?(?:\s*[,:\-–—]|\s+(?:please|could|can|what|how|where|when|why|is|are|do|did|will|would|check|confirm|review|verify|note|regards|thanks|thank))/i;
  if (addressPattern.test(text)) {
    return true;
  }

  // Check if message starts directly with "Deepak" followed by punctuation or question
  if (/^@?deepak\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Scans local Zoom documents directory for saved meeting chat transcripts.
 * ONLY returns messages directly DMed to Deepak or specifically addressed to him.
 */
export function scanLocalZoomMeetingChats(documentsDir?: string): Array<{
  chatId: string;
  senderName: string;
  recipientName?: string;
  incomingMessage: string;
  timestamp: Date;
  rawLine: string;
}> {
  const baseDir = documentsDir || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Documents", "Zoom") : "");
  if (!baseDir || !fs.existsSync(baseDir)) {
    return [];
  }

  const results: Array<{
    chatId: string;
    senderName: string;
    recipientName?: string;
    incomingMessage: string;
    timestamp: Date;
    rawLine: string;
  }> = [];

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(baseDir, entry.name);
      const chatFile = path.join(folderPath, "meeting_saved_chat.txt");
      if (!fs.existsSync(chatFile)) continue;

      const meetingDateMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})/);
      const meetingBaseDate = meetingDateMatch ? new Date(meetingDateMatch[1]) : new Date();

      try {
        const content = fs.readFileSync(chatFile, "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);

        for (const line of lines) {
          // Format e.g.:
          // 14:32:05 From John Doe to Everyone: Clarify the flange rating please
          // 14:32:05 From John Doe to Deepak Paranjape (Privately): Here is the spec
          // 14:32:05 From Deepak Paranjape : ...
          const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+From\s+([^:]+?)(?:\s+to\s+([^:]+?))?\s*:\s*(.+)$/i);
          if (match) {
            const timeStr = match[1];
            const sender = match[2].trim();
            const recipient = match[3] ? match[3].trim() : undefined;
            const message = match[4].trim();

            // Ignore messages sent by Deepak himself
            if (isDeepakIdentity(sender)) continue;

            const isDirectMessage = Boolean(recipient && isDeepakIdentity(recipient));

            // Strictly filter to messages directly DMed or addressed to Deepak
            if (
              !isAddressedToDeepak({
                senderName: sender,
                recipientName: recipient,
                messageText: message,
                isDirectMessage,
              })
            ) {
              continue;
            }

            const timeParts = timeStr.split(":").map(Number);
            const msgDate = new Date(meetingBaseDate);
            msgDate.setHours(timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);

            results.push({
              chatId: entry.name,
              senderName: sender,
              recipientName: recipient,
              incomingMessage: message,
              timestamp: msgDate,
              rawLine: line,
            });
          }
        }
      } catch (err: any) {
        logger.warn({ folder: entry.name, err: err?.message }, "Failed to read Zoom meeting chat file");
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to scan Zoom directory");
  }

  return results;
}

/**
 * Cleanly ingest a chat message without forcing an automated AI draft
 */
export async function ingestCleanChatMessage(params: {
  workspaceId: string;
  platform: "teams" | "zoom";
  chatId: string;
  messageId?: string;
  senderName: string;
  senderEmail?: string;
  incomingMessage: string;
  createdAt?: Date;
}): Promise<{ record: any; isNew: boolean }> {
  const { workspaceId, platform, chatId, senderName, senderEmail, incomingMessage } = params;
  const createdAt = params.createdAt || new Date();

  // Create deterministic messageId if not supplied
  const messageId =
    params.messageId ||
    crypto
      .createHash("sha256")
      .update(`${platform}:::${chatId}:::${senderName}:::${incomingMessage}:::${createdAt.toISOString()}`)
      .digest("hex")
      .substring(0, 32);

  // Check for duplicate
  const existing = await db
    .select()
    .from(atlasChatDraftsTable)
    .where(
      and(
        eq(atlasChatDraftsTable.workspaceId, workspaceId),
        eq(atlasChatDraftsTable.messageId, messageId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { record: existing[0], isNew: false };
  }

  const [created] = await db
    .insert(atlasChatDraftsTable)
    .values({
      workspaceId,
      platform,
      chatId,
      messageId,
      senderName,
      senderEmail: senderEmail || null,
      incomingMessage,
      twinDraftResponse: "", // Clean ingest: no draft forced until user requests
      status: "ingested",
      createdAt,
    })
    .returning();

  return { record: created, isNew: true };
}

/**
 * Generate AI Draft Response for a user-selected message
 */
export async function generateDraftForChatMessage(
  workspaceId: string,
  chatDraftId: string,
): Promise<{ success: boolean; record?: any; error?: string }> {
  const [draft] = await db
    .select()
    .from(atlasChatDraftsTable)
    .where(
      and(
        eq(atlasChatDraftsTable.id, chatDraftId),
        eq(atlasChatDraftsTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!draft) {
    return { success: false, error: "Chat message not found" };
  }

  try {
    // Invoke Context Verification & Heuristics engine (4 pillars)
    const verification = await verifyContextAndResolve({
      workspaceId,
      senderName: draft.senderName,
      senderEmail: draft.senderEmail || undefined,
      messageText: draft.incomingMessage,
      channel: draft.platform === "zoom" ? "meeting" : "teams_chat",
      chatId: draft.chatId,
    });

    const reasoning = `Grounding: ${verification.category.toUpperCase()} query. Verified against 16 golden piping heuristics, ASME codes, and 5884 Alky Reactor context.`;
    const confidence = verification.category === "technical_engineering" ? 0.95 : 0.88;

    const [updated] = await db
      .update(atlasChatDraftsTable)
      .set({
        twinDraftResponse: verification.replyText,
        reasoning,
        confidence,
        status: "pending_authorization",
      })
      .where(eq(atlasChatDraftsTable.id, chatDraftId))
      .returning();

    return { success: true, record: updated };
  } catch (err: any) {
    logger.error({ err: err?.message, chatDraftId }, "Failed to generate AI draft for chat message");
    return { success: false, error: err?.message || "Failed to generate AI draft" };
  }
}

/**
 * Purges all chat drafts for a given workspace
 */
export async function clearAllChatDrafts(workspaceId: string): Promise<number> {
  const deleted = await db
    .delete(atlasChatDraftsTable)
    .where(eq(atlasChatDraftsTable.workspaceId, workspaceId))
    .returning();
  return deleted.length;
}

/**
 * Sync all local and cloud messages for Teams and Zoom
 */
export async function syncTeamsAndZoomMessages(workspaceId: string): Promise<{
  teamsCount: number;
  zoomCount: number;
  totalNew: number;
}> {
  let teamsCount = 0;
  let zoomCount = 0;

  if (process.platform === "win32") {
    try {
      const { syncFromDesktopZoomApp, syncFromDesktopTeamsApp } = await import("./desktopTeamsParser.js");
      zoomCount = await syncFromDesktopZoomApp(workspaceId);
      teamsCount = await syncFromDesktopTeamsApp(workspaceId);
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Error during desktop apps sync");
    }
  }

  return { teamsCount, zoomCount, totalNew: teamsCount + zoomCount };
}
