import {
  db,
  atlasKnowledgeUnitsTable,
  atlasMeetingTriggersTable,
  atlasLiveMeetingsTable,
  atlasMeetingsTable,
  atlasActionsTable,
  atlasChatDraftsTable,
  atlasTwinPreferencesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getLLMConfig } from "../atlasLLM.js";
import { logger } from "../logger";

export interface IncomingTeamsMessage {
  workspaceId?: string;
  chatId: string;
  messageId: string;
  senderName: string;
  senderEmail?: string;
  chatType: "group_chat" | "personal_dm" | "channel_post";
  messageText: string;
  isMentioned: boolean;
  isReplyToDeepak: boolean;
  threadHistory?: Array<{ sender: string; text: string }>;
}

export interface TeamsMessageResponse {
  handled: boolean;
  shouldReply: boolean;
  replyText: string;
  knowledgeBaseMatched: boolean;
  escalatedToInbox: boolean;
  alertId?: string;
  postedToTeams?: boolean;
}

/**
 * Real-world Microsoft Teams Chat Message Processor
 * 
 * Handles:
 * 1. @Mentions in Group Chats
 * 2. Replies to Deepak's messages in Group Threads
 * 3. 1-on-1 Personal Direct Messages (DMs)
 * 
 * Logic:
 * - Cross-references across 4 Pillars (Email DB, Chat DB, Knowledge Bank, Heuristics/LLM).
 * - Delivers grounded contextual replies with active signature.
 */
export async function processTeamsChatMessage(msg: IncomingTeamsMessage): Promise<TeamsMessageResponse> {
  const workspaceId = msg.workspaceId || "default";

  // Check if message requires bot attention
  const requiresAction = msg.chatType === "personal_dm" || msg.isMentioned || msg.isReplyToDeepak;
  if (!requiresAction) {
    return {
      handled: false,
      shouldReply: false,
      replyText: "",
      knowledgeBaseMatched: false,
      escalatedToInbox: false,
    };
  }

  logger.info({
    senderName: msg.senderName,
    chatType: msg.chatType,
    isMentioned: msg.isMentioned,
    isReply: msg.isReplyToDeepak,
    text: msg.messageText.slice(0, 50),
  }, "Processing incoming Teams chat message");

  // 1. Cross-reference across 4 Pillars (Email DB, Chat DB, Knowledge Bank, Heuristics)
  const { verifyContextAndResolve } = await import("../contextVerificationEngine.js");
  const verification = await verifyContextAndResolve({
    workspaceId,
    senderName: msg.senderName,
    senderEmail: msg.senderEmail,
    messageText: msg.messageText,
    channel: msg.chatType === "personal_dm" ? "teams_dm" : "teams_chat",
    chatId: msg.chatId,
    threadHistory: msg.threadHistory || (msg as any).threadHistory || [],
  });

  const knowledgeBaseMatched = verification.category !== "personal";

  // Load twin preferences for this workspace
  let isOwnerOnline = true; // Default to online when owner is actively working
  let offlineCourtesy = "I am Deepak's AI Representative, my twin is currently offline, I will make sure your message is replied once he is online.";
  let twinSignature = "Deepak's AI Representative";

  try {
    const prefs = await db
      .select()
      .from(atlasTwinPreferencesTable)
      .where(eq(atlasTwinPreferencesTable.workspaceId, workspaceId))
      .limit(1);
    if (prefs.length > 0) {
      isOwnerOnline = Boolean(prefs[0].ownerIsOnline);
      if (prefs[0].offlineCourtesyMessage) offlineCourtesy = prefs[0].offlineCourtesyMessage;
      if (prefs[0].signature) twinSignature = prefs[0].signature;
    }
  } catch (_) {}

  const isPersonal = verification.category === "personal";
  let finalDispatchText = "";
  let shouldReplyImmediate = false;
  let draftId: string | undefined = undefined;

  if (isPersonal) {
    // Policy refusal for personal messages is sent immediately
    finalDispatchText = verification.replyText;
    shouldReplyImmediate = true;
  } else {
    // Technical / Project / Operations inquiry:
    // When a 4-pillar verified contextual answer is formulated, always dispatch it!
    const hasContextualReply = Boolean(verification.replyText && verification.replyText.trim());

    if (hasContextualReply) {
      finalDispatchText = verification.replyText;
      shouldReplyImmediate = true;
    } else if (!isOwnerOnline) {
      // Only fall back to offline courtesy if no contextual answer could be formulated and owner is offline
      finalDispatchText = offlineCourtesy;
      shouldReplyImmediate = true;
    } else {
      finalDispatchText = `${twinSignature}: I have logged your message and notified Deepak.`;
      shouldReplyImmediate = true;
    }

    const [draft] = await db
      .insert(atlasChatDraftsTable)
      .values({
        workspaceId,
        chatId: msg.chatId,
        messageId: msg.messageId,
        senderName: msg.senderName,
        senderEmail: msg.senderEmail,
        incomingMessage: msg.messageText,
        twinDraftResponse: verification.replyText || finalDispatchText,
        reasoning: verification.matchedContextSummary,
        confidence: 0.95,
        isLLMFallback: Boolean(verification.isLLMFallback),
        ownerPresenceAtArrival: isOwnerOnline ? "online" : "offline",
        courtesyNoticeSent: !hasContextualReply && !isOwnerOnline,
        status: shouldReplyImmediate ? "sent" : "pending_authorization",
      })
      .returning();
    draftId = draft.id;

    logger.info(
      { draftId: draft.id, isOwnerOnline, shouldReplyImmediate, snippet: finalDispatchText.slice(0, 80) },
      "Delivering 4-pillar verified AI representative response to Teams",
    );
  }

  // Live Teams Message Delivery: only post if immediate reply is permitted
  let postedToTeams = false;
  if (shouldReplyImmediate && finalDispatchText) {
    try {
      const { sendMSGraphTeamsChatMessage } = await import("./msGraph");
      const postRes = await sendMSGraphTeamsChatMessage(msg.chatId, finalDispatchText);
      postedToTeams = postRes.success;
      if (postedToTeams) {
        logger.info({ chatId: msg.chatId, messageId: postRes.messageId }, "Posted immediate response into Microsoft Teams chat");
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Direct Teams chat delivery via Graph API skipped; reply cached for DOM browser worker");
    }
  }

  return {
    handled: true,
    shouldReply: shouldReplyImmediate,
    replyText: finalDispatchText,
    knowledgeBaseMatched,
    escalatedToInbox: !isPersonal,
    alertId: draftId,
    postedToTeams,
  };
}
