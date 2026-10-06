import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const atlasWorkspacesTable = pgTable("atlas_workspaces", {
  id: id(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  createdAt: createdAt(),
});

export const atlasMembershipsTable = pgTable(
  "atlas_memberships",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.workspaceId, table.userId),
    index("atlas_memberships_user_idx").on(table.userId),
  ],
);

export const atlasTwinsTable = pgTable(
  "atlas_twins",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    displayName: text("display_name"),
    autonomyLevel: integer("autonomy_level").notNull().default(1),
    autonomyReason: text("autonomy_reason"),
    autonomyUpdatedAt: timestamp("autonomy_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.workspaceId, table.ownerId),
    index("atlas_twins_workspace_idx").on(table.workspaceId),
  ],
);

export const atlasTwinFieldsTable = pgTable(
  "atlas_twin_fields",
  {
    id: id(),
    twinId: text("twin_id")
      .notNull()
      .references(() => atlasTwinsTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    evidenceStatus: text("evidence_status").notNull().default("unknown"),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    confidence: doublePrecision("confidence"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.twinId, table.key)],
);

export const atlasUploadsTable = pgTable(
  "atlas_uploads",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    objectPath: text("object_path").notNull().unique(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: createdAt(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [index("atlas_uploads_owner_idx").on(table.workspaceId, table.userId)],
);

export const atlasSourcesTable = pgTable(
  "atlas_sources",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    content: text("content"),
    objectPath: text("object_path"),
    contentType: text("content_type"),
    sourceDate: timestamp("source_date", { withTimezone: true }),
    permissionConfirmed: boolean("permission_confirmed").notNull(),
    profileAnalysisConsent: boolean("profile_analysis_consent").notNull(),
    analysisStatus: text("analysis_status").notNull().default("not_requested"),
    analysisSuggestions: jsonb("analysis_suggestions")
      .$type<
        Array<{
          key: string;
          suggestedValue: string;
          evidence: string;
          confidence: number;
        }>
      >()
      .notNull()
      .default([]),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_sources_workspace_idx").on(table.workspaceId)],
);

export const atlasMeetingsTable = pgTable(
  "atlas_meetings",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull(),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    agenda: text("agenda"),
    notes: text("notes"),
    participantsInformed: boolean("participants_informed").notNull(),
    sourceId: text("source_id").references(() => atlasSourcesTable.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_meetings_workspace_idx").on(table.workspaceId)],
);

export const atlasActionsTable = pgTable(
  "atlas_actions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => atlasMeetingsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    owner: text("owner"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_actions_workspace_idx").on(table.workspaceId)],
);

export const atlasDecisionsTable = pgTable(
  "atlas_decisions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    context: text("context").notNull(),
    recommendation: text("recommendation").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    confidence: doublePrecision("confidence"),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    missingInformation: text("missing_information"),
    rejectedAlternatives: jsonb("rejected_alternatives").$type<string[]>().default([]),
    tradeOffs: text("trade_offs"),
    expectedOutcome: text("expected_outcome"),
    actualOutcome: text("actual_outcome"),
    lessonsLearned: text("lessons_learned"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("atlas_decisions_workspace_idx").on(table.workspaceId)],
);

export const atlasKnowledgeUnitsTable = pgTable(
  "atlas_knowledge_units",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    topic: text("topic").notNull(),
    problem: text("problem"),
    context: text("context"),
    experience: text("experience"),
    reasoning: text("reasoning"),
    decision: text("decision"),
    outcome: text("outcome"),
    lesson: text("lesson"),
    heuristic: text("heuristic"),
    exception: text("exception"),
    sourceRecordId: text("source_record_id"),
    confidence: doublePrecision("confidence").notNull().default(1.0),
    validationStatus: text("validation_status").notNull().default("validated"),
    createdAt: createdAt(),
  },
  (table) => [
    index("atlas_knowledge_units_workspace_idx").on(table.workspaceId),
    index("atlas_knowledge_units_domain_idx").on(table.domain),
  ],
);

export const atlasEmailDraftsTable = pgTable(
  "atlas_email_drafts",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(),
    subject: text("subject").notNull(),
    incomingBody: text("incoming_body").notNull(),
    twinDraftResponse: text("twin_draft_response").notNull(),
    reasoning: text("reasoning"),
    confidence: doublePrecision("confidence"),
    status: text("status").notNull().default("pending_authorization"),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_email_drafts_workspace_idx").on(table.workspaceId)],
);

export const atlasMeetingContributionsTable = pgTable(
  "atlas_meeting_contributions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => atlasMeetingsTable.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    twinProposedStatement: text("twin_proposed_statement").notNull(),
    engineeringBasis: text("engineering_basis"),
    status: text("status").notNull().default("pending_authorization"),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_meeting_contrib_workspace_idx").on(table.workspaceId)],
);

export const atlasLiveMeetingsTable = pgTable(
  "atlas_live_meetings",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    meetingTitle: text("meeting_title").notNull(),
    platform: text("platform").notNull().default("teams"),
    meetingUrl: text("meeting_url"),
    botStatus: text("bot_status").notNull().default("idle"),
    botDisplayName: text("bot_display_name").notNull().default("Deepak's AI Representative (Atlas)"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_live_meetings_workspace_idx").on(table.workspaceId)],
);

export const atlasMeetingTriggersTable = pgTable(
  "atlas_meeting_triggers",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    liveMeetingId: text("live_meeting_id")
      .notNull()
      .references(() => atlasLiveMeetingsTable.id, { onDelete: "cascade" }),
    speakerName: text("speaker_name"),
    triggerPhrase: text("trigger_phrase").notNull(),
    questionAsked: text("question_asked").notNull(),
    twinProposedResponse: text("twin_proposed_response").notNull(),
    outputMode: text("output_mode").notNull().default("chat"),
    humanAlertStatus: text("human_alert_status").notNull().default("notified"),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_meeting_triggers_workspace_idx").on(table.workspaceId)],
);

export const atlasDelegationRulesTable = pgTable(
  "atlas_delegation_rules",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    category: text("category").notNull(),
    maxRiskLevel: text("max_risk_level").notNull().default("low"),
    requiresHumanApproval: boolean("requires_human_approval").notNull().default(true),
    autoExecutionEnabled: boolean("auto_execution_enabled").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_delegation_rules_workspace_idx").on(table.workspaceId)],
);

export const atlasKnowledgeLinksTable = pgTable(
  "atlas_knowledge_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    sourceRecordId: text("source_record_id").notNull(),
    targetRecordId: text("target_record_id").notNull(),
    sourceType: text("source_type").notNull(),
    targetType: text("target_type").notNull(),
    relationship: text("relationship").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_links_workspace_idx").on(table.workspaceId)],
);

export const atlasActivityTable = pgTable(
  "atlas_activity",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_activity_workspace_idx").on(table.workspaceId)],
);

export const atlasSocraticInterviewsTable = pgTable(
  "atlas_socratic_interviews",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    interviewerQuestion: text("interviewer_question").notNull(),
    smeAnswer: text("sme_answer"),
    extractedKnowledgeUnitId: text("extracted_knowledge_unit_id"),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_socratic_workspace_idx").on(table.workspaceId)],
);

export const atlasBenchmarkResultsTable = pgTable(
  "atlas_benchmark_results",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => atlasWorkspacesTable.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").notNull(),
    scenarioTitle: text("scenario_title").notNull(),
    category: text("category").notNull(),
    smeExpectedDecision: text("sme_expected_decision").notNull(),
    twinDecision: text("twin_decision").notNull(),
    alignmentScore: doublePrecision("alignment_score").notNull().default(0.0),
    provenanceAccuracy: doublePrecision("provenance_accuracy").notNull().default(1.0),
    reasoningSummary: text("reasoning_summary"),
    createdAt: createdAt(),
  },
  (table) => [index("atlas_benchmark_workspace_idx").on(table.workspaceId)],
);

export const insertAtlasWorkspaceSchema = createInsertSchema(atlasWorkspacesTable).omit({ id: true, createdAt: true });
export const insertAtlasMembershipSchema = createInsertSchema(atlasMembershipsTable).omit({ id: true, createdAt: true });
export const insertAtlasTwinSchema = createInsertSchema(atlasTwinsTable).omit({ id: true, createdAt: true });
export const insertAtlasTwinFieldSchema = createInsertSchema(atlasTwinFieldsTable).omit({ id: true });
export const insertAtlasUploadSchema = createInsertSchema(atlasUploadsTable).omit({ id: true, createdAt: true, consumedAt: true });
export const insertAtlasSourceSchema = createInsertSchema(atlasSourcesTable).omit({ id: true, createdAt: true });
export const insertAtlasMeetingSchema = createInsertSchema(atlasMeetingsTable).omit({ id: true, createdAt: true });
export const insertAtlasActionSchema = createInsertSchema(atlasActionsTable).omit({ id: true, createdAt: true });
export const insertAtlasDecisionSchema = createInsertSchema(atlasDecisionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAtlasKnowledgeUnitSchema = createInsertSchema(atlasKnowledgeUnitsTable).omit({ id: true, createdAt: true });
export const insertAtlasEmailDraftSchema = createInsertSchema(atlasEmailDraftsTable).omit({ id: true, createdAt: true });
export const insertAtlasMeetingContributionSchema = createInsertSchema(atlasMeetingContributionsTable).omit({ id: true, createdAt: true });
export const insertAtlasLiveMeetingSchema = createInsertSchema(atlasLiveMeetingsTable).omit({ id: true, createdAt: true });
export const insertAtlasMeetingTriggerSchema = createInsertSchema(atlasMeetingTriggersTable).omit({ id: true, createdAt: true });
export const insertAtlasDelegationRuleSchema = createInsertSchema(atlasDelegationRulesTable).omit({ id: true, createdAt: true });
export const insertAtlasKnowledgeLinkSchema = createInsertSchema(atlasKnowledgeLinksTable).omit({ id: true, createdAt: true });
export const insertAtlasActivitySchema = createInsertSchema(atlasActivityTable).omit({ id: true, createdAt: true });
export const insertAtlasSocraticInterviewSchema = createInsertSchema(atlasSocraticInterviewsTable).omit({ id: true, createdAt: true });
export const insertAtlasBenchmarkResultSchema = createInsertSchema(atlasBenchmarkResultsTable).omit({ id: true, createdAt: true });

export type AtlasWorkspace = typeof atlasWorkspacesTable.$inferSelect;
export type AtlasMembership = typeof atlasMembershipsTable.$inferSelect;
export type AtlasTwin = typeof atlasTwinsTable.$inferSelect;
export type AtlasSource = typeof atlasSourcesTable.$inferSelect;
export type AtlasMeeting = typeof atlasMeetingsTable.$inferSelect;
export type AtlasAction = typeof atlasActionsTable.$inferSelect;
export type AtlasDecision = typeof atlasDecisionsTable.$inferSelect;
export type AtlasKnowledgeUnit = typeof atlasKnowledgeUnitsTable.$inferSelect;
export type AtlasEmailDraft = typeof atlasEmailDraftsTable.$inferSelect;
export type AtlasMeetingContribution = typeof atlasMeetingContributionsTable.$inferSelect;
export type AtlasLiveMeeting = typeof atlasLiveMeetingsTable.$inferSelect;
export type AtlasMeetingTrigger = typeof atlasMeetingTriggersTable.$inferSelect;
export type AtlasDelegationRule = typeof atlasDelegationRulesTable.$inferSelect;
export type AtlasKnowledgeLink = typeof atlasKnowledgeLinksTable.$inferSelect;
export type AtlasActivity = typeof atlasActivityTable.$inferSelect;
export type AtlasSocraticInterview = typeof atlasSocraticInterviewsTable.$inferSelect;
export type AtlasBenchmarkResult = typeof atlasBenchmarkResultsTable.$inferSelect;
export type InsertAtlasWorkspace = z.infer<typeof insertAtlasWorkspaceSchema>;