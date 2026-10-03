import { and, eq, ilike } from "drizzle-orm";
import {
  atlasActionsTable,
  atlasKnowledgeUnitsTable,
  atlasLiveMeetingsTable,
  atlasMeetingTriggersTable,
  atlasMeetingsTable,
  db,
} from "@workspace/db";
import OpenAI from "openai";

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
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (triggerDetected) {
    const relevantHeuristics = knowledgeUnits
      .map((ku) => `[Domain: ${ku.domain}] Topic: ${ku.topic} -> Heuristic: ${ku.heuristic || ku.reasoning || "Standard SME Practice"}`)
      .join("\n");

    if (baseURL && apiKey) {
      try {
        const client = new OpenAI({ baseURL, apiKey });
        const res = await client.chat.completions.create({
          model: "gpt-5.4-mini",
          max_completion_tokens: 1024,
          messages: [
            {
              role: "system",
              content: `You are Deepak's AI Representative (Atlas) speaking in a live meeting.
You represent Deepak, a 35-year Senior Oil & Gas Piping Engineering SME.
Formulate a concise, authoritative technical response to the question asked by ${speakerName}.
Ground your answer strictly in Deepak's established engineering heuristics below:

${relevantHeuristics || "No custom heuristics recorded yet; use ASME B31.3 / API 570 standard piping principles."}

IMPORTANT: Prepend your statement with "Deepak's AI Representative (Atlas):" to ensure transparent AI identification.`,
            },
            {
              role: "user",
              content: `Meeting question asked by ${speakerName}: "${text}"`,
            },
          ],
        });

        twinProposedResponse = res.choices[0]?.message?.content ?? "";
      } catch (err) {
        console.warn("AI meeting response generation fallback:", err);
      }
    }

    if (!twinProposedResponse) {
      const topHeuristic = knowledgeUnits[0]?.heuristic;
      if (topHeuristic) {
        twinProposedResponse = `Deepak's AI Representative (Atlas): Based on Deepak's established engineering heuristics: ${topHeuristic}`;
      } else {
        twinProposedResponse = `Deepak's AI Representative (Atlas): Deepak has received your query. Routing to Deepak's Executive Authorization Inbox for sign-off.`;
      }
    }

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
