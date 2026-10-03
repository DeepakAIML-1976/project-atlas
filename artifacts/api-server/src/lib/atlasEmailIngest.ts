import { and, eq } from "drizzle-orm";
import {
  atlasActivityTable,
  atlasDelegationRulesTable,
  atlasEmailDraftsTable,
  atlasKnowledgeUnitsTable,
  db,
} from "@workspace/db";
import OpenAI from "openai";

export async function processIncomingEmail(
  workspaceId: string,
  userId: string,
  sender: string,
  subject: string,
  incomingBody: string,
): Promise<typeof atlasEmailDraftsTable.$inferSelect> {
  // Query all tacit knowledge units & heuristics for workspace
  const knowledgeUnits = await db
    .select()
    .from(atlasKnowledgeUnitsTable)
    .where(eq(atlasKnowledgeUnitsTable.workspaceId, workspaceId));

  const heuristicsSummary = knowledgeUnits
    .map((ku) => `[Domain: ${ku.domain}] Topic: ${ku.topic} -> Rule: ${ku.heuristic || ku.reasoning || "Standard Practice"}`)
    .join("\n");

  let twinDraftResponse = "";
  let reasoning = "";
  let confidence = 0.85;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (baseURL && apiKey) {
    try {
      const client = new OpenAI({ baseURL, apiKey });
      const res = await client.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are Deepak's AI Digital Twin, acting on behalf of a 35-year Senior Oil & Gas Piping Engineering SME.
Draft a professional technical reply to the incoming email. Ground your response strictly in Deepak's established engineering heuristics below:

${heuristicsSummary || "Standard ASME B31.3 / API 570 / NACE MR0175 piping principles apply."}

Return JSON in this format:
{
  "draftResponse": "The professional technical reply to send",
  "reasoning": "Engineering rationale explaining why this response was drafted",
  "confidence": 0.90
}`,
          },
          {
            role: "user",
            content: `Sender: ${sender}\nSubject: ${subject}\nBody: ${incomingBody}`,
          },
        ],
      });

      const raw = res.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw);
        twinDraftResponse = parsed.draftResponse || "";
        reasoning = parsed.reasoning || "";
        confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.85;
      }
    } catch (err) {
      console.warn("AI Email draft generation fallback:", err);
    }
  }

  if (!twinDraftResponse) {
    const matchedRule = knowledgeUnits[0]?.heuristic;
    if (matchedRule) {
      twinDraftResponse = `Dear ${sender.split("<")[0].trim()},\n\nThank you for reaching out regarding "${subject}".\n\nBased on established engineering standards for this service: ${matchedRule}\n\nPlease let me know if you would like me to review the formal drawing package.\n\nBest regards,\nDeepak\nSenior Piping Engineering SME`;
      reasoning = `Formulated based on established piping heuristic: ${matchedRule}`;
      confidence = 0.85;
    } else {
      twinDraftResponse = `Dear ${sender.split("<")[0].trim()},\n\nThank you for your email regarding "${subject}".\n\nI have received your technical inquiry and am reviewing the specific project parameters before confirming. I will get back to you shortly.\n\nBest regards,\nDeepak\nSenior Piping Engineering SME`;
      reasoning = `No pre-existing knowledge unit found. Draft created for human SME authorization and knowledge capture.`;
      confidence = 0.50;
    }
  }

  // Check delegation rules for workspace
  const rules = await db
    .select()
    .from(atlasDelegationRulesTable)
    .where(eq(atlasDelegationRulesTable.workspaceId, workspaceId));

  let initialStatus = "pending_authorization";
  const lowRiskRule = rules.find((r) => r.maxRiskLevel === "low" && r.autoExecutionEnabled);
  if (lowRiskRule && confidence >= 0.95 && !lowRiskRule.requiresHumanApproval) {
    initialStatus = "authorized";
  }

  const [draft] = await db
    .insert(atlasEmailDraftsTable)
    .values({
      workspaceId,
      sender,
      subject,
      incomingBody,
      twinDraftResponse,
      reasoning,
      confidence,
      status: initialStatus,
      authorizedAt: initialStatus === "authorized" ? new Date() : null,
    })
    .returning();

  await db.insert(atlasActivityTable).values({
    workspaceId,
    userId,
    action: "ingested_email_draft",
    recordType: "email_draft",
    recordId: draft.id,
  });

  return draft;
}
