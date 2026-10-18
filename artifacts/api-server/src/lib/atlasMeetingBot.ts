import { and, eq, ilike } from "drizzle-orm";
import {
  atlasActionsTable,
  atlasKnowledgeUnitsTable,
  atlasLiveMeetingsTable,
  atlasMeetingTriggersTable,
  atlasMeetingsTable,
  db,
} from "@workspace/db";
import { getLLMConfig } from "./atlasLLM.js";

export interface ProcessTranscriptResult {
  processed: boolean;
  triggerDetected: boolean;
  triggeredAlert?: typeof atlasMeetingTriggersTable.$inferSelect;
  extractedNote?: string;
}

const WAKE_UP_KEYWORDS = [
  "deepak",
  "mr. deepak",
  "deepak's",
  "piping sme",
  "deepak aiml",
  "deepak, what",
  "deepak, can you",
  "deepak's opinion",
];

export async function processLiveTranscriptChunk(
  workspaceId: string,
  liveMeetingId: string,
  speakerName: string,
  text: string,
): Promise<ProcessTranscriptResult> {
  const lowerText = text.toLowerCase();
  const triggerDetected = WAKE_UP_KEYWORDS.some((kw) => lowerText.includes(kw));

  let triggeredAlert: typeof atlasMeetingTriggersTable.$inferSelect | undefined = undefined;
  let extractedNote: string | undefined = undefined;

  // Find relevant knowledge units for Deepak to formulate an evidence-grounded response
  const knowledgeUnits = await db
    .select()
    .from(atlasKnowledgeUnitsTable)
    .where(eq(atlasKnowledgeUnitsTable.workspaceId, workspaceId));

  let twinProposedResponse = "";
  const llm = getLLMConfig();

  if (triggerDetected) {
    const { verifyContextAndResolve } = await import("./contextVerificationEngine.js");
    const verification = await verifyContextAndResolve({
      workspaceId,
      senderName: speakerName,
      messageText: text,
      channel: "teams_call",
      chatId: liveMeetingId,
    });

    twinProposedResponse = verification.replyText;

    // Record meeting trigger alert for Executive Authorization Inbox sign-off
    const [alert] = await db
      .insert(atlasMeetingTriggersTable)
      .values({
        workspaceId,
        liveMeetingId,
        speakerName,
        triggerPhrase: text.slice(0, 100),
        questionAsked: text,
        twinProposedResponse,
        outputMode: "chat",
        humanAlertStatus: "notified",
      })
      .returning();

    triggeredAlert = alert;
  }

  // Action item & note logger
  if (lowerText.includes("action item") || lowerText.includes("todo") || lowerText.includes("assigned to")) {
    extractedNote = `Action Item logged from ${speakerName}: "${text}"`;

    // Try to find matching meeting record to append action item
    const meetings = await db
      .select()
      .from(atlasMeetingsTable)
      .where(eq(atlasMeetingsTable.workspaceId, workspaceId))
      .limit(1);

    if (meetings[0]) {
      await db.insert(atlasActionsTable).values({
        workspaceId,
        meetingId: meetings[0].id,
        title: `Live Meeting Action (${speakerName}): ${text.slice(0, 200)}`,
        owner: speakerName,
        status: "open",
      });
    }
  }

  return {
    processed: true,
    triggerDetected,
    triggeredAlert,
    extractedNote,
  };
}
