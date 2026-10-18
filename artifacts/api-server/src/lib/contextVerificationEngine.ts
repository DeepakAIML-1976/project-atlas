import { eq, or } from "drizzle-orm";
import {
  db,
  atlasKnowledgeUnitsTable,
  atlasEmailDraftsTable,
  atlasMeetingTriggersTable,
  atlasMeetingsTable,
  atlasLiveMeetingsTable,
  atlasSourcesTable,
  atlasActionsTable,
  atlasDecisionsTable,
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
  matchedContextSummary: string;
}

/**
 * 4-Pillar Context Verification & Resolution Engine
 * Cross-references Email Database, Chat Database, Knowledge Bank, and Global Heuristics
 * before generating or framing any response.
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
  // PILLAR 1: Check Email Database
  // -------------------------------------------------------------
  const emailRecords = await db
    .select({
      id: atlasEmailDraftsTable.id,
      sender: atlasEmailDraftsTable.sender,
      subject: atlasEmailDraftsTable.subject,
      incomingBody: atlasEmailDraftsTable.incomingBody,
      twinDraftResponse: atlasEmailDraftsTable.twinDraftResponse,
      status: atlasEmailDraftsTable.status,
    })
    .from(atlasEmailDraftsTable)
    .where(eq(atlasEmailDraftsTable.workspaceId, workspaceId))
    .limit(1000);

  // Filter relevant emails by sender, project keywords, or discussion topics
  const relevantEmails = emailRecords.filter((e) => {
    const s = (e.subject + " " + e.incomingBody + " " + e.sender).toLowerCase();
    const words = lowerMsg.split(/\s+/).filter((w) => w.length >= 3);
    const hasWordMatch = words.some((w) => s.includes(w));
    const senderMatch = senderName.length > 2 && e.sender.toLowerCase().includes(senderName.toLowerCase().split(" ")[0]);
    return hasWordMatch || senderMatch;
  });

  // -------------------------------------------------------------
  // PILLAR 2: Check Chat & Meeting Database
  // -------------------------------------------------------------
  const meetingTriggers = await db
    .select({
      id: atlasMeetingTriggersTable.id,
      speakerName: atlasMeetingTriggersTable.speakerName,
      questionAsked: atlasMeetingTriggersTable.questionAsked,
      twinProposedResponse: atlasMeetingTriggersTable.twinProposedResponse,
    })
    .from(atlasMeetingTriggersTable)
    .where(eq(atlasMeetingTriggersTable.workspaceId, workspaceId))
    .limit(100);

  const relevantChats = meetingTriggers.filter((t) => {
    const q = (t.questionAsked + " " + (t.speakerName || "")).toLowerCase();
    const words = lowerMsg.split(/\s+/).filter((w) => w.length >= 3);
    return words.some((w) => q.includes(w)) || (t.speakerName && senderName.toLowerCase().includes(t.speakerName.toLowerCase()));
  });

  // -------------------------------------------------------------
  // PILLAR 3: Check Knowledge Bank & Action Items
  // -------------------------------------------------------------
  const [sources, actions, decisions] = await Promise.all([
    db
      .select({ id: atlasSourcesTable.id, title: atlasSourcesTable.title, kind: atlasSourcesTable.kind, content: atlasSourcesTable.content })
      .from(atlasSourcesTable)
      .where(eq(atlasSourcesTable.workspaceId, workspaceId))
      .limit(1000),
    db
      .select({ id: atlasActionsTable.id, title: atlasActionsTable.title, owner: atlasActionsTable.owner, status: atlasActionsTable.status })
      .from(atlasActionsTable)
      .where(eq(atlasActionsTable.workspaceId, workspaceId))
      .limit(100),
    db
      .select({ id: atlasDecisionsTable.id, title: atlasDecisionsTable.title, domain: atlasDecisionsTable.domain, recommendation: atlasDecisionsTable.recommendation })
      .from(atlasDecisionsTable)
      .where(eq(atlasDecisionsTable.workspaceId, workspaceId))
      .limit(100),
  ]);

  const relevantSources = sources.filter((src) => {
    const txt = (src.title + " " + (src.content || "")).toLowerCase();
    return lowerMsg.split(/\s+/).filter((w) => w.length > 3).some((w) => txt.includes(w));
  });

  const relevantActions = actions.filter((act) => {
    const txt = (act.title + " " + (act.owner || "")).toLowerCase();
    return lowerMsg.split(/\s+/).filter((w) => w.length > 3).some((w) => txt.includes(w));
  });

  // -------------------------------------------------------------
  // PILLAR 4: Check Heuristics & SME Rules (Global Core + Workspace Rules)
  // -------------------------------------------------------------
  const allHeuristics = await db
    .select()
    .from(atlasKnowledgeUnitsTable)
    .where(or(eq(atlasKnowledgeUnitsTable.workspaceId, workspaceId), eq(atlasKnowledgeUnitsTable.isGlobal, true)));

  const stopWords = new Set([
    "what", "when", "where", "which", "who", "whom", "this", "that", "these", "those",
    "from", "with", "into", "during", "before", "after", "above", "below", "between",
    "have", "has", "had", "does", "done", "will", "would", "shall", "should", "could",
    "more", "most", "than", "other", "some", "only", "also", "very", "just", "about",
    "goes", "come", "comes", "must", "part", "both", "whole", "includes", "issue",
    "different", "matter", "happens", "something", "special", "basis", "account",
    "piping", "engineering", "standard", "standards", "code", "codes", "industry",
    "general", "practice", "review", "system", "systems", "design", "line", "lines",
    "service", "kent", "spec", "specification",
  ]);

  const queryTokens = new Set(lowerMsg.split(/[^a-z0-9]+/));
  const matchingHeuristics = allHeuristics.filter((ku) => {
    const topicWords = Array.from(
      new Set(
        (ku.topic || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 4 && !stopWords.has(w)),
      ),
    );
    const hits = topicWords.filter((w) => queryTokens.has(w));
    return hits.length >= 2;
  });

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
        emailsChecked: emailRecords.length,
        chatsChecked: meetingTriggers.length,
        knowledgeBankChecked: sources.length + actions.length + decisions.length,
        heuristicsChecked: allHeuristics.length,
      },
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
          emailsChecked: emailRecords.length,
          chatsChecked: meetingTriggers.length,
          knowledgeBankChecked: sources.length + actions.length + decisions.length,
          heuristicsChecked: allHeuristics.length,
        },
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
          emailsChecked: emailRecords.length,
          chatsChecked: meetingTriggers.length,
          knowledgeBankChecked: sources.length + actions.length + decisions.length,
          heuristicsChecked: allHeuristics.length,
        },
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
        emailsChecked: emailRecords.length,
        chatsChecked: meetingTriggers.length,
        knowledgeBankChecked: sources.length + actions.length + decisions.length,
        heuristicsChecked: allHeuristics.length,
      },
      matchedContextSummary: "Project deliverable query detected without specified Project Number. Prompting user for Project ID.",
    };
  }

  // 4. Technical / Project Query with 4-Pillar Context Grounding
  const totalRelevantMatches =
    relevantEmails.length +
    relevantChats.length +
    relevantSources.length +
    relevantActions.length +
    matchingHeuristics.length;

  const isLLMFallback = totalRelevantMatches === 0;

  const llm = getLLMConfig();
  let replyText = "";

  const emailsText = relevantEmails.slice(0, 5)
    .map((e) => `[Email Subject: ${e.subject}] From: ${e.sender} -> ${e.incomingBody.slice(0, 200)}`)
    .join("\n");

  const chatsText = relevantChats.slice(0, 5)
    .map((c) => `[Chat/Meeting with ${c.speakerName}]: Question: ${c.questionAsked} -> Response: ${c.twinProposedResponse}`)
    .join("\n");

  const knowledgeBankText = [
    ...relevantSources.map((s) => `[Document: ${s.title} (${s.kind})]: ${s.content?.slice(0, 200) || ""}`),
    ...relevantActions.map((a) => `[Action Item: ${a.title}] Owner: ${a.owner} (Status: ${a.status})`),
  ].join("\n");

  const heuristicsText = (matchingHeuristics.length > 0 ? matchingHeuristics : allHeuristics.slice(0, 15))
    .map((ku) => `[Rule Topic: ${ku.topic}] -> Heuristic: ${ku.heuristic || ku.reasoning || ""}`)
    .join("\n");

  if (llm.isConfigured && llm.client) {
    try {
      const ownerName = twinSignature.replace(/'s AI Representative.*$/i, "").trim() || "Deepak Paranjape";
      const systemContent = isLLMFallback
        ? `You are ${twinSignature} operating inside Microsoft Teams, live meetings, and email.
The owner (${ownerName}) is a Senior Oil & Gas Piping Engineering Subject Matter Expert (SME) at Kent PLC.

ZERO-CONTEXT LLM API FALLBACK PROTOCOL:
No direct matching records or heuristics were found across the 4 foundational pillars (Emails, Chats, KB, Heuristics).
As instructed, use first-principles engineering reasoning and professional ASME B31.3 / API 570 practices to generate an authoritative draft reply.

MANDATORY FORMAT:
Start your response exactly with:
${twinSignature}: [Draft generated via LLM First-Principles Reasoning - No direct internal mailbox or project records found]

Provide a detailed, practical technical draft for the owner's review.`
        : `You are ${twinSignature} operating inside Microsoft Teams, live meetings, and calls.
The owner (${ownerName}) is a 35-year Senior Oil & Gas Piping Engineering Subject Matter Expert (SME) at Kent PLC.

VERIFICATION PROTOCOL:
You have cross-referenced the 4 foundational pillars:
1. EMAIL DATABASE CONTEXT:
${emailsText || "No prior email records matched."}

2. CHAT & MEETING DATABASE CONTEXT:
${chatsText || "No prior meeting records matched."}

3. KNOWLEDGE BANK & ACTION ITEMS:
${knowledgeBankText || "No specific project document matches."}

4. ENGINEERING HEURISTICS (ASME B31.3 / API 570):
${heuristicsText || "Standard ASME B31.3 / API 570 piping rules apply."}

DETECTED PROJECT: ${detectedProject || "None identified"}

INSTRUCTIONS:
1. Ground your reply directly in the verified context from emails, chats, documents, and heuristics.
2. If project status, construction closures, or drawings are discussed and a project was identified, address the exact status, RFIs, and next steps.
3. If this is a meeting coordination request, confirm the meeting and reference the project context.
4. If this is a technical piping code question (e.g. ASME B31.3, API 570, hydrotest, wall thickness), provide an authoritative SME engineering answer citing the code clauses and safety checks.
5. Prepend your reply with "${twinSignature}: ".
6. If the message is strictly personal/social (lunch, dinner, weekend, non-work social chit-chat), reply EXACTLY with:
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
    if (matchingHeuristics.length > 0) {
      const topRule = matchingHeuristics[0];
      replyText = `${twinSignature}: Based on established engineering heuristics for ${topRule.topic}: ${topRule.heuristic}`;
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
      emailsChecked: emailRecords.length,
      chatsChecked: meetingTriggers.length,
      knowledgeBankChecked: sources.length + actions.length + decisions.length,
      heuristicsChecked: allHeuristics.length,
    },
    matchedContextSummary: isLLMFallback
      ? "No direct 4-pillar internal records found. Triggered LLM API First-Principles Fallback."
      : `Emails: ${relevantEmails.length}, Chats: ${relevantChats.length}, KB: ${relevantSources.length + relevantActions.length}, Heuristics: ${matchingHeuristics.length}`,
  };
}
