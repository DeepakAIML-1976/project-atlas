import { eq, or, and } from "drizzle-orm";
import {
  db,
  atlasKnowledgeUnitsTable,
  atlasEmailDraftsTable,
  atlasChatDraftsTable,
  atlasMeetingTriggersTable,
  atlasMeetingsTable,
  atlasLiveMeetingsTable,
  atlasSourcesTable,
  atlasActionsTable,
  atlasDecisionsTable,
  atlasDelegationRulesTable,
  atlasTwinPreferencesTable,
} from "@workspace/db";
import { getLLMConfig } from "./atlasLLM.js";
import { logger } from "./logger.js";
import { dispatchCalendarMeetingInvite } from "./integrations/msGraph.js";

export interface VerificationQuery {
  workspaceId: string;
  senderName: string;
  senderEmail?: string;
  ownerEmail?: string;
  messageText: string;
  channel: "teams_dm" | "teams_chat" | "teams_call" | "meeting" | "email";
  chatId?: string;
  threadHistory?: Array<{ sender: string; text: string }>;
}

export interface VerificationResult {
  replyText: string;
  category: "personal" | "project_clarification_needed" | "project_status" | "technical_engineering" | "meeting_scheduling";
  projectIdentified?: string;
  isLLMFallback?: boolean;
  evidencePillars: {
    emailsChecked: number;
    chatsChecked: number;
    knowledgeBankChecked: number;
    heuristicsChecked: number;
  };
  hierarchyEvidence?: HierarchyEvidence;
  matchedContextSummary: string;
}

export interface HierarchyEvidence {
  tier1Emails: Array<{ id: string; subject: string; sender: string; body: string }>;
  tier2Teams: Array<{ id: string; sender: string; message: string; date: Date }>;
  tier3Zoom: Array<{ id: string; sender: string; message: string; date: Date }>;
  tier4Heuristics: Array<{ id: string; topic: string; heuristic: string }>;
  tier5Sources: Array<{ id: string; title: string; kind: string; snippet: string }>;
  tier6Meetings: Array<{ id: string; title: string; scheduledAt: Date | null; location: string | null }>;
  tier7Decisions: Array<{ id: string; title: string; recommendation: string; status: string }>;
  tier8DelegationRules: Array<{ id: string; domain: string; category: string; maxRiskLevel: string; requiresApproval: boolean }>;
}

/**
 * Gathers context across all 8 tiers in strict precedence order:
 * 1) Outlook Email
 * 2) Microsoft Teams
 * 3) Zoom
 * 4) Knowledge and Heuristics
 * 5) Sources & Project Documents
 * 6) Meetings Data
 * 7) Decisions
 * 8) Delegation Rules
 */
