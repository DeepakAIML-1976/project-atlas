import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, atlasMembershipsTable, atlasTwinsTable, atlasWorkspacesTable } from "@workspace/db";

export const TWIN_FIELD_KEYS = [
  "role",
  "expertise",
  "priorities",
  "communicationStyle",
  "decisionMethodology",
  "riskTolerance",
  "delegationRules",
  "approvalLimits",
  "meetingBehavior",
  "stakeholderRelationships",
] as const;

export type AtlasRole = "owner" | "admin" | "reviewer" | "viewer";

export interface AtlasContext {
  userId: string;
  workspaceId: string;
  role: AtlasRole;
}

export async function authenticatedUser(
  req: Request,
  res: Response,
): Promise<string | null> {
  let userId: string | null = null;
  if (process.env.CLERK_SECRET_KEY) {
    try {
      userId = getAuth(req).userId;
    } catch {
      // getAuth throws if request is not authenticated via Clerk
    }
  }

  // Fallback for local SME development mode when Clerk key is not configured
  if (!userId) {
    userId = process.env.LOCAL_DEV_USER_ID ?? "user_deepak_sme";
  }

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

export async function workspaceContext(
  req: Request,
  res: Response,
): Promise<AtlasContext | null> {
  const userId = await authenticatedUser(req, res);
  if (!userId) return null;

  const memberships = await db
    .select()
    .from(atlasMembershipsTable)
    .where(eq(atlasMembershipsTable.userId, userId))
    .limit(1);
  let membership = memberships[0];

  let validWorkspace = membership
    ? (await db.select().from(atlasWorkspacesTable).where(eq(atlasWorkspacesTable.id, membership.workspaceId)).limit(1))[0]
    : null;

  if (!membership || !validWorkspace) {
    // Auto-provision default SME workspace & membership if running locally or if missing
    const workspaces = await db.select().from(atlasWorkspacesTable).limit(1);
    let workspaceId: string;
    if (workspaces.length > 0) {
      workspaceId = workspaces[0].id;
    } else {
      const [newWorkspace] = await db
        .insert(atlasWorkspacesTable)
        .values({
          name: "Deepak's Piping Engineering Workspace",
          industry: "Oil & Gas Piping Engineering",
        })
        .returning();
      workspaceId = newWorkspace.id;
    }

    if (!membership) {
      const [newMembership] = await db
        .insert(atlasMembershipsTable)
        .values({
          workspaceId,
          userId,
          role: "owner",
        })
        .returning();
      membership = newMembership;
    } else {
      await db
        .update(atlasMembershipsTable)
        .set({ workspaceId })
        .where(eq(atlasMembershipsTable.id, membership.id));
      membership.workspaceId = workspaceId;
    }

    const twins = await db
      .select()
      .from(atlasTwinsTable)
      .where(and(eq(atlasTwinsTable.workspaceId, workspaceId), eq(atlasTwinsTable.ownerId, userId)));
    if (twins.length === 0) {
      await db.insert(atlasTwinsTable).values({
        workspaceId,
        ownerId: userId,
        displayName: "Deepak's AI Representative (Atlas)",
        autonomyLevel: 1,
        autonomyReason: "Initial SME workspace creation",
      });
    }
  }

  return {
    userId,
    workspaceId: membership.workspaceId,
    role: (membership.role as AtlasRole) || "owner",
  };
}

export function requireSharedWrite(
  context: AtlasContext,
  res: Response,
): boolean {
  if (context.role === "owner" || context.role === "admin") return true;
  res.status(403).json({ error: "Owner or admin role required" });
  return false;
}

export async function userTwin(context: AtlasContext) {
  const rows = await db
    .select()
    .from(atlasTwinsTable)
    .where(
      and(
        eq(atlasTwinsTable.workspaceId, context.workspaceId),
        eq(atlasTwinsTable.ownerId, context.userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function autonomyLabel(level: number): string {
  if (level <= 2) return "Human review";
  if (level <= 4) return "Assisted";
  if (level <= 6) return "Supervised";
  if (level <= 8) return "Limited autonomy";
  return "High autonomy";
}

export function profileCompletion(
  fields: Array<{ value: string | null }>,
): number {
  return Math.round(
    (fields.filter((field) => field.value !== null && field.value.trim() !== "")
      .length /
      TWIN_FIELD_KEYS.length) *
      100,
  );
}