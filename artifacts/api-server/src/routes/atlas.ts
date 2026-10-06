import { Router, type IRouter } from "express";
import { privateFile } from "../lib/atlasStorage";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import {
  CreateAtlasDecisionBody,
  CreateAtlasDecisionResponse,
  CreateAtlasKnowledgeLinkBody,
  CreateAtlasKnowledgeLinkResponse,
  CreateAtlasMeetingBody,
  CreateAtlasMeetingResponse,
  CreateAtlasSourceBody,
  CreateAtlasSourceResponse,
  CreateMeetingActionBody,
  CreateMeetingActionParams,
  CreateMeetingActionResponse,
  DeleteAtlasKnowledgeLinkParams,
  DeleteAtlasKnowledgeLinkResponse,
  DeleteAtlasSourceParams,
  DeleteAtlasSourceResponse,
  GetAtlasActivityResponse,
  GetAtlasDecisionsResponse,
  GetAtlasKnowledgeGraphResponse,
  GetAtlasMeetingsResponse,
  GetAtlasOverviewResponse,
  GetAtlasSessionResponse,
  GetAtlasSourceParams,
  GetAtlasSourceResponse,
  GetAtlasSourcesResponse,
  GetMyTwinResponse,
  ReviewAtlasDecisionBody,
  ReviewAtlasDecisionParams,
  ReviewAtlasDecisionResponse,
  SearchAtlasMemoryQueryParams,
  SearchAtlasMemoryResponse,
  UpdateMeetingActionBody,
  UpdateMeetingActionParams,
  UpdateMeetingActionResponse,
  UpdateMyTwinAutonomyBody,
  UpdateMyTwinAutonomyResponse,
  UpdateMyTwinFieldBody,
  UpdateMyTwinFieldResponse,
  CreateAtlasWorkspaceBody,
  CreateAtlasWorkspaceResponse,
  GetAuthorizationInboxResponse,
  AuthorizeInboxItemBody,
  AuthorizeInboxItemResponse,
  GetKnowledgeUnitsQueryParams,
  GetKnowledgeUnitsResponse,
  CreateKnowledgeUnitBody,
  GetLiveMeetingsResponse,
  CreateLiveMeetingBody,
  GetLiveMeetingDetailResponse,
  IngestLiveTranscriptBody,
  IngestLiveTranscriptResponse,
  UpdateLiveMeetingStatusBody,
  GetEmailDraftsQueryParams,
  GetEmailDraftsResponse,
  IngestEmailBody,
  GetDelegationRulesResponse,
  CreateDelegationRuleBody,
  SeedTop100KnowledgeUnitsResponse,
} from "@workspace/api-zod";
import {
  atlasActionsTable,
  atlasActivityTable,
  atlasDecisionsTable,
  atlasKnowledgeLinksTable,
  atlasMeetingsTable,
  atlasMembershipsTable,
  atlasSourcesTable,
  atlasTwinFieldsTable,
  atlasTwinsTable,
  atlasUploadsTable,
  atlasWorkspacesTable,
  atlasEmailDraftsTable,
  atlasMeetingContributionsTable,
  atlasMeetingTriggersTable,
  atlasKnowledgeUnitsTable,
  atlasLiveMeetingsTable,
  atlasDelegationRulesTable,
  db,
} from "@workspace/db";
import {
  autonomyLabel,
  authenticatedUser,
  profileCompletion,
  requireSharedWrite,
  TWIN_FIELD_KEYS,
  userTwin,
  workspaceContext,
} from "../lib/atlas";
import { extractCorrectionKnowledgeUnit } from "../lib/atlasAI";
import { processLiveTranscriptChunk } from "../lib/atlasMeetingBot";
import { processIncomingEmail } from "../lib/atlasEmailIngest";
import { TOP_100_HEURISTICS } from "../lib/top100HeuristicsData";

const router: IRouter = Router();
const recordTypes = ["source", "meeting", "decision"] as const;

async function activity(
  workspaceId: string,
  userId: string,
  action: string,
  recordType: string,
  recordId: string,
): Promise<void> {
  await db.insert(atlasActivityTable).values({
    workspaceId,
    userId,
    action,
    recordType,
    recordId,
  });
}

function sourceResponse(source: typeof atlasSourcesTable.$inferSelect, viewerId: string) {
  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    contentType: source.contentType,
    sourceDate: source.sourceDate,
    permissionConfirmed: source.permissionConfirmed,
    profileAnalysisConsent: source.profileAnalysisConsent,
    analysisStatus: source.analysisStatus,
    analysisSuggestions: source.creatorId === viewerId ? source.analysisSuggestions : [],
    createdAt: source.createdAt,
  };
}

async function meetingResponse(
  meeting: typeof atlasMeetingsTable.$inferSelect,
  workspaceId: string,
) {
  const actions = await db
    .select()
    .from(atlasActionsTable)
    .where(
      and(
        eq(atlasActionsTable.workspaceId, workspaceId),
        eq(atlasActionsTable.meetingId, meeting.id),
      ),
    )
    .orderBy(atlasActionsTable.createdAt);
  return {
    ...meeting,
    actions,
  };
}

router.get("/atlas/session", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;
  const workspace = (
    await db
      .select()
      .from(atlasWorkspacesTable)
      .where(eq(atlasWorkspacesTable.id, ctx.workspaceId))
      .limit(1)
  )[0] ?? null;
  res.json(
    GetAtlasSessionResponse.parse({
      userId: ctx.userId,
      workspace,
      role: ctx.role,
    }),
  );
});

router.post("/atlas/workspaces", async (req, res): Promise<void> => {
  const userId = await authenticatedUser(req, res);
  if (!userId) return;
  const parsed = CreateAtlasWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const priorOwner = await db
    .select({ id: atlasMembershipsTable.id })
    .from(atlasMembershipsTable)
    .where(
      and(
        eq(atlasMembershipsTable.userId, userId),
        eq(atlasMembershipsTable.role, "owner"),
      ),
    )
    .limit(1);
  if (priorOwner.length > 0) {
    res.status(409).json({ error: "User already owns a workspace" });
    return;
  }
  const workspace = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(atlasWorkspacesTable)
      .values(parsed.data)
      .returning();
    await tx.insert(atlasMembershipsTable).values({
      workspaceId: created.id,
      userId,
      role: "owner",
    });
    await tx.insert(atlasTwinsTable).values({
      workspaceId: created.id,
      ownerId: userId,
      autonomyLevel: 1,
    });
    return created;
  });
  await activity(workspace.id, userId, "created", "workspace", workspace.id);
  res.status(201).json(
    CreateAtlasWorkspaceResponse.parse({
      userId,
      workspace,
      role: "owner",
    }),
  );
});

