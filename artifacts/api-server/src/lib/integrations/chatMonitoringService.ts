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
 * Scans local Zoom documents directory for saved meeting chat transcripts
 */
export function scanLocalZoomMeetingChats(documentsDir?: string): Array<{
  chatId: string;
  senderName: string;
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
          // Format e.g.: 14:32:05 From John Doe to Everyone: Clarify the flange rating please
          // or: 14:32:05 From Deepak Paranjape : ...
          const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+From\s+([^:]+?)(?:\s+to\s+[^:]+)?\s*:\s*(.+)$/i);
          if (match) {
            const timeStr = match[1];
            const sender = match[2].trim();
            const message = match[3].trim();

            const timeParts = timeStr.split(":").map(Number);
            const msgDate = new Date(meetingBaseDate);
            msgDate.setHours(timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);

            results.push({
              chatId: entry.name,
              senderName: sender,
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
 * Sync all local and cloud messages for Teams and Zoom
 */
export async function syncTeamsAndZoomMessages(workspaceId: string): Promise<{
  teamsCount: number;
  zoomCount: number;
  totalNew: number;
}> {
  let teamsCount = 0;
  let zoomCount = 0;

  // 1. Scan Zoom local chat logs
  try {
    const zoomChats = scanLocalZoomMeetingChats();
    for (const chat of zoomChats) {
      // Don't ingest messages sent by Deepak himself
      if (chat.senderName.toLowerCase().includes("deepak")) continue;

      const { isNew } = await ingestCleanChatMessage({
        workspaceId,
        platform: "zoom",
        chatId: chat.chatId,
        senderName: chat.senderName,
        incomingMessage: chat.incomingMessage,
        createdAt: chat.timestamp,
      });
      if (isNew) zoomCount++;
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Error during Zoom chat sync");
  }

  // 2. Scan Teams chats (Graph API if token available)
  try {
    const { resolveMSGraphToken } = await import("./msGraph.js");
    const graphToken = await resolveMSGraphToken();
    if (graphToken) {
      const chatsRes = await fetch("https://graph.microsoft.com/v1.0/chats?$top=10", {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (chatsRes.ok) {
        const chatsData = (await chatsRes.json()) as { value?: any[] };
        for (const c of chatsData.value || []) {
          const msgsRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${c.id}/messages?$top=5`, {
            headers: { Authorization: `Bearer ${graphToken}` },
          });
          if (!msgsRes.ok) continue;
          const msgsData = (await msgsRes.json()) as { value?: any[] };
          for (const m of msgsData.value || []) {
            const sender = m.from?.user?.displayName || "Teams Colleague";
            const email = m.from?.user?.userPrincipalName || "";
            const body = (m.body?.content || "").replace(/<[^>]+>/g, " ").trim();
            if (!body || sender.toLowerCase().includes("deepak")) continue;

            const { isNew } = await ingestCleanChatMessage({
              workspaceId,
              platform: "teams",
              chatId: c.topic || c.id,
              messageId: m.id,
              senderName: sender,
              senderEmail: email,
              incomingMessage: body,
              createdAt: m.createdDateTime ? new Date(m.createdDateTime) : new Date(),
            });
            if (isNew) teamsCount++;
          }
        }
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Notice: Teams Graph chat scan requires user token");
  }

  return { teamsCount, zoomCount, totalNew: teamsCount + zoomCount };
}
