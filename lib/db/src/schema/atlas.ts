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
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("atlas_decisions_workspace_idx").on(table.workspaceId)],
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

export const insertAtlasWorkspaceSchema = createInsertSchema(atlasWorkspacesTable).omit({ id: true, createdAt: true });
export const insertAtlasMembershipSchema = createInsertSchema(atlasMembershipsTable).omit({ id: true, createdAt: true });
export const insertAtlasTwinSchema = createInsertSchema(atlasTwinsTable).omit({ id: true, createdAt: true });
export const insertAtlasTwinFieldSchema = createInsertSchema(atlasTwinFieldsTable).omit({ id: true });
export const insertAtlasUploadSchema = createInsertSchema(atlasUploadsTable).omit({ id: true, createdAt: true, consumedAt: true });
export const insertAtlasSourceSchema = createInsertSchema(atlasSourcesTable).omit({ id: true, createdAt: true });
export const insertAtlasMeetingSchema = createInsertSchema(atlasMeetingsTable).omit({ id: true, createdAt: true });
export const insertAtlasActionSchema = createInsertSchema(atlasActionsTable).omit({ id: true, createdAt: true });
export const insertAtlasDecisionSchema = createInsertSchema(atlasDecisionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAtlasKnowledgeLinkSchema = createInsertSchema(atlasKnowledgeLinksTable).omit({ id: true, createdAt: true });
export const insertAtlasActivitySchema = createInsertSchema(atlasActivityTable).omit({ id: true, createdAt: true });

export type AtlasWorkspace = typeof atlasWorkspacesTable.$inferSelect;
export type AtlasMembership = typeof atlasMembershipsTable.$inferSelect;
export type AtlasTwin = typeof atlasTwinsTable.$inferSelect;
export type AtlasSource = typeof atlasSourcesTable.$inferSelect;
export type AtlasMeeting = typeof atlasMeetingsTable.$inferSelect;
export type AtlasAction = typeof atlasActionsTable.$inferSelect;
export type AtlasDecision = typeof atlasDecisionsTable.$inferSelect;
export type AtlasKnowledgeLink = typeof atlasKnowledgeLinksTable.$inferSelect;
export type AtlasActivity = typeof atlasActivityTable.$inferSelect;
export type InsertAtlasWorkspace = z.infer<typeof insertAtlasWorkspaceSchema>;