router.get("/atlas/overview", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  let [workspace] = await db
    .select()
    .from(atlasWorkspacesTable)
    .where(eq(atlasWorkspacesTable.id, context.workspaceId));

  if (!workspace) {
    const allWorkspaces = await db.select().from(atlasWorkspacesTable).limit(1);
    workspace = allWorkspaces[0];
  }

  if (!workspace) {
    const [newWs] = await db
      .insert(atlasWorkspacesTable)
      .values({
        name: "Deepak's Piping Engineering Workspace",
        industry: "Oil & Gas Piping Engineering",
      })
      .returning();
    workspace = newWs;
  }
  const twins = await db
    .select()
    .from(atlasTwinsTable)
    .where(eq(atlasTwinsTable.workspaceId, context.workspaceId));
  const sources = await db
    .select()
    .from(atlasSourcesTable)
    .where(eq(atlasSourcesTable.workspaceId, context.workspaceId));
  const meetings = await db
    .select()
    .from(atlasMeetingsTable)
    .where(eq(atlasMeetingsTable.workspaceId, context.workspaceId));
  const pendingDecisions = await db
    .select()
    .from(atlasDecisionsTable)
    .where(
      and(
        eq(atlasDecisionsTable.workspaceId, context.workspaceId),
        eq(atlasDecisionsTable.status, "pending"),
      ),
    );
  const actions = await db
    .select()
    .from(atlasActionsTable)
    .where(eq(atlasActionsTable.workspaceId, context.workspaceId));
  const links = await db
    .select()
    .from(atlasKnowledgeLinksTable)
    .where(eq(atlasKnowledgeLinksTable.workspaceId, context.workspaceId));
  const twin = await userTwin(context);
  const twinFields = twin
    ? await db
        .select()
        .from(atlasTwinFieldsTable)
        .where(eq(atlasTwinFieldsTable.twinId, twin.id))
    : [];
  const completion = profileCompletion(twinFields);
  const setupNeeds: string[] = [];
  if (completion < 100) setupNeeds.push("Complete your digital twin profile");
  if (sources.length === 0) setupNeeds.push("Add a source");
  if (meetings.length === 0) setupNeeds.push("Add a meeting");
  res.json(
    GetAtlasOverviewResponse.parse({
      workspace,
      counts: {
        twins: twins.length,
        sources: sources.length,
        meetings: meetings.length,
        pendingDecisions: pendingDecisions.length,
        actions: actions.length,
        knowledgeLinks: links.length,
      },
      profileCompletion: completion,
      setupNeeds,
    }),
  );
});

router.get("/atlas/twins/me", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const twin = await userTwin(context);
  if (!twin) {
    res.status(404).json({ error: "Digital twin not found" });
    return;
  }
  const persistedFields = await db
    .select()
    .from(atlasTwinFieldsTable)
    .where(eq(atlasTwinFieldsTable.twinId, twin.id));
  const fieldMap = new Map(persistedFields.map((field) => [field.key, field]));
  const fields = TWIN_FIELD_KEYS.map((key) => {
    const field = fieldMap.get(key);
    return {
      key,
      value: field?.value ?? null,
      evidenceStatus: field?.evidenceStatus ?? "unknown",
      sourceIds: field?.sourceIds ?? [],
      confidence: field?.confidence ?? null,
      updatedAt: field?.updatedAt ?? null,
    };
  });
  res.json(
    GetMyTwinResponse.parse({
      id: twin.id,
      ownerId: twin.ownerId,
      displayName: twin.displayName,
      autonomy: {
        level: twin.autonomyLevel,
        label: autonomyLabel(twin.autonomyLevel),
        approvalRequired: true,
        updatedAt: twin.autonomyUpdatedAt,
      },
      fields,
      profileCompletion: profileCompletion(fields),
    }),
  );
});

router.patch("/atlas/twins/me/fields", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const parsed = UpdateMyTwinFieldBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const twin = await userTwin(context);
  if (!twin) {
    res.status(404).json({ error: "Digital twin not found" });
    return;
  }
  const sourceIds = parsed.data.sourceIds ?? [];
  if (sourceIds.length > 0) {
    const foundSources = await db
      .select({ id: atlasSourcesTable.id })
      .from(atlasSourcesTable)
      .where(
        and(
          eq(atlasSourcesTable.workspaceId, context.workspaceId),
          eq(atlasSourcesTable.permissionConfirmed, true),
        ),
      );
    const allowed = new Set(foundSources.map((source) => source.id));
    if (sourceIds.some((id) => !allowed.has(id))) {
      res.status(400).json({ error: "A source does not belong to this workspace" });
      return;
    }
  }
  const updatedAt = new Date();
  const [field] = await db
    .insert(atlasTwinFieldsTable)
    .values({
      twinId: twin.id,
      key: parsed.data.key,
      value: parsed.data.value,
      evidenceStatus: "confirmed",
      sourceIds,
      confidence: 1,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [atlasTwinFieldsTable.twinId, atlasTwinFieldsTable.key],
      set: {
        value: parsed.data.value,
        evidenceStatus: "confirmed",
        sourceIds,
        confidence: 1,
        updatedAt,
      },
    })
    .returning();
  await activity(context.workspaceId, context.userId, "updated", "twin_field", field.id);
  res.json(UpdateMyTwinFieldResponse.parse(field));
});

router.patch("/atlas/twins/me/autonomy", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const parsed = UpdateMyTwinAutonomyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const twin = await userTwin(context);
  if (!twin) {
    res.status(404).json({ error: "Digital twin not found" });
    return;
  }
  const updatedAt = new Date();
  await db
    .update(atlasTwinsTable)
    .set({
      autonomyLevel: parsed.data.level,
      autonomyReason: parsed.data.reason,
      autonomyUpdatedAt: updatedAt,
    })
    .where(
      and(
        eq(atlasTwinsTable.id, twin.id),
        eq(atlasTwinsTable.workspaceId, context.workspaceId),
        eq(atlasTwinsTable.ownerId, context.userId),
      ),
    );
  await activity(context.workspaceId, context.userId, "updated", "twin_autonomy", twin.id);
  res.json(
    UpdateMyTwinAutonomyResponse.parse({
      level: parsed.data.level,
      label: autonomyLabel(parsed.data.level),
      approvalRequired: true,
      updatedAt,
    }),
  );
});

router.get("/atlas/sources", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const sources = await db
    .select()
    .from(atlasSourcesTable)
    .where(eq(atlasSourcesTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasSourcesTable.createdAt));
  res.json(GetAtlasSourcesResponse.parse(sources.map((source) => sourceResponse(source, context.userId))));
});