export async function gather8TierHierarchyContext(
  workspaceId: string,
  messageText: string,
  senderName: string,
  senderEmail?: string,
): Promise<HierarchyEvidence> {
  const lowerMsg = messageText.toLowerCase();
  const words = lowerMsg.split(/\s+/).filter((w) => w.length >= 3);

  // 1. Tier 1: Outlook Email
  const allEmails = await db
    .select({
      id: atlasEmailDraftsTable.id,
      sender: atlasEmailDraftsTable.sender,
      subject: atlasEmailDraftsTable.subject,
      incomingBody: atlasEmailDraftsTable.incomingBody,
    })
    .from(atlasEmailDraftsTable)
    .where(eq(atlasEmailDraftsTable.workspaceId, workspaceId))
    .limit(300);

  const tier1Emails = allEmails
    .filter((e) => {
      const s = `${e.subject} ${e.incomingBody} ${e.sender}`.toLowerCase();
      const hasWordMatch = words.some((w) => s.includes(w));
      const senderMatch = senderName.length > 2 && e.sender.toLowerCase().includes(senderName.toLowerCase().split(" ")[0]);
      return hasWordMatch || senderMatch;
    })
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      subject: e.subject,
      sender: e.sender,
      body: e.incomingBody.slice(0, 300),
    }));

  // 2. Tier 2: Microsoft Teams
  const teamsMessages = await db
    .select({
      id: atlasChatDraftsTable.id,
      senderName: atlasChatDraftsTable.senderName,
      incomingMessage: atlasChatDraftsTable.incomingMessage,
      createdAt: atlasChatDraftsTable.createdAt,
    })
    .from(atlasChatDraftsTable)
    .where(and(eq(atlasChatDraftsTable.workspaceId, workspaceId), eq(atlasChatDraftsTable.platform, "teams")))
    .limit(100);

  const tier2Teams = teamsMessages
    .filter((t) => {
      const s = `${t.senderName} ${t.incomingMessage}`.toLowerCase();
      return words.some((w) => s.includes(w)) || (senderName && t.senderName.toLowerCase().includes(senderName.toLowerCase().split(" ")[0]));
    })
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      sender: t.senderName,
      message: t.incomingMessage.slice(0, 300),
      date: t.createdAt,
    }));

  // 3. Tier 3: Zoom
  const [zoomChats, meetingTriggers] = await Promise.all([
    db
      .select({
        id: atlasChatDraftsTable.id,
        senderName: atlasChatDraftsTable.senderName,
        incomingMessage: atlasChatDraftsTable.incomingMessage,
        createdAt: atlasChatDraftsTable.createdAt,
      })
      .from(atlasChatDraftsTable)
      .where(and(eq(atlasChatDraftsTable.workspaceId, workspaceId), eq(atlasChatDraftsTable.platform, "zoom")))
      .limit(100),
    db
      .select({
        id: atlasMeetingTriggersTable.id,
        speakerName: atlasMeetingTriggersTable.speakerName,
        questionAsked: atlasMeetingTriggersTable.questionAsked,
        twinProposedResponse: atlasMeetingTriggersTable.twinProposedResponse,
        createdAt: atlasMeetingTriggersTable.createdAt,
      })
      .from(atlasMeetingTriggersTable)
      .where(eq(atlasMeetingTriggersTable.workspaceId, workspaceId))
      .limit(50),
  ]);

  const tier3Zoom: Array<{ id: string; sender: string; message: string; date: Date }> = [
    ...zoomChats.map((z) => ({
      id: z.id,
      sender: z.senderName,
      message: z.incomingMessage.slice(0, 300),
      date: z.createdAt,
    })),
    ...meetingTriggers.map((t) => ({
      id: t.id,
      sender: t.speakerName || "Meeting Speaker",
      message: `Q: ${t.questionAsked} -> Response: ${t.twinProposedResponse}`.slice(0, 300),
      date: t.createdAt,
    })),
  ]
    .filter((z) => {
      const s = `${z.sender} ${z.message}`.toLowerCase();
      return words.some((w) => s.includes(w));
    })
    .slice(0, 5);

  // 4. Tier 4: Knowledge and Heuristics
  const allHeuristics = await db
    .select({
      id: atlasKnowledgeUnitsTable.id,
      topic: atlasKnowledgeUnitsTable.topic,
      heuristic: atlasKnowledgeUnitsTable.heuristic,
      reasoning: atlasKnowledgeUnitsTable.reasoning,
    })
    .from(atlasKnowledgeUnitsTable)
    .where(or(eq(atlasKnowledgeUnitsTable.workspaceId, workspaceId), eq(atlasKnowledgeUnitsTable.isGlobal, true)));

  const matchingHeuristics = allHeuristics.filter((ku) => {
    const text = `${ku.topic} ${ku.heuristic || ""} ${ku.reasoning || ""}`.toLowerCase();
    return words.some((w) => w.length > 3 && text.includes(w));
  });

  const tier4Heuristics = (matchingHeuristics.length > 0 ? matchingHeuristics : allHeuristics.slice(0, 10)).map((ku) => ({
    id: ku.id,
    topic: ku.topic,
    heuristic: ku.heuristic || ku.reasoning || "",
  }));

  // 5. Tier 5: Sources & Project Documents
  const sources = await db
    .select({
      id: atlasSourcesTable.id,
      title: atlasSourcesTable.title,
      kind: atlasSourcesTable.kind,
      content: atlasSourcesTable.content,
    })
    .from(atlasSourcesTable)
    .where(eq(atlasSourcesTable.workspaceId, workspaceId))
    .limit(200);

  const tier5Sources = sources
    .filter((s) => {
      const text = `${s.title} ${s.content || ""}`.toLowerCase();
      return words.some((w) => w.length > 3 && text.includes(w));
    })
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      snippet: (s.content || "").slice(0, 300),
    }));

  // 6. Tier 6: Meetings Data
  const [liveMeetings, generalMeetings] = await Promise.all([
    db
      .select({
        id: atlasLiveMeetingsTable.id,
        meetingTitle: atlasLiveMeetingsTable.meetingTitle,
        scheduledAt: atlasLiveMeetingsTable.scheduledAt,
        location: atlasLiveMeetingsTable.location,
      })
      .from(atlasLiveMeetingsTable)
      .where(eq(atlasLiveMeetingsTable.workspaceId, workspaceId))
      .limit(30),
    db
      .select({
        id: atlasMeetingsTable.id,
        title: atlasMeetingsTable.title,
        scheduledAt: atlasMeetingsTable.scheduledAt,
      })
      .from(atlasMeetingsTable)
      .where(eq(atlasMeetingsTable.workspaceId, workspaceId))
      .limit(30),
  ]);

  const tier6Meetings: Array<{ id: string; title: string; scheduledAt: Date | null; location: string | null }> = [
    ...liveMeetings.map((m) => ({
      id: m.id,
      title: m.meetingTitle,
      scheduledAt: m.scheduledAt,
      location: m.location,
    })),
    ...generalMeetings.map((m) => ({
      id: m.id,
      title: m.title,
      scheduledAt: m.scheduledAt,
      location: "Outlook / Teams Calendar",
    })),
  ]
    .filter((m) => {
      const text = m.title.toLowerCase();
      return words.some((w) => text.includes(w)) || true;
    })
    .slice(0, 5);

  // 7. Tier 7: Decisions
  const decisions = await db
    .select({
      id: atlasDecisionsTable.id,
      title: atlasDecisionsTable.title,
      recommendation: atlasDecisionsTable.recommendation,
      status: atlasDecisionsTable.status,
    })
    .from(atlasDecisionsTable)
    .where(eq(atlasDecisionsTable.workspaceId, workspaceId))
    .limit(50);

  const tier7Decisions = decisions
    .filter((d) => {
      const text = `${d.title} ${d.recommendation}`.toLowerCase();
      return words.some((w) => w.length > 3 && text.includes(w));
    })
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: d.title,
      recommendation: d.recommendation,
      status: d.status,
    }));

  // 8. Tier 8: Delegation Rules
  const delegationRules = await db
    .select({
      id: atlasDelegationRulesTable.id,
      domain: atlasDelegationRulesTable.domain,
      category: atlasDelegationRulesTable.category,
      maxRiskLevel: atlasDelegationRulesTable.maxRiskLevel,
      requiresHumanApproval: atlasDelegationRulesTable.requiresHumanApproval,
    })
    .from(atlasDelegationRulesTable)
    .where(eq(atlasDelegationRulesTable.workspaceId, workspaceId))
    .limit(50);

  const tier8DelegationRules = delegationRules.map((r) => ({
    id: r.id,
    domain: r.domain,
    category: r.category,
    maxRiskLevel: r.maxRiskLevel,
    requiresApproval: r.requiresHumanApproval,
  }));

  return {
    tier1Emails,
    tier2Teams,
    tier3Zoom,
    tier4Heuristics,
    tier5Sources,
    tier6Meetings,
    tier7Decisions,
    tier8DelegationRules,
  };
}

