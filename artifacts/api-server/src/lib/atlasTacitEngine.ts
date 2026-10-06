import { and, eq } from "drizzle-orm";
import { atlasKnowledgeUnitsTable, atlasSocraticInterviewsTable, db } from "@workspace/db";
import OpenAI from "openai";

const SOCRATIC_QUESTIONS = [
  "Tell me about a piping layout issue that passed 3D model review but caused major constructability or maintenance issues at the site.",
  "What is a common mistake junior piping stress engineers make when sizing expansion loops or nozzle load allowances?",
  "When reviewing a P&ID for wet sour gas service, what specific material and flange rating red flags do you immediately look for?",
  "What information would you demand from a compressor vendor before approving their suction/discharge piping interface drawing?",
  "Describe a decision where you rejected an apparently technically acceptable piping specification override, and explain why your experience dictated doing so.",
  "What constructability lesson did you learn from your worst offshore platform or refinery piping installation incident?",
];

export async function generateSocraticQuestion(
  workspaceId: string,
): Promise<typeof atlasSocraticInterviewsTable.$inferSelect> {
  const existing = await db
    .select()
    .from(atlasSocraticInterviewsTable)
    .where(eq(atlasSocraticInterviewsTable.workspaceId, workspaceId));

  const count = existing.length;
  const questionText = SOCRATIC_QUESTIONS[count % SOCRATIC_QUESTIONS.length];

  const [interview] = await db
    .insert(atlasSocraticInterviewsTable)
    .values({
      workspaceId,
      interviewerQuestion: questionText,
      status: "pending",
    })
    .returning();

  return interview;
}

export async function processSocraticAnswer(
  workspaceId: string,
  interviewId: string,
  smeAnswer: string,
): Promise<{ interview: typeof atlasSocraticInterviewsTable.$inferSelect; knowledgeUnit: typeof atlasKnowledgeUnitsTable.$inferSelect }> {
  const [interview] = await db
    .select()
    .from(atlasSocraticInterviewsTable)
    .where(and(eq(atlasSocraticInterviewsTable.id, interviewId), eq(atlasSocraticInterviewsTable.workspaceId, workspaceId)))
    .limit(1);

  if (!interview) {
    throw new Error("Socratic interview record not found");
  }

  let domain = "piping_design";
  let topic = "Tacit SME Engineering Heuristic";
  let heuristic = smeAnswer;
  let reasoning = "Extracted from Deepak's 35-year piping SME interview response.";
  let context = "Oil & Gas EPC Project Execution";
  let exception = "";

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (baseURL && apiKey) {
    try {
      const client = new OpenAI({ baseURL, apiKey });
      const res = await client.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are the Tacit Knowledge Extraction Engine for Deepak's Digital Twin.
Extract structured professional piping engineering heuristics from Deepak's interview answer.
Return JSON:
{
  "domain": "piping_design" | "pipe_stress" | "materials" | "valves" | "hazop" | "procurement" | "construction",
  "topic": "Concise topic title",
  "context": "Applicable service or design phase context",
  "heuristic": "The core engineering rule / guideline developed through experience",
  "reasoning": "Engineering rationale explaining why this heuristic works",
  "exception": "Any known boundary conditions or exceptions"
}`,
          },
          {
            role: "user",
            content: `Question: "${interview.interviewerQuestion}"\n\nSME Answer: "${smeAnswer}"`,
          },
        ],
      });

      const raw = res.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw);
        domain = parsed.domain || domain;
        topic = parsed.topic || topic;
        heuristic = parsed.heuristic || heuristic;
        reasoning = parsed.reasoning || reasoning;
        context = parsed.context || context;
        exception = parsed.exception || exception;
      }
    } catch (err) {
      console.warn("Socratic AI extraction fallback:", err);
    }
  }

  const [knowledgeUnit] = await db
    .insert(atlasKnowledgeUnitsTable)
    .values({
      workspaceId,
      domain,
      topic,
      context,
      heuristic,
      reasoning,
      exception,
      experience: smeAnswer,
      confidence: 1.0,
      validationStatus: "validated",
    })
    .returning();

  await db
    .update(atlasSocraticInterviewsTable)
    .set({
      smeAnswer,
      extractedKnowledgeUnitId: knowledgeUnit.id,
      status: "validated",
    })
    .where(eq(atlasSocraticInterviewsTable.id, interviewId));

  const [updatedInterview] = await db
    .select()
    .from(atlasSocraticInterviewsTable)
    .where(eq(atlasSocraticInterviewsTable.id, interviewId));

  return { interview: updatedInterview, knowledgeUnit };
}

export async function learnFromCorrection(
  workspaceId: string,
  originalContext: string,
  originalTwinResponse: string,
  smeCorrectionText: string,
): Promise<typeof atlasKnowledgeUnitsTable.$inferSelect> {
  let domain = "piping_design";
  let topic = "SME Correction Knowledge Unit";
  let heuristic = smeCorrectionText;
  let reasoning = `Extracted from Deepak's correction: "${smeCorrectionText}"`;
  let context = originalContext;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (baseURL && apiKey) {
    try {
      const client = new OpenAI({ baseURL, apiKey });
      const res = await client.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are the Correction Learning Engine for Deepak's Digital Twin.
The AI Twin gave an answer that Deepak (Senior Piping SME) corrected.
Analyze why the Twin answer was wrong and extract the reusable professional Knowledge Unit.
Return JSON:
{
  "domain": "piping_design" | "pipe_stress" | "materials" | "valves" | "hazop" | "procurement" | "construction",
  "topic": "Concise topic title",
  "context": "Specific engineering context or design phase",
  "heuristic": "The corrected engineering rule or principle",
  "reasoning": "SME rationale explaining why the original Twin answer was flawed and why the correction is correct",
  "exception": "Any exception or boundary condition"
}`,
          },
          {
            role: "user",
            content: `Original Context: ${originalContext}\nOriginal Twin Answer: ${originalTwinResponse}\n\nDeepak's Correction: ${smeCorrectionText}`,
          },
        ],
      });

      const raw = res.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw);
        domain = parsed.domain || domain;
        topic = parsed.topic || topic;
        heuristic = parsed.heuristic || heuristic;
        reasoning = parsed.reasoning || reasoning;
        context = parsed.context || context;
      }
    } catch (err) {
      console.warn("Correction learning AI extraction fallback:", err);
    }
  }

  const [knowledgeUnit] = await db
    .insert(atlasKnowledgeUnitsTable)
    .values({
      workspaceId,
      domain,
      topic,
      context,
      heuristic,
      reasoning,
      experience: `SME Correction: ${smeCorrectionText}`,
      confidence: 1.0,
      validationStatus: "validated",
    })
    .returning();

  return knowledgeUnit;
}