router.post("/atlas/sources", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const parsed = CreateAtlasSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.permissionConfirmed !== true) {
    res.status(403).json({ error: "Confirm permission to store this source" });
    return;
  }
  const objectPath = parsed.data.objectPath ?? null;
  if (objectPath) {
    try {
      const [reservation] = await db.select().from(atlasUploadsTable).where(and(
        eq(atlasUploadsTable.objectPath, objectPath),
        eq(atlasUploadsTable.workspaceId, context.workspaceId),
        eq(atlasUploadsTable.userId, context.userId),
        isNull(atlasUploadsTable.consumedAt),
      )).limit(1);
      if (!reservation) {
        res.status(400).json({ error: "Upload reservation not found or already used" });
        return;
      }
      const file = privateFile(objectPath);
      const [exists] = await file.exists();
      if (!exists) {
        res.status(400).json({ error: "Finish uploading the file before adding it as a source" });
        return;
      }
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) !== reservation.size || metadata.contentType !== reservation.contentType) {
        res.status(400).json({ error: "The uploaded file does not match its reserved size or type" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid uploaded object" });
      return;
    }
  }
  const source = await db.transaction(async (tx) => {
    let upload: typeof atlasUploadsTable.$inferSelect | null = null;
    if (objectPath) {
      const [reservation] = await tx
        .select()
        .from(atlasUploadsTable)
        .where(
          and(
            eq(atlasUploadsTable.objectPath, objectPath),
            eq(atlasUploadsTable.workspaceId, context.workspaceId),
            eq(atlasUploadsTable.userId, context.userId),
            isNull(atlasUploadsTable.consumedAt),
          ),
        )
        .for("update")
        .limit(1);
      upload = reservation ?? null;
      if (!upload) return null;
    }
    const [created] = await tx
      .insert(atlasSourcesTable)
      .values({
        workspaceId: context.workspaceId,
        creatorId: context.userId,
        title: parsed.data.title,
        kind: parsed.data.kind,
        content: parsed.data.content ?? null,
        objectPath,
        contentType: upload?.contentType ?? parsed.data.contentType ?? null,
        sourceDate: parsed.data.sourceDate ?? null,
        permissionConfirmed: parsed.data.permissionConfirmed,
        profileAnalysisConsent: parsed.data.profileAnalysisConsent,
      })
      .returning();
    if (upload) {
      const [consumed] = await tx
        .update(atlasUploadsTable)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(atlasUploadsTable.id, upload.id),
            eq(atlasUploadsTable.workspaceId, context.workspaceId),
            eq(atlasUploadsTable.userId, context.userId),
            isNull(atlasUploadsTable.consumedAt),
          ),
        )
        .returning({ id: atlasUploadsTable.id });
      if (!consumed) throw new Error("Upload reservation could not be consumed");
    }
    return created;
  });
  if (!source) {
    res.status(400).json({ error: "Upload reservation not found or already used" });
    return;
  }
  await activity(context.workspaceId, context.userId, "created", "source", source.id);
  res.status(201).json(CreateAtlasSourceResponse.parse(sourceResponse(source, context.userId)));
});

router.get("/atlas/sources/:sourceId", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const params = GetAtlasSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [source] = await db
    .select()
    .from(atlasSourcesTable)
    .where(
      and(
        eq(atlasSourcesTable.id, params.data.sourceId),
        eq(atlasSourcesTable.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  res.json(GetAtlasSourceResponse.parse(sourceResponse(source, context.userId)));
});

router.delete("/atlas/sources/:sourceId", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const params = DeleteAtlasSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [source] = await db
    .select()
    .from(atlasSourcesTable)
    .where(
      and(
        eq(atlasSourcesTable.id, params.data.sourceId),
        eq(atlasSourcesTable.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  if (source.creatorId !== context.userId) {
    res.status(403).json({ error: "Only the source owner can remove it" });
    return;
  }
  if (source.objectPath) {
    try {
      await privateFile(source.objectPath).delete({ ignoreNotFound: true });
    } catch (error) {
      req.log.error({ err: error }, "Private source deletion failed");
      res.status(502).json({ error: "The private file could not be removed; the source was not deleted" });
      return;
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(atlasKnowledgeLinksTable)
      .where(
        and(
          eq(atlasKnowledgeLinksTable.workspaceId, context.workspaceId),
          or(
            eq(atlasKnowledgeLinksTable.sourceRecordId, source.id),
            eq(atlasKnowledgeLinksTable.targetRecordId, source.id),
          ),
        ),
      );
    const workspaceTwins = await tx
      .select({ id: atlasTwinsTable.id })
      .from(atlasTwinsTable)
      .where(eq(atlasTwinsTable.workspaceId, context.workspaceId));
    for (const twin of workspaceTwins) {
      const fields = await tx
        .select()
        .from(atlasTwinFieldsTable)
        .where(eq(atlasTwinFieldsTable.twinId, twin.id));
      for (const field of fields) {
        if (field.sourceIds.includes(source.id)) {
          await tx
            .update(atlasTwinFieldsTable)
            .set({ sourceIds: field.sourceIds.filter((id) => id !== source.id) })
            .where(eq(atlasTwinFieldsTable.id, field.id));
        }
      }
    }
    await tx
      .delete(atlasSourcesTable)
      .where(
        and(
          eq(atlasSourcesTable.id, source.id),
          eq(atlasSourcesTable.workspaceId, context.workspaceId),
        ),
      );
  });
  await activity(context.workspaceId, context.userId, "deleted", "source", source.id);
  res.status(204).json(DeleteAtlasSourceResponse.parse(undefined));
});

router.get("/atlas/meetings", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const meetings = await db
    .select()
    .from(atlasMeetingsTable)
    .where(eq(atlasMeetingsTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasMeetingsTable.createdAt));
  const output = await Promise.all(
    meetings.map((meeting) => meetingResponse(meeting, context.workspaceId)),
  );
  res.json(GetAtlasMeetingsResponse.parse(output));
});

router.post("/atlas/meetings", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const parsed = CreateAtlasMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const sourceId = parsed.data.sourceId ?? null;
  if (sourceId) {
    const [source] = await db
      .select({ id: atlasSourcesTable.id })
      .from(atlasSourcesTable)
      .where(
        and(
          eq(atlasSourcesTable.id, sourceId),
          eq(atlasSourcesTable.workspaceId, context.workspaceId),
        ),
      )
      .limit(1);
    if (!source) {
      res.status(400).json({ error: "Source does not belong to this workspace" });
      return;
    }
  }
  const [meeting] = await db
    .insert(atlasMeetingsTable)
    .values({
      workspaceId: context.workspaceId,
      creatorId: context.userId,
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt ?? null,
      participants: parsed.data.participants ?? [],
      agenda: parsed.data.agenda ?? null,
      notes: parsed.data.notes ?? null,
      participantsInformed: parsed.data.participantsInformed,
      sourceId,
    })
    .returning();
  await activity(context.workspaceId, context.userId, "created", "meeting", meeting.id);
  res.status(201).json(
    CreateAtlasMeetingResponse.parse(await meetingResponse(meeting, context.workspaceId)),
  );
});

router.post("/atlas/meetings/:meetingId/actions", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const params = CreateMeetingActionParams.safeParse(req.params);
  const parsed = CreateMeetingActionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.error?.message ?? parsed.error?.message });
    return;
  }
  const [meeting] = await db
    .select({ id: atlasMeetingsTable.id })
    .from(atlasMeetingsTable)
    .where(
      and(
        eq(atlasMeetingsTable.id, params.data.meetingId),
        eq(atlasMeetingsTable.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  const [action] = await db
    .insert(atlasActionsTable)
    .values({
      workspaceId: context.workspaceId,
      meetingId: meeting.id,
      title: parsed.data.title,
      owner: parsed.data.owner ?? null,
      dueAt: parsed.data.dueAt ?? null,
    })
    .returning();
  await activity(context.workspaceId, context.userId, "created", "action", action.id);
  res.status(201).json(CreateMeetingActionResponse.parse(action));
});

router.patch(
  "/atlas/meetings/:meetingId/actions/:actionId",
  async (req, res): Promise<void> => {
    const context = await workspaceContext(req, res);
    if (!context) return;
    if (!requireSharedWrite(context, res)) return;
    const params = UpdateMeetingActionParams.safeParse(req.params);
    const parsed = UpdateMeetingActionBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: params.error?.message ?? parsed.error?.message });
      return;
    }
    const [action] = await db
      .update(atlasActionsTable)
      .set(parsed.data)
      .where(
        and(
          eq(atlasActionsTable.id, params.data.actionId),
          eq(atlasActionsTable.meetingId, params.data.meetingId),
          eq(atlasActionsTable.workspaceId, context.workspaceId),
        ),
      )
      .returning();
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }
    await activity(context.workspaceId, context.userId, "updated", "action", action.id);
    res.json(UpdateMeetingActionResponse.parse(action));
  },
);