export function format8TierHierarchyPrompt(evidence: HierarchyEvidence): string {
  const t1 = evidence.tier1Emails.length > 0
    ? evidence.tier1Emails.map((e) => `  - [Subject: ${e.subject}] From: ${e.sender} -> ${e.body}`).join("\n")
    : "  - (No matching prior emails found in inbox database)";

  const t2 = evidence.tier2Teams.length > 0
    ? evidence.tier2Teams.map((t) => `  - [Teams msg from ${t.sender}]: ${t.message}`).join("\n")
    : "  - (No matching prior Teams messages found)";

  const t3 = evidence.tier3Zoom.length > 0
    ? evidence.tier3Zoom.map((z) => `  - [Zoom transcript from ${z.sender}]: ${z.message}`).join("\n")
    : "  - (No matching Zoom meeting chat transcripts found)";

  const t4 = evidence.tier4Heuristics.length > 0
    ? evidence.tier4Heuristics.map((h) => `  - [Rule: ${h.topic}]: ${h.heuristic}`).join("\n")
    : "  - (Standard ASME B31.3 / B16.5 piping engineering principles apply)";

  const t5 = evidence.tier5Sources.length > 0
    ? evidence.tier5Sources.map((s) => `  - [Source: ${s.title} (${s.kind})]: ${s.snippet}`).join("\n")
    : "  - (No specific project document snippets matched)";

  const t6 = evidence.tier6Meetings.length > 0
    ? evidence.tier6Meetings.map((m) => `  - [Meeting: ${m.title}] Scheduled: ${m.scheduledAt ? new Date(m.scheduledAt).toISOString() : "TBD"} (Location: ${m.location || "Teams/Zoom"})`).join("\n")
    : "  - (No matching calendar meetings scheduled)";

  const t7 = evidence.tier7Decisions.length > 0
    ? evidence.tier7Decisions.map((d) => `  - [Decision: ${d.title}] Recommendation: ${d.recommendation} (Status: ${d.status})`).join("\n")
    : "  - (No prior engineering decisions recorded)";

  const t8 = evidence.tier8DelegationRules.length > 0
    ? evidence.tier8DelegationRules.map((r) => `  - [Delegation: ${r.domain} / ${r.category}] Max Risk: ${r.maxRiskLevel}, Requires Human Approval: ${r.requiresApproval}`).join("\n")
    : "  - (Standard engineering authority: all formal commitments require Deepak's human approval)";

  return `======================================================================
MANDATORY 8-TIER CONTEXTUAL INFORMATION HIERARCHY (Follow in strict precedence order):
======================================================================
1) OUTLOOK EMAIL CONTEXT:
${t1}

2) MICROSOFT TEAMS CONTEXT:
${t2}

3) ZOOM CONTEXT:
${t3}

4) KNOWLEDGE AND HEURISTICS (Deepak's 16 Golden Piping Heuristics & SME Rules):
${t4}

5) SOURCES (Project 5884/5533 specs, ASME B31.3 / B16.5 codes, P&IDs):
${t5}

6) MEETINGS DATA (Calendar Meetings, Schedules, Agendas, Participants):
${t6}

7) DECISIONS (Approved Engineering Decisions & Sign-offs):
${t7}

8) DELEGATION RULES (Discipline Ownership, Risk Levels & Delegation Boundaries):
${t8}
======================================================================`;
}

