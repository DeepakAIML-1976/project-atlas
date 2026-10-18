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
import { eq, and, desc } from "drizzle-orm";
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
 * Option 1: Executive Approval Workflow (Human-in-the-Loop)
 * - If Owner is OFFLINE: Sends instant courtesy reply immediately, stages 4-pillar technical draft.
 * - If Owner is ONLINE: Stages 4-pillar technical draft, sends draft notification to Deepak in Teams for approval.
 * - If Deepak replies "Approve": Automatically authorizes and dispatches the staged draft to the recipient.
 * - If Personal Message: Immediate corporate policy refusal.
 */
export async function processTeamsChatMessage(msg: IncomingTeamsMessage): Promise<TeamsMessageResponse> {
  let workspaceId = msg.workspaceId && msg.workspaceId !== "default" ? msg.workspaceId : "";
  if (!workspaceId) {
    try {
      const { atlasWorkspacesTable } = await import("@workspace/db");
      const allWs = await db.select().from(atlasWorkspacesTable);
      if (msg.senderEmail) {
        const emailLower = msg.senderEmail.toLowerCase();
        const matched = allWs.find(w => emailLower.includes("sunil") ? w.name.toLowerCase().includes("sunil") : w.name.toLowerCase().includes("deepak"));
        if (matched) workspaceId = matched.id;
      }
      if (!workspaceId && allWs.length > 0) {
        const defaultWs = allWs.find(w => w.name.toLowerCase().includes("deepak")) || allWs[0];
        workspaceId = defaultWs.id;
      }
    } catch (_) {}
    if (!workspaceId) workspaceId = "1a39970a-abf0-48c3-8b89-08b669e80bbe";
  }

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
    workspaceId,
    senderName: msg.senderName,
    chatType: msg.chatType,
    isMentioned: msg.isMentioned,
    isReply: msg.isReplyToDeepak,
    text: msg.messageText.slice(0, 50),
  }, "Processing incoming Teams chat message");

  // 1. IN-TEAMS APPROVAL COMMAND: Check if this is an approval command from an authorized owner
  const isFromOwner =
    msg.senderEmail?.toLowerCase().includes("deepak") ||
    msg.senderName.toLowerCase().includes("deepak") ||
    msg.senderEmail?.toLowerCase().includes("sunil") ||
    msg.senderName.toLowerCase().includes("sunil");
  const isApprovalCommand = isFromOwner && /^\s*(?:approve|authorize|yes|proceed)\b/i.test(msg.messageText.trim());

  if (isApprovalCommand) {
    const idMatch = msg.messageText.match(/approve\s+([a-zA-Z0-9\-]+)/i);
    let targetDraft = null;

    if (idMatch && idMatch[1]) {
      const found = await db
        .select()
        .from(atlasChatDraftsTable)
        .where(eq(atlasChatDraftsTable.id, idMatch[1]))
        .limit(1);
      targetDraft = found[0];
    }

    if (!targetDraft) {
      const pending = await db
        .select()
        .from(atlasChatDraftsTable)
        .where(
          and(
            eq(atlasChatDraftsTable.workspaceId, workspaceId),
            eq(atlasChatDraftsTable.status, "pending_authorization"),
          ),
        )
        .orderBy(desc(atlasChatDraftsTable.createdAt))
        .limit(1);
      targetDraft = pending[0];

      if (!targetDraft) {
        const anyPending = await db
          .select()
          .from(atlasChatDraftsTable)
          .where(eq(atlasChatDraftsTable.status, "pending_authorization"))
          .orderBy(desc(atlasChatDraftsTable.createdAt))
          .limit(1);
        targetDraft = anyPending[0];
      }
    }

    if (targetDraft) {
      await db
        .update(atlasChatDraftsTable)
        .set({ status: "authorized", authorizedAt: new Date() })
        .where(eq(atlasChatDraftsTable.id, targetDraft.id));

      const { sendMSGraphTeamsChatMessage } = await import("./msGraph");
      await sendMSGraphTeamsChatMessage(targetDraft.chatId, targetDraft.twinDraftResponse);

      const confirmText = `✅ Approved: The response for ${targetDraft.senderName} has been authorized and dispatched to Microsoft Teams.`;
      if (msg.chatId && msg.chatId !== targetDraft.chatId) {
        await sendMSGraphTeamsChatMessage(msg.chatId, confirmText);
      }

      logger.info({ draftId: targetDraft.id, recipient: targetDraft.senderName }, "Owner approved draft in Teams: Dispatched to recipient");

      return {
        handled: true,
        shouldReply: true,
        replyText: confirmText,
        knowledgeBaseMatched: true,
        escalatedToInbox: false,
        postedToTeams: true,
      };
    } else {
      const noneText = `Deepak's AI Representative: There are no pending drafts awaiting authorization at this moment.`;
      return {
        handled: true,
        shouldReply: true,
        replyText: noneText,
        knowledgeBaseMatched: false,
        escalatedToInbox: false,
      };
    }
  }

  // 2. Cross-reference across 4 Pillars (Email DB, Chat DB, Knowledge Bank, Heuristics)
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
  let isOwnerOnline = false;
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
    // Formulate 4-pillar verified technical draft and stage for approval
    const [draft] = await db
      .insert(atlasChatDraftsTable)
      .values({
        workspaceId,
        chatId: msg.chatId,
        messageId: msg.messageId,
        senderName: msg.senderName,
        senderEmail: msg.senderEmail,
        incomingMessage: msg.messageText,
        twinDraftResponse: verification.replyText,
        reasoning: verification.matchedContextSummary,
        confidence: 0.95,
        isLLMFallback: Boolean(verification.isLLMFallback),
        ownerPresenceAtArrival: isOwnerOnline ? "online" : "offline",
        courtesyNoticeSent: !isOwnerOnline,
        status: "pending_authorization",
      })
      .returning();
    draftId = draft.id;

    if (!isOwnerOnline) {
      // Owner is OFFLINE:
      // Send INSTANT courtesy reply to the colleague immediately:
      finalDispatchText = offlineCourtesy;
      shouldReplyImmediate = true;
      logger.info({ draftId: draft.id }, "Owner is offline: Sent instant courtesy reply, staged 4-pillar technical draft for approval");
    } else {
      // Owner is ONLINE (Option 1: Approval Workflow):
      // Hold dispatch to colleague until Deepak approves!
      finalDispatchText = "";
      shouldReplyImmediate = false;

      // Send draft reply notification to Deepak in Teams for approval:
      try {
        const { sendMSGraphTeamsChatMessage } = await import("./msGraph");
        const ownerNotificationText = `🔔 [Digital Twin: New Draft Awaiting Approval]
From: ${msg.senderName} (${msg.chatType === "personal_dm" ? "1-on-1 DM" : "Group Chat"})
Question: "${msg.messageText}"

Proposed AI Draft Response:
${verification.replyText}

👉 Reply "Approve" in Teams or click Authorize in your Executive Inbox to dispatch.`;

        const ownerChatId = process.env.TEAMS_OWNER_CHAT_ID || "19:65e796170c314bad991961548640a9aa@thread.v2";
        await sendMSGraphTeamsChatMessage(ownerChatId, ownerNotificationText);
        logger.info({ draftId: draft.id, ownerChatId }, "Sent draft review notification to owner in Teams");
      } catch (notifErr: any) {
        logger.warn({ err: notifErr?.message }, "Failed to deliver draft notification to owner in Teams");
      }

      logger.info({ draftId: draft.id }, "Owner is online: Staged technical draft in Authorization Queue for owner review");
    }
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