router.get("/atlas/decisions", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const decisions = await db
    .select()
    .from(atlasDecisionsTable)
    .where(eq(atlasDecisionsTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasDecisionsTable.createdAt));
  res.json(GetAtlasDecisionsResponse.parse(decisions));
});

router.post("/atlas/decisions", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const parsed = CreateAtlasDecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [decision] = await db
    .insert(atlasDecisionsTable)
    .values({
      workspaceId: context.workspaceId,
      creatorId: context.userId,
      title: parsed.data.title,
      domain: parsed.data.domain,
      context: parsed.data.context,
      recommendation: parsed.data.recommendation,
      evidence: parsed.data.evidence,
      confidence: parsed.data.confidence ?? null,
    })
    .returning();
  await activity(context.workspaceId, context.userId, "created", "decision", decision.id);
  res.status(201).json(CreateAtlasDecisionResponse.parse(decision));
});

router.patch("/atlas/decisions/:decisionId/review", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (context.role !== "owner" && context.role !== "admin" && context.role !== "reviewer") {
    res.status(403).json({ error: "Reviewer role or higher required" });
    return;
  }
  const params = ReviewAtlasDecisionParams.safeParse(req.params);
  const parsed = ReviewAtlasDecisionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.error?.message ?? parsed.error?.message });
    return;
  }
  const [decision] = await db
    .update(atlasDecisionsTable)
    .set({
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote,
      reviewedBy: context.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(atlasDecisionsTable.id, params.data.decisionId),
        eq(atlasDecisionsTable.workspaceId, context.workspaceId),
      ),
    )
    .returning();
  if (!decision) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }
  await activity(context.workspaceId, context.userId, "reviewed", "decision", decision.id);
  res.json(ReviewAtlasDecisionResponse.parse(decision));
});

router.get("/atlas/memory/search", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const parsed = SearchAtlasMemoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const search = `%${parsed.data.q}%`;
  const [sources, meetings, decisions] = await Promise.all([
    db
      .select()
      .from(atlasSourcesTable)
      .where(
        and(
          eq(atlasSourcesTable.workspaceId, context.workspaceId),
          eq(atlasSourcesTable.creatorId, context.userId),
          or(ilike(atlasSourcesTable.title, search), ilike(atlasSourcesTable.content, search)),
        ),
      ),
    db
      .select()
      .from(atlasMeetingsTable)
      .where(
        and(
          eq(atlasMeetingsTable.workspaceId, context.workspaceId),
          or(
            ilike(atlasMeetingsTable.title, search),
            ilike(atlasMeetingsTable.notes, search),
            ilike(atlasMeetingsTable.agenda, search),
          ),
        ),
      ),
    db
      .select()
      .from(atlasDecisionsTable)
      .where(
        and(
          eq(atlasDecisionsTable.workspaceId, context.workspaceId),
          or(
            ilike(atlasDecisionsTable.title, search),
            ilike(atlasDecisionsTable.context, search),
            ilike(atlasDecisionsTable.recommendation, search),
          ),
        ),
      ),
  ]);
  const results = [
    ...sources.map((source) => ({
      id: source.id,
      recordType: "source",
      title: source.title,
      excerpt: source.content?.slice(0, 240) ?? null,
      sourceDate: source.sourceDate,
    })),
    ...meetings.map((meeting) => ({
      id: meeting.id,
      recordType: "meeting",
      title: meeting.title,
      excerpt: meeting.notes?.slice(0, 240) ?? meeting.agenda?.slice(0, 240) ?? null,
      sourceDate: meeting.scheduledAt,
    })),
    ...decisions.map((decision) => ({
      id: decision.id,
      recordType: "decision",
      title: decision.title,
      excerpt: decision.context.slice(0, 240),
      sourceDate: decision.createdAt,
    })),
  ];
  res.json(SearchAtlasMemoryResponse.parse(results));
});