/**
 * 8-Tier Context Verification & Resolution Engine
 * Cross-references Outlook Emails, Teams, Zoom, Knowledge & Heuristics, Sources,
 * Meetings, Decisions, and Delegation Rules in strict order of precedence.
 */
export async function verifyContextAndResolve(query: VerificationQuery): Promise<VerificationResult> {
  const { workspaceId, senderName, senderEmail, messageText, channel, threadHistory = [] } = query;
  const lowerMsg = messageText.toLowerCase();

  // Load active twin preferences / signature for this workspace
  let twinSignature = "Deepak's AI Representative";
  try {
    const prefs = await db
      .select({ signature: atlasTwinPreferencesTable.signature })
      .from(atlasTwinPreferencesTable)
      .where(eq(atlasTwinPreferencesTable.workspaceId, workspaceId))
      .limit(1);
    if (prefs.length > 0 && prefs[0].signature) {
      twinSignature = prefs[0].signature.trim();
    }
  } catch (_) {}

  // -------------------------------------------------------------
  // GATHER COMPLETE 8-TIER HIERARCHY CONTEXT (In Strict Order)
  // -------------------------------------------------------------
  const hierarchy = await gather8TierHierarchyContext(workspaceId, messageText, senderName, senderEmail);

  const relevantEmails = hierarchy.tier1Emails;
  const relevantChats = [...hierarchy.tier2Teams, ...hierarchy.tier3Zoom];
  const relevantSources = hierarchy.tier5Sources;
  const matchingHeuristics = hierarchy.tier4Heuristics;
  const relevantMeetings = hierarchy.tier6Meetings;
  const relevantDecisions = hierarchy.tier7Decisions;
  const relevantDelegationRules = hierarchy.tier8DelegationRules;

  // -------------------------------------------------------------
  // MULTI-TURN & CONTEXT EXTRACTION: Inspect Thread History & Replies
  // -------------------------------------------------------------
  const fullConversationContext = threadHistory.map((t) => `${t.sender}: ${t.text}`).join("\n");
  const combinedText = `${fullConversationContext}\n${senderName}: ${messageText}`;

  // Check for project numbers / project tags (e.g. Project 1024, Project number is 5884, P-1234, 5884, etc.)
  let detectedProject: string | undefined = undefined;
  const explicitProjectMatch = combinedText.match(
    /(?:project\s*(?:number|id|#)?\s*(?:is|:|=)?\s*|job\s*#?\s*(?:is|:|=)?\s*|wo\s*#?\s*(?:is|:|=)?\s*|work\s*order\s*#?\s*(?:is|:|=)?\s*)\s*([a-zA-Z0-9\-_]+)/i,
  );
  if (
    explicitProjectMatch &&
    !["the", "a", "an", "is", "number", "id", "for", "with"].includes(explicitProjectMatch[1].toLowerCase())
  ) {
    detectedProject = explicitProjectMatch[1];
  } else {
    const digitMatch = combinedText.match(/\b(\d{4,6})\b/);
    if (digitMatch) {
      detectedProject = digitMatch[1];
    } else {
      const entityMatch = combinedText.match(/(alky\s*reactor|hris\s*flare|saudi\s*aramco|crude\s*line)/i);
      if (entityMatch) {
        detectedProject = entityMatch[1];
      }
    }
  }

  // Strict personal keywords (social, non-work)
  const personalKeywords = ["lunch", "dinner", "coffee", "drinks", "weekend", "birthday", "party", "family", "vacation"];
  const isStrictlyPersonal = personalKeywords.some((w) => lowerMsg.includes(w)) &&
    !lowerMsg.includes("meeting") && !lowerMsg.includes("project") && !lowerMsg.includes("rfi") && !lowerMsg.includes("drawing") && !lowerMsg.includes("issue");

  // 1. Strict Personal Filter
  if (isStrictlyPersonal) {
    return {
      replyText: "i am an AI representative and not authorised to reply personal messsages.",
      category: "personal",
      evidencePillars: {
        emailsChecked: hierarchy.tier1Emails.length,
        chatsChecked: hierarchy.tier2Teams.length + hierarchy.tier3Zoom.length,
        knowledgeBankChecked: hierarchy.tier5Sources.length + hierarchy.tier7Decisions.length,
        heuristicsChecked: hierarchy.tier4Heuristics.length,
      },
      hierarchyEvidence: hierarchy,
      matchedContextSummary: "Personal social inquiry with no project or engineering keywords.",
    };
  }

  // 2. Meeting / Discussion Scheduling Request
  const isExplicitMeetingRequest =
    lowerMsg.includes("setup a meeting") ||
    lowerMsg.includes("set up a meeting") ||
    lowerMsg.includes("schedule a meeting") ||
    lowerMsg.includes("arrange a meeting") ||
    lowerMsg.includes("call to discuss") ||
    lowerMsg.includes("meeting for today") ||
    lowerMsg.includes("meeting to discuss") ||
    lowerMsg.includes("schedule it") ||
    (lowerMsg.includes("schedule") && (lowerMsg.includes("pm") || lowerMsg.includes("am") || lowerMsg.includes("today") || lowerMsg.includes("tomorrow")));

  const isFollowUpToMeetingPrompt =
    (combinedText.toLowerCase().includes("coordinate the meeting") ||
      combinedText.toLowerCase().includes("setup a meeting") ||
      combinedText.toLowerCase().includes("set up a meeting") ||
      combinedText.toLowerCase().includes("schedule a meeting") ||
      combinedText.toLowerCase().includes("meeting to discuss")) &&
    (Boolean(detectedProject) || lowerMsg.includes("schedule") || lowerMsg.includes("meeting") || lowerMsg.includes("pm") || lowerMsg.includes("am"));

  const isMeetingRequest = isExplicitMeetingRequest || isFollowUpToMeetingPrompt;

  if (isMeetingRequest) {
    // Extract any time mention (from current message or thread history)
    const timeMatches =
      messageText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)|\btoday\b|\btomorrow\b)/gi) ||
      combinedText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)|\btoday\b|\btomorrow\b)/gi);
    const timeMentioned = timeMatches ? timeMatches.join(" ") : "the requested time";

    if (!detectedProject) {
      const replyText = `${twinSignature}: I will coordinate the meeting for ${timeMentioned} to discuss this issue. Could you please specify the Project Number or Work Order ID so I can link the agenda to our project drawings, open RFIs, and email records and send out the Microsoft Teams invitation?`;
      return {
        replyText,
        category: "project_clarification_needed",
        evidencePillars: {
          emailsChecked: hierarchy.tier1Emails.length,
          chatsChecked: hierarchy.tier2Teams.length + hierarchy.tier3Zoom.length,
          knowledgeBankChecked: hierarchy.tier5Sources.length + hierarchy.tier7Decisions.length,
          heuristicsChecked: hierarchy.tier4Heuristics.length,
        },
        hierarchyEvidence: hierarchy,
        matchedContextSummary: `Meeting scheduling requested for ${timeMentioned}. Prompting user for Project ID.`,
      };
    } else {
      // Extract attendee email addresses
      const emailMatches =
        messageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ||
        combinedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ||
        [];

      const attendeeList = Array.from(
        new Set([
          ...emailMatches,
          ...(senderEmail ? [senderEmail] : []),
          "deepak.paranjape@kentplc.com",
        ]),
      );

      // Dispatch directly to Microsoft Graph Calendar / Mail with .ics invite
      const calendarResult = await dispatchCalendarMeetingInvite({
        projectNumber: detectedProject,
        timeText: timeMentioned,
        attendees: attendeeList,
        topic: "Technical Review & Construction Drawings / RFI Closures",
        workspaceId,
      });

      // Also persist Action Item in Knowledge Base
      try {
        await db.insert(atlasActionsTable).values({
          workspaceId,
          meetingId: (await db.select({ id: atlasMeetingsTable.id }).from(atlasMeetingsTable).limit(1))[0]?.id || `teams_mtg_${detectedProject}`,
          title: `Project ${detectedProject}: Teams Meeting Scheduled for ${timeMentioned}`,
          owner: senderName,
          status: "open",
        }).catch(() => {});
      } catch (err: any) {
        logger.warn({ err: err?.message }, "Failed to persist meeting action item");
      }

      const attendeeText = attendeeList.length > 0 ? attendeeList.join(", ") : "Project Engineering Team";

      const replyText = `${twinSignature}: Meeting confirmed and scheduled for ${timeMentioned} regarding Project ${detectedProject}.

Topic: Technical Review & Construction Drawing / RFI Closures
Participants: ${twinSignature.replace(/'s AI Representative.*$/i, '')}, ${attendeeText}
Platform: Microsoft Teams
Meeting Link: ${calendarResult.meetingLink}

Calendar Status: The calendar invitation has been generated and dispatched directly to your Outlook and Microsoft Teams calendar.`;

      return {
        replyText,
        category: "meeting_scheduling",
        projectIdentified: detectedProject,
        evidencePillars: {
          emailsChecked: hierarchy.tier1Emails.length,
          chatsChecked: hierarchy.tier2Teams.length + hierarchy.tier3Zoom.length,
          knowledgeBankChecked: hierarchy.tier5Sources.length + hierarchy.tier7Decisions.length,
          heuristicsChecked: hierarchy.tier4Heuristics.length,
        },
        hierarchyEvidence: hierarchy,
        matchedContextSummary: `Meeting confirmed and dispatched to calendar for ${timeMentioned} for Project ${detectedProject}.`,
      };
    }
  }

  // 3. Project Status / Deliverable Inquiry missing Project Number
  const isProjectStatusInquiry = (
    lowerMsg.includes("drawing") ||
    lowerMsg.includes("drawings") ||
    lowerMsg.includes("rfi") ||
    lowerMsg.includes("rfis") ||
    lowerMsg.includes("construction") ||
    lowerMsg.includes("closure") ||
    lowerMsg.includes("closures") ||
    lowerMsg.includes("deliverable") ||
    lowerMsg.includes("package") ||
    lowerMsg.includes("submittal") ||
    lowerMsg.includes("punch") ||
    lowerMsg.includes("last month")
  );

  if (isProjectStatusInquiry && !detectedProject) {
    let replyText = "";
    if (lowerMsg.includes("rfi") || lowerMsg.includes("construction") || lowerMsg.includes("closure") || lowerMsg.includes("drawing")) {
      replyText = `${twinSignature}: I noted your update regarding the construction closures, drawings, and open RFIs. Could you please specify the Project Number or Work Order ID (e.g. Project ID) so I can verify the latest drawing revisions, RFI tracking logs, and email correspondences across our project records?`;
    } else {
      replyText = `${twinSignature}: To verify the latest status across our email database, drawing logs, and open deliverables, could you please provide the Project Number or Work Order reference?`;
    }

    return {
      replyText,
      category: "project_clarification_needed",
      evidencePillars: {
        emailsChecked: hierarchy.tier1Emails.length,
        chatsChecked: hierarchy.tier2Teams.length + hierarchy.tier3Zoom.length,
        knowledgeBankChecked: hierarchy.tier5Sources.length + hierarchy.tier7Decisions.length,
        heuristicsChecked: hierarchy.tier4Heuristics.length,
      },
      hierarchyEvidence: hierarchy,
      matchedContextSummary: "Project deliverable query detected without specified Project Number. Prompting user for Project ID.",
    };
  }

  // 4. Technical / Project Query with Strict 8-Tier Hierarchy Grounding
  const totalRelevantMatches =
    hierarchy.tier1Emails.length +
    hierarchy.tier2Teams.length +
    hierarchy.tier3Zoom.length +
    hierarchy.tier4Heuristics.length +
    hierarchy.tier5Sources.length +
    hierarchy.tier6Meetings.length +
    hierarchy.tier7Decisions.length +
    hierarchy.tier8DelegationRules.length;

  const isLLMFallback = totalRelevantMatches === 0;

  const llm = getLLMConfig();
  let replyText = "";

  if (llm.isConfigured && llm.client) {
    try {
      const ownerName = twinSignature.replace(/'s AI Representative.*$/i, "").trim() || "Deepak Paranjape";
      const systemContent = isLLMFallback
        ? `You are ${twinSignature} operating inside Microsoft Teams, live meetings, and email.
The owner (${ownerName}) is a Senior Oil & Gas Piping Engineering Subject Matter Expert (SME) at Kent PLC.

ZERO-CONTEXT LLM API FALLBACK PROTOCOL:
No direct matching records or heuristics were found across the 8-tier hierarchy (Emails, Teams, Zoom, Heuristics, Sources, Meetings, Decisions, Delegation Rules).
As instructed, use first-principles engineering reasoning and professional ASME B31.3 / API 570 practices to generate an authoritative draft reply.

MANDATORY FORMAT:
Start your response exactly with:
${twinSignature}: [Draft generated via LLM First-Principles Reasoning - No direct internal mailbox or project records found]

Provide a detailed, practical technical draft for the owner's review.`
        : `You are ${twinSignature} operating inside Microsoft Teams, live meetings, and email.
The owner (${ownerName}) is a 35-year Senior Oil & Gas Piping Engineering Subject Matter Expert (SME) at Kent PLC.

${format8TierHierarchyPrompt(hierarchy)}

DETECTED PROJECT: ${detectedProject || "None identified"}

MANDATORY HIERARCHICAL REASONING INSTRUCTIONS:
1. You MUST follow the 8-tier hierarchy above in strict order of priority (1 down to 8) to synthesize your draft reply:
   - 1) Outlook Email: Look first for prior email exchanges, transmittals, or correspondence with ${senderName} or on this topic.
   - 2) Microsoft Teams: Look second for prior Teams chats, channel messages, or DM threads.
   - 3) Zoom: Look third for Zoom meeting chats or transcripts where this topic was discussed.
   - 4) Knowledge & Heuristics: Ground your technical piping judgment strictly in Deepak's 16 golden piping engineering heuristics (e.g. wall thickness, minimum straight run, dead legs, severe cyclic conditions, flange ratings).
   - 5) Sources: Cross-reference project documents (Project 5884 Alky Reactor, Project 5533, ASME B31.3 / B16.5 standards).
   - 6) Meetings Data: Refer to scheduled/past meetings, dates, or participants if relevant.
   - 7) Decisions: Adhere to previously approved technical decisions and sign-offs.
   - 8) Delegation Rules: Respect discipline scope boundaries, risk levels, and human approval limits.
2. Ground your reply directly in the verified context found across these 8 tiers.
3. If project status, construction closures, or drawings are discussed and a project was identified, address the exact status, RFIs, and next steps.
4. If this is a meeting coordination request, confirm the meeting and reference the project context.
5. If this is a technical piping code question (e.g. ASME B31.3, API 570, hydrotest, wall thickness), provide an authoritative SME engineering answer citing the code clauses and safety checks.
6. Prepend your reply with "${twinSignature}: ".
7. If the message is strictly personal/social (lunch, dinner, weekend, non-work social chit-chat), reply EXACTLY with:
"i am an AI representative and not authorised to reply personal messsages."`;

      const res = await llm.client.chat.completions.create({
        model: llm.model,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: systemContent,
          },
          {
            role: "user",
            content: `Recent Conversation Turns:\n${fullConversationContext || "None"}\n\nIncoming Message from ${senderName} (${channel}): "${messageText}"`,
          },
        ],
      });

      replyText = res.choices[0]?.message?.content?.trim() || "";
    } catch (err: any) {
      logger.warn({ err: err?.message }, "LLM Context Verification response generation fallback");
    }
  }

  if (!replyText) {
    if (hierarchy.tier4Heuristics.length > 0) {
      const topRule = hierarchy.tier4Heuristics[0];
      replyText = `${twinSignature}: Based on established engineering heuristics for ${topRule.topic}: ${topRule.heuristic}`;
    } else if (hierarchy.tier5Sources.length > 0) {
      const topSource = hierarchy.tier5Sources[0];
      replyText = `${twinSignature}: Based on ${topSource.title}: ${topSource.snippet.slice(0, 200)}...`;
    } else if (hierarchy.tier7Decisions.length > 0) {
      const topDecision = hierarchy.tier7Decisions[0];
      replyText = `${twinSignature}: Regarding ${topDecision.title}, the approved engineering recommendation is: ${topDecision.recommendation}`;
    } else if (isLLMFallback) {
      replyText = `${twinSignature}: [Draft generated via LLM First-Principles Reasoning - No direct internal mailbox or project records found] Based on general ASME B31.3 piping engineering principles, further design review is recommended.`;
    } else {
      replyText = `${twinSignature}: I have received your message and cross-checked our project records and engineering knowledge base. I will follow up with the owner to confirm the latest update.`;
    }
  }

  // Double check: if an LLM-generated reply confirmed meeting scheduling, ensure the calendar invite was actually dispatched
  if (
    detectedProject &&
    (replyText.toLowerCase().includes("calendar invite") ||
      replyText.toLowerCase().includes("meeting coordination confirmed") ||
      replyText.toLowerCase().includes("meeting confirmed") ||
      replyText.toLowerCase().includes("scheduled for"))
  ) {
    const timeMatches =
      messageText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)|\btoday\b|\btomorrow\b)/gi) ||
      combinedText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)|\btoday\b|\btomorrow\b)/gi);
    const timeMentioned = timeMatches ? timeMatches.join(" ") : "today";
    const emailMatches =
      messageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ||
      combinedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ||
      [];
    const attendeeList = Array.from(
      new Set([
        ...emailMatches,
        ...(senderEmail ? [senderEmail] : []),
        "deepak.paranjape@kentplc.com",
      ]),
    );

    await dispatchCalendarMeetingInvite({
      projectNumber: detectedProject,
      timeText: timeMentioned,
      attendees: attendeeList,
      topic: "Technical Review & Construction Drawings / RFI Closures",
      workspaceId,
    }).catch((err) => {
      logger.warn({ err: err?.message }, "Background calendar invite dispatch error");
    });
  }

  return {
    replyText,
    category: detectedProject ? "project_status" : "technical_engineering",
    projectIdentified: detectedProject,
    isLLMFallback,
    evidencePillars: {
      emailsChecked: hierarchy.tier1Emails.length,
      chatsChecked: hierarchy.tier2Teams.length + hierarchy.tier3Zoom.length,
      knowledgeBankChecked: hierarchy.tier5Sources.length + hierarchy.tier7Decisions.length,
      heuristicsChecked: hierarchy.tier4Heuristics.length,
    },
    hierarchyEvidence: hierarchy,
    matchedContextSummary: isLLMFallback
      ? "No direct 8-tier hierarchy records found. Triggered LLM API First-Principles Fallback."
      : `Hierarchy Matched: Emails(${hierarchy.tier1Emails.length}), Teams(${hierarchy.tier2Teams.length}), Zoom(${hierarchy.tier3Zoom.length}), Heuristics(${hierarchy.tier4Heuristics.length}), Sources(${hierarchy.tier5Sources.length}), Meetings(${hierarchy.tier6Meetings.length}), Decisions(${hierarchy.tier7Decisions.length}), Delegation(${hierarchy.tier8DelegationRules.length})`,
  };
}
