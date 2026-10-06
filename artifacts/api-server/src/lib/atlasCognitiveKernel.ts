import { and, eq } from "drizzle-orm";
import { atlasDelegationRulesTable, atlasKnowledgeUnitsTable, atlasTwinsTable, db } from "@workspace/db";

export interface ContextParams {
  projectPhase?: "concept" | "feed" | "detailed" | "construction" | "commissioning";
  fluidService?: string;
  designPressure?: string;
  designTemperature?: string;
  applicableCodes?: string[];
}

export interface GovernanceCheckParams {
  actionType: "query" | "email_draft" | "meeting_intervention" | "spec_approval" | "pandid_review";
  riskLevel: "low" | "medium" | "high" | "critical";
  confidence: number;
}

export interface GovernanceCheckResult {
  authorized: boolean;
  requiresHumanApproval: boolean;
  governanceReason: string;
  identityTag: string;
}

export class CognitiveKernel {
  public static IDENTITY_TAG = "Deepak's AI Representative (Atlas)";

  public static async evaluateGovernance(
    workspaceId: string,
    params: GovernanceCheckParams,
  ): Promise<GovernanceCheckResult> {
    const { actionType, riskLevel, confidence } = params;

    // Check workspace delegation rules
    const rules = await db
      .select()
      .from(atlasDelegationRulesTable)
      .where(eq(atlasDelegationRulesTable.workspaceId, workspaceId));

    const matchingRule = rules.find((r) => r.maxRiskLevel === riskLevel);

    if (riskLevel === "low" && confidence >= 0.85) {
      if (matchingRule && !matchingRule.requiresHumanApproval && matchingRule.autoExecutionEnabled) {
        return {
          authorized: true,
          requiresHumanApproval: false,
          governanceReason: "Action authorized under Low-Risk Auto-Execution Delegation Rule.",
          identityTag: CognitiveKernel.IDENTITY_TAG,
        };
      }
    }

    // Medium, High, and Critical Risk actions require human SME authorization inbox sign-off
    return {
      authorized: false,
      requiresHumanApproval: true,
      governanceReason: `Action categorized as ${riskLevel.toUpperCase()} risk (${actionType}). Routed to Deepak's Executive Authorization Inbox for sign-off under Article III of the Twin Constitution.`,
      identityTag: CognitiveKernel.IDENTITY_TAG,
    };
  }

  public static formatProvenanceResponse(
    responseContent: string,
    provenanceType: "FACT_CODE" | "SME_EXPERIENCE" | "INFERRED_PREFERENCE" | "UNKNOWN",
    confidence: number,
    evidenceSources: string[] = [],
  ): { formattedResponse: string; provenanceType: string; confidence: number; evidenceSources: string[] } {
    const tagMap = {
      FACT_CODE: "[FACT / CODE STANDARD]",
      SME_EXPERIENCE: "[SME EXPERIENTIAL HEURISTIC]",
      INFERRED_PREFERENCE: "[INFERRED SME PREFERENCE]",
      UNKNOWN: "[UNKNOWN / UNCERTAIN]",
    };

    const prefix = tagMap[provenanceType] || "[SME EXPERIENTIAL HEURISTIC]";
    const formattedResponse = `${CognitiveKernel.IDENTITY_TAG} ${prefix}:\n\n${responseContent}`;

    return {
      formattedResponse,
      provenanceType,
      confidence,
      evidenceSources,
    };
  }
}