router.get("/atlas/knowledge/graph", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const links = await db
    .select()
    .from(atlasKnowledgeLinksTable)
    .where(eq(atlasKnowledgeLinksTable.workspaceId, context.workspaceId))
    .orderBy(atlasKnowledgeLinksTable.createdAt);
  const nodes = new Map<
    string,
    { id: string; label: string; recordType: (typeof recordTypes)[number] }
  >();
  for (const link of links) {
    for (const [id, recordType] of [
      [link.sourceRecordId, link.sourceType],
      [link.targetRecordId, link.targetType],
    ] as const) {
      if (nodes.has(id)) continue;
      if (recordType === "source") {
        const [source] = await db
          .select({ id: atlasSourcesTable.id, title: atlasSourcesTable.title })
          .from(atlasSourcesTable)
          .where(
            and(
              eq(atlasSourcesTable.id, id),
              eq(atlasSourcesTable.workspaceId, context.workspaceId),
            ),
          )
          .limit(1);
        if (source) nodes.set(id, { id, label: source.title, recordType });
      } else if (recordType === "meeting") {
        const [meeting] = await db
          .select({ id: atlasMeetingsTable.id, title: atlasMeetingsTable.title })
          .from(atlasMeetingsTable)
          .where(
            and(
              eq(atlasMeetingsTable.id, id),
              eq(atlasMeetingsTable.workspaceId, context.workspaceId),
            ),
          )
          .limit(1);
        if (meeting) nodes.set(id, { id, label: meeting.title, recordType });
      } else if (recordType === "decision") {
        const [decision] = await db
          .select({ id: atlasDecisionsTable.id, title: atlasDecisionsTable.title })
          .from(atlasDecisionsTable)
          .where(
            and(
              eq(atlasDecisionsTable.id, id),
              eq(atlasDecisionsTable.workspaceId, context.workspaceId),
            ),
          )
          .limit(1);
        if (decision) nodes.set(id, { id, label: decision.title, recordType });
      }
    }
  }
  const graphLinks = links.filter(
    (link) => nodes.has(link.sourceRecordId) && nodes.has(link.targetRecordId),
  );
  res.json(
    GetAtlasKnowledgeGraphResponse.parse({
      nodes: [...nodes.values()],
      links: graphLinks.map(
        ({ id, sourceRecordId, targetRecordId, relationship, createdAt }) => ({
          id,
          sourceRecordId,
          targetRecordId,
          relationship,
          createdAt,
        }),
      ),
    }),
  );
});

router.post("/atlas/knowledge/links", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const parsed = CreateAtlasKnowledgeLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.sourceRecordId === parsed.data.targetRecordId) {
    res.status(400).json({ error: "A record cannot be linked to itself" });
    return;
  }
  const workspaceId = context.workspaceId;
  async function findRecord(recordId: string) {
    for (const [recordType, table] of [
      ["source", atlasSourcesTable],
      ["meeting", atlasMeetingsTable],
      ["decision", atlasDecisionsTable],
    ] as const) {
      const [record] = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, recordId), eq(table.workspaceId, workspaceId)))
        .limit(1);
      if (record) return recordType;
    }
    return null;
  }
  const [sourceType, targetType] = await Promise.all([
    findRecord(parsed.data.sourceRecordId),
    findRecord(parsed.data.targetRecordId),
  ]);
  if (!sourceType || !targetType) {
    res.status(400).json({ error: "Both linked records must belong to this workspace" });
    return;
  }
  const [link] = await db
    .insert(atlasKnowledgeLinksTable)
    .values({
      workspaceId: context.workspaceId,
      sourceRecordId: parsed.data.sourceRecordId,
      targetRecordId: parsed.data.targetRecordId,
      sourceType,
      targetType,
      relationship: parsed.data.relationship,
    })
    .returning();
  await activity(context.workspaceId, context.userId, "created", "knowledge_link", link.id);
  res.status(201).json(CreateAtlasKnowledgeLinkResponse.parse(link));
});

router.delete("/atlas/knowledge/links/:linkId", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;
  const params = DeleteAtlasKnowledgeLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [link] = await db
    .delete(atlasKnowledgeLinksTable)
    .where(
      and(
        eq(atlasKnowledgeLinksTable.id, params.data.linkId),
        eq(atlasKnowledgeLinksTable.workspaceId, context.workspaceId),
      ),
    )
    .returning();
  if (!link) {
    res.status(404).json({ error: "Knowledge link not found" });
    return;
  }
  await activity(context.workspaceId, context.userId, "deleted", "knowledge_link", link.id);
  res.status(204).json(DeleteAtlasKnowledgeLinkResponse.parse(undefined));
});

router.get("/atlas/activity", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const entries = await db
    .select()
    .from(atlasActivityTable)
    .where(eq(atlasActivityTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasActivityTable.createdAt));
  res.json(GetAtlasActivityResponse.parse(entries));
});

router.get("/atlas/authorization-inbox", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  const pendingEmails = await db
    .select()
    .from(atlasEmailDraftsTable)
    .where(
      and(
        eq(atlasEmailDraftsTable.workspaceId, context.workspaceId),
        eq(atlasEmailDraftsTable.status, "pending_authorization"),
      ),
    )
    .orderBy(desc(atlasEmailDraftsTable.createdAt));

  const pendingMeetingContributions = await db
    .select()
    .from(atlasMeetingContributionsTable)
    .where(
      and(
        eq(atlasMeetingContributionsTable.workspaceId, context.workspaceId),
        eq(atlasMeetingContributionsTable.status, "pending_authorization"),
      ),
    )
    .orderBy(desc(atlasMeetingContributionsTable.createdAt));

  const pendingDecisions = await db
    .select()
    .from(atlasDecisionsTable)
    .where(
      and(
        eq(atlasDecisionsTable.workspaceId, context.workspaceId),
        eq(atlasDecisionsTable.status, "pending"),
      ),
    )
    .orderBy(desc(atlasDecisionsTable.createdAt));

  const pendingMeetingTriggers = await db
    .select()
    .from(atlasMeetingTriggersTable)
    .where(
      and(
        eq(atlasMeetingTriggersTable.workspaceId, context.workspaceId),
        eq(atlasMeetingTriggersTable.humanAlertStatus, "notified"),
      ),
    )
    .orderBy(desc(atlasMeetingTriggersTable.createdAt));

  const totalPending =
    pendingEmails.length +
    pendingMeetingContributions.length +
    pendingDecisions.length +
    pendingMeetingTriggers.length;

  res.json(
    GetAuthorizationInboxResponse.parse({
      pendingEmails,
      pendingMeetingContributions,
      pendingDecisions,
      pendingMeetingTriggers,
      totalPending,
    }),
  );
});

