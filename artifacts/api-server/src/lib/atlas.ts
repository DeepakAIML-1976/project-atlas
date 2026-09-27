import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, atlasMembershipsTable, atlasTwinsTable } from "@workspace/db";

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
  const userId = getAuth(req).userId;
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
  const membership = memberships[0];
  if (!membership) {
    res.status(404).json({ error: "Workspace not found" });
    return null;
  }
  return {
    userId,
    workspaceId: membership.workspaceId,
    role: membership.role as AtlasRole,
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