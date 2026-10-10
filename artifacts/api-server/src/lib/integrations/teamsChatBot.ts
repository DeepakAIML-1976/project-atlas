import { db, atlasKnowledgeUnitsTable, atlasMeetingTriggersTable, atlasActionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
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
}

export interface TeamsMessageResponse {
  handled: boolean;
  shouldReply: boolean;
  replyText: string;
  knowledgeBaseMatched: boolean;
  escalatedToInbox: boolean;
  alertId?: string;
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
 * - Queries Digital Twin Knowledge Base (atlasKnowledgeUnitsTable).
 * - If answer exists or LLM can formulate evidence-grounded response -> Replies with "Deepak AI Representative Atlas: [Answer]".
 * - If no appropriate answer -> Replies "Deepak AI Representative Atlas: I have received your message and notified Deepak to get back to you..." and routes to Executive Authorization Inbox.
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

  // 1. Fetch Deepak's Knowledge Base (Engineering Heuristics & Operations Context)
  const knowledgeUnits = await db
    .select()
    .from(atlasKnowledgeUnitsTable)
    .where(eq(atlasKnowledgeUnitsTable.workspaceId, workspaceId));

  const lowerMsg = msg.messageText.toLowerCase();
  
  // Find matching heuristics by keyword overlap
  const matchingUnits = knowledgeUnits.filter((ku) => {
    const topicMatch = ku.topic?.toLowerCase().split(" ").some((w) => w.length > 3 && lowerMsg.includes(w));
    const domainMatch = ku.domain?.toLowerCase().split(" ").some((w) => w.length > 3 && lowerMsg.includes(w));
    return topicMatch || domainMatch;
  });

  let replyText = "";
  let knowledgeBaseMatched = matchingUnits.length > 0;
  let escalatedToInbox = false;
  let alertId: string | undefined = undefined;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (knowledgeBaseMatched || (baseURL && apiKey)) {
    // Attempt LLM / Knowledgebase answer generation
    if (baseURL && apiKey) {
      try {
        const client = new OpenAI({ baseURL, apiKey });
        const heuristicsText = knowledgeUnits
          .map((ku) => `[Domain: ${ku.domain}] Topic: ${ku.topic} -> ${ku.heuristic || ku.reasoning || ""}`)
          .join("\n");

        const res = await client.chat.completions.create({
          model: "gpt-5.4-mini",
          max_completion_tokens: 1024,
          messages: [
            {
              role: "system",
              content: `You are Deepak's AI Representative (Atlas) operating inside Microsoft Teams.
You represent Deepak, a 35-year Senior Oil & Gas Piping Engineering SME at Kent PLC.

Knowledge Base Heuristics:
${heuristicsText || "No custom heuristics recorded yet; use ASME B31.3 / API 570 / ISO 13703 standard principles."}

INSTRUCTIONS:
1. If you can answer the user's technical question based on Deepak's knowledgebase or standard engineering SME principles, formulate a clear, professional answer.
2. Prepend your reply with "Deepak AI Representative Atlas: ".
3. If the question is purely personal, confidential, or outside standard SME context, reply EXACTLY:
"Deepak AI Representative Atlas: I have received your message and notified Deepak. He will review and reply to you directly."`,
            },
            {
              role: "user",
              content: `Incoming Teams message from ${msg.senderName} (${msg.chatType}): "${msg.messageText}"`,
            },
          ],
        });

        replyText = res.choices[0]?.message?.content?.trim() || "";
      } catch (err: any) {
        logger.warn({ err: err?.message }, "LLM Teams response generation fallback");
      }
    }

    if (!replyText && knowledgeBaseMatched) {
      const topMatch = matchingUnits[0];
      replyText = `Deepak AI Representative Atlas: Based on Deepak's established engineering heuristics for ${topMatch.topic}: ${topMatch.heuristic}`;
    }
  }

  // If no appropriate answer was generated or if it indicates fallback
  if (!replyText || replyText.includes("notified Deepak")) {
    replyText = `Deepak AI Representative Atlas: I have received your message and notified Deepak. He will review and reply to you directly.`;
    escalatedToInbox = true;

    // Create alert in Executive Authorization Inbox
    const [alert] = await db
      .insert(atlasMeetingTriggersTable)
      .values({
        workspaceId,
        liveMeetingId: msg.chatId,
        speakerName: msg.senderName,
        triggerPhrase: msg.messageText.slice(0, 100),
        questionAsked: msg.messageText,
        twinProposedResponse: replyText,
        outputMode: "chat",
        humanAlertStatus: "notified",
      })
      .returning();

    alertId = alert.id;

    // Log open action item
    await db.insert(atlasActionsTable).values({
      workspaceId,
      meetingId: msg.chatId,
      title: `Teams Chat Mention (${msg.senderName}): ${msg.messageText.slice(0, 150)}`,
      owner: msg.senderName,
      status: "open",
    });
  }

  return {
    handled: true,
    shouldReply: true,
    replyText,
    knowledgeBaseMatched,
    escalatedToInbox,
    alertId,
  };
}