router.post("/atlas/authorization-inbox/authorize", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const parsed = AuthorizeInboxItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { itemType, itemId, action, editedContent, rejectionReason } = parsed.data;
  let learnedKnowledgeUnit = null;

  if (itemType === "email_draft") {
    const [draft] = await db
      .select()
      .from(atlasEmailDraftsTable)
      .where(
        and(
          eq(atlasEmailDraftsTable.id, itemId),
          eq(atlasEmailDraftsTable.workspaceId, context.workspaceId),
        ),
      );
    if (!draft) {
      res.status(404).json({ error: "Email draft not found" });
      return;
    }

    const finalStatus = action === "reject" ? "rejected" : "authorized";
    await db
      .update(atlasEmailDraftsTable)
      .set({
        status: finalStatus,
        authorizedAt: action === "reject" ? null : new Date(),
        twinDraftResponse: editedContent ? editedContent : draft.twinDraftResponse,
      })
      .where(eq(atlasEmailDraftsTable.id, itemId));

    if (action === "edit_authorize" || action === "reject") {
      const correction = editedContent || rejectionReason || "Draft rejected";
      const extracted = await extractCorrectionKnowledgeUnit(
        "email_draft",
        draft.twinDraftResponse,
        correction,
        `Subject: ${draft.subject}, Sender: ${draft.sender}`,
      );
      const [ku] = await db
        .insert(atlasKnowledgeUnitsTable)
        .values({
          workspaceId: context.workspaceId,
          ...extracted,
          sourceRecordId: draft.id,
          confidence: 1.0,
          validationStatus: "validated",
        })
        .returning();
      learnedKnowledgeUnit = ku;
    }
  } else if (itemType === "meeting_contribution") {
    const [contrib] = await db
      .select()
      .from(atlasMeetingContributionsTable)
      .where(
        and(
          eq(atlasMeetingContributionsTable.id, itemId),
          eq(atlasMeetingContributionsTable.workspaceId, context.workspaceId),
        ),
      );
    if (!contrib) {
      res.status(404).json({ error: "Meeting contribution not found" });
      return;
    }

    const finalStatus = action === "reject" ? "rejected" : "authorized";
    await db
      .update(atlasMeetingContributionsTable)
      .set({
        status: finalStatus,
        twinProposedStatement: editedContent ? editedContent : contrib.twinProposedStatement,
      })
      .where(eq(atlasMeetingContributionsTable.id, itemId));

    if (action === "edit_authorize" || action === "reject") {
      const correction = editedContent || rejectionReason || "Statement rejected";
      const extracted = await extractCorrectionKnowledgeUnit(
        "meeting_contribution",
        contrib.twinProposedStatement,
        correction,
        `Meeting Topic: ${contrib.topic}`,
      );
      const [ku] = await db
        .insert(atlasKnowledgeUnitsTable)
        .values({
          workspaceId: context.workspaceId,
          ...extracted,
          sourceRecordId: contrib.id,
          confidence: 1.0,
          validationStatus: "validated",
        })
        .returning();
      learnedKnowledgeUnit = ku;
    }
  } else if (itemType === "decision") {
    const [decision] = await db
      .select()
      .from(atlasDecisionsTable)
      .where(
        and(
          eq(atlasDecisionsTable.id, itemId),
          eq(atlasDecisionsTable.workspaceId, context.workspaceId),
        ),
      );
    if (!decision) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }

    const newStatus = action === "reject" ? "rejected" : "approved";
    await db
      .update(atlasDecisionsTable)
      .set({
        status: newStatus,
        reviewNote: rejectionReason || (editedContent ? `Edited & approved: ${editedContent}` : "Approved via Executive Inbox"),
        recommendation: editedContent ? editedContent : decision.recommendation,
        reviewedBy: context.userId,
        updatedAt: new Date(),
      })
      .where(eq(atlasDecisionsTable.id, itemId));

    if (action === "edit_authorize" || action === "reject") {
      const correction = editedContent || rejectionReason || "Decision rejected";
      const extracted = await extractCorrectionKnowledgeUnit(
        "decision",
        decision.recommendation,
        correction,
        `Title: ${decision.title}, Domain: ${decision.domain}, Context: ${decision.context}`,
      );
      const [ku] = await db
        .insert(atlasKnowledgeUnitsTable)
        .values({
          workspaceId: context.workspaceId,
          ...extracted,
          sourceRecordId: decision.id,
          confidence: 1.0,
          validationStatus: "validated",
        })
        .returning();
      learnedKnowledgeUnit = ku;
    }
  } else if (itemType === "meeting_trigger") {
    const [trig] = await db
      .select()
      .from(atlasMeetingTriggersTable)
      .where(
        and(
          eq(atlasMeetingTriggersTable.id, itemId),
          eq(atlasMeetingTriggersTable.workspaceId, context.workspaceId),
        ),
      );
    if (!trig) {
      res.status(404).json({ error: "Meeting trigger alert not found" });
      return;
    }

    const finalStatus = action === "reject" ? "dismissed" : "responded";
    await db
      .update(atlasMeetingTriggersTable)
      .set({
        humanAlertStatus: finalStatus,
        twinProposedResponse: editedContent ? editedContent : trig.twinProposedResponse,
      })
      .where(eq(atlasMeetingTriggersTable.id, itemId));

    if (action === "edit_authorize" || action === "reject") {
      const correction = editedContent || rejectionReason || "Response dismissed";
      const extracted = await extractCorrectionKnowledgeUnit(
        "meeting_trigger",
        trig.twinProposedResponse,
        correction,
        `Speaker: ${trig.speakerName || "Unknown"}, Question: ${trig.questionAsked}`,
      );
      const [ku] = await db
        .insert(atlasKnowledgeUnitsTable)
        .values({
          workspaceId: context.workspaceId,
          ...extracted,
          sourceRecordId: trig.id,
          confidence: 1.0,
          validationStatus: "validated",
        })
        .returning();
      learnedKnowledgeUnit = ku;
    }
  }

  await activity(context.workspaceId, context.userId, action, itemType, itemId);

  res.json(
    AuthorizeInboxItemResponse.parse({
      success: true,
      message: `Action ${action} completed successfully`,
      learnedKnowledgeUnit: learnedKnowledgeUnit ?? null,
    }),
  );
});

router.get("/atlas/knowledge-units", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  const parsed = GetKnowledgeUnitsQueryParams.safeParse(req.query);
  const domainFilter = parsed.success ? parsed.data.domain : undefined;
  const searchFilter = parsed.success ? parsed.data.query : undefined;

  const items = await db
    .select()
    .from(atlasKnowledgeUnitsTable)
    .where(eq(atlasKnowledgeUnitsTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasKnowledgeUnitsTable.createdAt));

  let filtered = items;
  if (domainFilter) {
    filtered = filtered.filter((item) => item.domain.toLowerCase() === domainFilter.toLowerCase());
  }
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.topic.toLowerCase().includes(q) ||
        (item.heuristic && item.heuristic.toLowerCase().includes(q)) ||
        (item.reasoning && item.reasoning.toLowerCase().includes(q)) ||
        (item.domain && item.domain.toLowerCase().includes(q)),
    );
  }

  res.json(
    GetKnowledgeUnitsResponse.parse({
      knowledgeUnits: filtered,
    }),
  );
});

router.post("/atlas/knowledge-units", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const parsed = CreateKnowledgeUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(atlasKnowledgeUnitsTable)
    .values({
      workspaceId: context.workspaceId,
      domain: parsed.data.domain,
      topic: parsed.data.topic,
      problem: parsed.data.problem ?? null,
      context: parsed.data.context ?? null,
      experience: parsed.data.experience ?? "Directly taught by human SME",
      reasoning: parsed.data.reasoning ?? null,
      decision: parsed.data.decision ?? null,
      outcome: parsed.data.outcome ?? null,
      lesson: parsed.data.lesson ?? null,
      heuristic: parsed.data.heuristic ?? null,
      exception: parsed.data.exception ?? null,
      confidence: 1.0,
      validationStatus: "validated",
    })
    .returning();

  await activity(context.workspaceId, context.userId, "created", "knowledge_unit", created.id);

  res.status(201).json(created);
});

router.delete("/atlas/knowledge-units/:id", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const id = req.params.id;
  await db
    .delete(atlasKnowledgeUnitsTable)
    .where(
      and(
        eq(atlasKnowledgeUnitsTable.id, id),
        eq(atlasKnowledgeUnitsTable.workspaceId, context.workspaceId),
      ),
    );

  await activity(context.workspaceId, context.userId, "deleted", "knowledge_unit", id);
  res.status(204).send();
});

router.post("/atlas/knowledge-units/seed-top100", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  // 1. Ensure master source document exists in atlasSourcesTable
  const existingSources = await db
    .select()
    .from(atlasSourcesTable)
    .where(
      and(
        eq(atlasSourcesTable.workspaceId, context.workspaceId),
        eq(atlasSourcesTable.title, "TOP 100 TACIT PIPING ENGINEERING HEURISTICS & GOLDEN RULES - Version 1.0"),
      ),
    );

  let sourceId: string;
  if (existingSources.length > 0) {
    sourceId = existingSources[0].id;
  } else {
    const [newSource] = await db
      .insert(atlasSourcesTable)
      .values({
        workspaceId: context.workspaceId,
        creatorId: context.userId,
        title: "TOP 100 TACIT PIPING ENGINEERING HEURISTICS & GOLDEN RULES - Version 1.0",
        kind: "document",
        content: "Deepak's authoritative collection of 100 tacit piping engineering heuristics, golden rules, AI verification checks, and failure avoidance criteria across 15 engineering domains.",
        permissionConfirmed: true,
        profileAnalysisConsent: true,
      })
      .returning();
    sourceId = newSource.id;
    await activity(context.workspaceId, context.userId, "created", "source", sourceId);
  }

  // 2. Filter out heuristics already seeded in this workspace
  const existingUnits = await db
    .select()
    .from(atlasKnowledgeUnitsTable)
    .where(eq(atlasKnowledgeUnitsTable.workspaceId, context.workspaceId));

  const existingTopics = new Set(existingUnits.map((u) => u.topic.toLowerCase()));

  const toInsert = TOP_100_HEURISTICS.filter(
    (h) =>
      !existingTopics.has(`rule #${h.ruleNumber}: ${h.title}`.toLowerCase()) &&
      !existingTopics.has(h.title.toLowerCase()),
  );

  if (toInsert.length === 0) {
    res.json(
      SeedTop100KnowledgeUnitsResponse.parse({
        seededCount: 0,
        sourceId,
        message: "All 100 Tacit Piping Engineering Heuristics & Golden Rules are already seeded in this workspace.",
      }),
    );
    return;
  }

  const insertValues = toInsert.map((h) => ({
    workspaceId: context.workspaceId,
    domain: h.domain,
    topic: `Rule #${h.ruleNumber}: ${h.title}`,
    problem: h.section,
    context: h.goldenRule,
    experience: "Authoritative SME Document: Top 100 Tacit Piping Engineering Heuristics v1.0",
    reasoning: h.aiCheck ? `${h.heuristic}\n\n[AI Verification Check]: ${h.aiCheck}` : h.heuristic,
    decision: h.goldenRule,
    outcome: h.failureAvoided,
    lesson: `Failure Avoided: ${h.failureAvoided}`,
    heuristic: h.heuristic,
    exception: null,
    sourceRecordId: sourceId,
    confidence: 1.0,
    validationStatus: "validated",
  }));

  // Insert in batches of 25 to prevent memory/query size issues
  let totalSeeded = 0;
  const batchSize = 25;
  for (let i = 0; i < insertValues.length; i += batchSize) {
    const batch = insertValues.slice(i, i + batchSize);
    await db.insert(atlasKnowledgeUnitsTable).values(batch);
    totalSeeded += batch.length;
  }

  await activity(context.workspaceId, context.userId, "seeded", "knowledge_units", sourceId);

  res.json(
    SeedTop100KnowledgeUnitsResponse.parse({
      seededCount: totalSeeded,
      sourceId,
      message: `Successfully seeded ${totalSeeded} Tacit Piping Engineering Heuristics & Golden Rules into workspace.`,
    }),
  );
});

router.get("/atlas/live-meetings", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  const liveMeetings = await db
    .select()
    .from(atlasLiveMeetingsTable)
    .where(eq(atlasLiveMeetingsTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasLiveMeetingsTable.createdAt));

  res.json(GetLiveMeetingsResponse.parse({ liveMeetings }));
});

router.post("/atlas/live-meetings", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const parsed = CreateLiveMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(atlasLiveMeetingsTable)
    .values({
      workspaceId: context.workspaceId,
      meetingTitle: parsed.data.meetingTitle,
      platform: parsed.data.platform || "teams",
      meetingUrl: parsed.data.meetingUrl || null,
      botStatus: "in_call",
      botDisplayName: parsed.data.botDisplayName || "Deepak's AI Representative (Atlas)",
      joinedAt: new Date(),
    })
    .returning();

  await activity(context.workspaceId, context.userId, "created", "live_meeting", created.id);

  res.status(201).json(created);
});

router.get("/atlas/live-meetings/:id", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  const { id } = req.params;
  const [meeting] = await db
    .select()
    .from(atlasLiveMeetingsTable)
    .where(
      and(
        eq(atlasLiveMeetingsTable.id, id),
        eq(atlasLiveMeetingsTable.workspaceId, context.workspaceId),
      ),
    );

  if (!meeting) {
    res.status(404).json({ error: "Live meeting session not found" });
    return;
  }

  const triggers = await db
    .select()
    .from(atlasMeetingTriggersTable)
    .where(
      and(
        eq(atlasMeetingTriggersTable.liveMeetingId, id),
        eq(atlasMeetingTriggersTable.workspaceId, context.workspaceId),
      ),
    )
    .orderBy(desc(atlasMeetingTriggersTable.createdAt));

  res.json(
    GetLiveMeetingDetailResponse.parse({
      meeting,
      triggers,
      notes: "Automatic transcript & action item logging active.",
    }),
  );
});

router.post("/atlas/live-meetings/:id/transcript", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const { id } = req.params;
  const parsed = IngestLiveTranscriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await processLiveTranscriptChunk(
    context.workspaceId,
    id,
    parsed.data.speakerName,
    parsed.data.text,
  );

  res.json(
    IngestLiveTranscriptResponse.parse({
      processed: result.processed,
      triggerDetected: result.triggerDetected,
      triggeredAlert: result.triggeredAlert ?? null,
      extractedNote: result.extractedNote ?? null,
    }),
  );
});

router.patch("/atlas/live-meetings/:id/status", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const { id } = req.params;
  const parsed = UpdateLiveMeetingStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(atlasLiveMeetingsTable)
    .set({
      botStatus: parsed.data.botStatus,
      leftAt: parsed.data.botStatus === "left" ? new Date() : null,
    })
    .where(
      and(
        eq(atlasLiveMeetingsTable.id, id),
        eq(atlasLiveMeetingsTable.workspaceId, context.workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Live meeting session not found" });
    return;
  }

  await activity(context.workspaceId, context.userId, "updated_status", "live_meeting", id);

  res.json(updated);
});

router.get("/atlas/email-drafts", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  const parsed = GetEmailDraftsQueryParams.safeParse(req.query);
  const statusFilter = parsed.success ? parsed.data.status : undefined;

  const emailDrafts = await db
    .select()
    .from(atlasEmailDraftsTable)
    .where(
      and(
        eq(atlasEmailDraftsTable.workspaceId, context.workspaceId),
        statusFilter ? eq(atlasEmailDraftsTable.status, statusFilter) : undefined,
      ),
    )
    .orderBy(desc(atlasEmailDraftsTable.createdAt));

  res.json(GetEmailDraftsResponse.parse({ emailDrafts }));
});

router.post("/atlas/email-drafts/ingest", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const parsed = IngestEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const draft = await processIncomingEmail(
    context.workspaceId,
    context.userId,
    parsed.data.sender,
    parsed.data.subject,
    parsed.data.incomingBody,
  );

  res.status(201).json(draft);
});

router.get("/atlas/delegation-rules", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  const delegationRules = await db
    .select()
    .from(atlasDelegationRulesTable)
    .where(eq(atlasDelegationRulesTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasDelegationRulesTable.createdAt));

  res.json(GetDelegationRulesResponse.parse({ delegationRules }));
});

router.post("/atlas/delegation-rules", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const parsed = CreateDelegationRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(atlasDelegationRulesTable)
    .values({
      workspaceId: context.workspaceId,
      domain: parsed.data.domain,
      category: parsed.data.category,
      maxRiskLevel: parsed.data.maxRiskLevel || "low",
      requiresHumanApproval: parsed.data.requiresHumanApproval ?? true,
      autoExecutionEnabled: parsed.data.autoExecutionEnabled ?? false,
    })
    .returning();

  await activity(context.workspaceId, context.userId, "created", "delegation_rule", created.id);

  res.status(201).json(created);
});

router.delete("/atlas/delegation-rules/:id", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  if (!requireSharedWrite(context, res)) return;

  const { id } = req.params;
  await db
    .delete(atlasDelegationRulesTable)
    .where(
      and(
        eq(atlasDelegationRulesTable.id, id),
        eq(atlasDelegationRulesTable.workspaceId, context.workspaceId),
      ),
    );

  await activity(context.workspaceId, context.userId, "deleted", "delegation_rule", id);
  res.status(204).send();
});

// PCOS Tacit Knowledge Capture (Socratic Interviewer)
router.get("/atlas/tacit-capture/question", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const { generateSocraticQuestion } = await import("../lib/atlasTacitEngine");
  const interview = await generateSocraticQuestion(context.workspaceId);
  res.json(interview);
});

router.post("/atlas/tacit-capture/answer", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const { interviewId, smeAnswer } = req.body;
  if (!interviewId || !smeAnswer) {
    res.status(400).json({ error: "interviewId and smeAnswer are required" });
    return;
  }
  const { processSocraticAnswer } = await import("../lib/atlasTacitEngine");
  const result = await processSocraticAnswer(context.workspaceId, interviewId, smeAnswer);
  await activity(context.workspaceId, context.userId, "created", "knowledge_unit", result.knowledgeUnit.id);
  res.json(result);
});

// PCOS Correction Learning Engine
router.post("/atlas/corrections/learn", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const { originalContext, originalTwinResponse, smeCorrectionText } = req.body;
  if (!originalContext || !originalTwinResponse || !smeCorrectionText) {
    res.status(400).json({ error: "originalContext, originalTwinResponse, and smeCorrectionText are required" });
    return;
  }
  const { learnFromCorrection } = await import("../lib/atlasTacitEngine");
  const knowledgeUnit = await learnFromCorrection(
    context.workspaceId,
    originalContext,
    originalTwinResponse,
    smeCorrectionText,
  );
  await activity(context.workspaceId, context.userId, "learned_from_correction", "knowledge_unit", knowledgeUnit.id);
  res.json({ success: true, knowledgeUnit });
});

// PCOS Decision Memory Trade-off Evaluator
router.post("/atlas/decisions/evaluate", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const { projectContext, problemStatement, options } = req.body;
  if (!projectContext || !problemStatement || !Array.isArray(options)) {
    res.status(400).json({ error: "projectContext, problemStatement, and options array are required" });
    return;
  }
  const { evaluateDecisionTradeOffs } = await import("../lib/atlasDecisionMemory");
  const evaluation = await evaluateDecisionTradeOffs({
    workspaceId: context.workspaceId,
    projectContext,
    problemStatement,
    options,
  });
  res.json(evaluation);
});

// PCOS Benchmark Experiment Runner (50-Scenario Alignment)
router.post("/atlas/benchmark/run", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const { runBenchmarkExperiment } = await import("../lib/atlasDecisionMemory");
  const result = await runBenchmarkExperiment(context.workspaceId);
  res.json(result);
});

router.get("/atlas/benchmark/results", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const { atlasBenchmarkResultsTable } = await import("@workspace/db");
  const results = await db
    .select()
    .from(atlasBenchmarkResultsTable)
    .where(eq(atlasBenchmarkResultsTable.workspaceId, context.workspaceId))
    .orderBy(desc(atlasBenchmarkResultsTable.createdAt));
  res.json({ results });
});

export default router;