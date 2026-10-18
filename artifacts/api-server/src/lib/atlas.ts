import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, atlasMembershipsTable, atlasTwinsTable, atlasWorkspacesTable } from "@workspace/db";
import { logger } from "./logger";

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
  ownerEmail: string;
  ownerName: string;
  workspaceId: string;
  role: AtlasRole;
}

export function getTwinDisplayName(ownerNameOrEmail: string): string {
  const clean = (ownerNameOrEmail || "").trim().replace(/'s\s+AI\s+Representative$/i, "").replace(/'s$/i, "");
  let name = clean;
  if (clean.includes("@")) {
    const local = clean.split("@")[0];
    const first = local.split(".")[0];
    name = first.charAt(0).toUpperCase() + first.slice(1);
  } else if (clean.includes(" ")) {
    name = clean.split(" ")[0];
  }
  if (!name) name = "Deepak";
  return `${name}'s AI Representative`;
}

export async function authenticatedUser(
  req: Request,
  res: Response,
): Promise<{ userId: string; ownerEmail: string; ownerName: string } | null> {
  let userId: string | null = null;
  let ownerEmail: string | null = null;

  // Header override (useful for API clients & switching active logged-in engineer)
  const headerEmail = (req.headers["x-owner-email"] as string)?.trim().toLowerCase();
  if (headerEmail && headerEmail.includes("@")) {
    ownerEmail = headerEmail;
  }

  if (process.env.CLERK_SECRET_KEY) {
    try {
      const auth = getAuth(req);
      userId = auth.userId;
      // In Clerk, user email can be forwarded or inspected
    } catch {
      // getAuth throws if request is not authenticated via Clerk
    }
  }

  // Fallback for local SME development mode
  if (!ownerEmail) {
    ownerEmail = (process.env.DEFAULT_OWNER_EMAIL || "deepak.paranjape@kentplc.com").trim().toLowerCase();
  }
  if (!userId) {
    userId = `user_${ownerEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  let ownerName = "Deepak Paranjape";
  if (ownerEmail.includes("sunil")) {
    ownerName = "Sunil Hiremath";
  } else if (!ownerEmail.includes("deepak")) {
    const local = ownerEmail.split("@")[0].replace(/\./g, " ");
    ownerName = local.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return { userId, ownerEmail, ownerName };
}

export async function workspaceContext(
  req: Request,
  res: Response,
): Promise<AtlasContext | null> {
  const auth = await authenticatedUser(req, res);
  if (!auth) return null;
  const { userId, ownerEmail, ownerName } = auth;

  let workspaceId = "1a39970a-abf0-48c3-8b89-08b669e80bbe";

  try {
    // Look for existing twin and membership bound specifically to this owner_email
    const existingTwins = await db
      .select()
      .from(atlasTwinsTable)
      .where(eq(atlasTwinsTable.ownerEmail, ownerEmail))
      .limit(1);

    if (existingTwins.length > 0) {
      workspaceId = existingTwins[0].workspaceId;
    } else {
      // Check if membership exists for userId
      const memberships = await db
        .select()
        .from(atlasMembershipsTable)
        .where(eq(atlasMembershipsTable.userId, userId))
        .limit(1);

      if (memberships.length > 0) {
        workspaceId = memberships[0].workspaceId;
      } else {
        // Auto-provision a brand-new isolated workspace specifically for this engineer
        const twinDisplayName = getTwinDisplayName(ownerName);
        const [newWorkspace] = await db
          .insert(atlasWorkspacesTable)
          .values({
            name: `${ownerName}'s Piping Engineering Workspace`,
            industry: "Oil & Gas Piping Engineering",
          })
          .returning();
        workspaceId = newWorkspace.id;

        await db.insert(atlasMembershipsTable).values({
          workspaceId,
          userId,
          role: "owner",
        });

        await db.insert(atlasTwinsTable).values({
          workspaceId,
          ownerId: userId,
          ownerEmail,
          displayName: twinDisplayName,
          autonomyLevel: 1,
          autonomyReason: `Initial SME workspace auto-provisioned for ${ownerEmail}`,
        });

        // Also auto-provision default dynamic preferences for this twin
        const { atlasTwinPreferencesTable } = await import("@workspace/db");
        await db.insert(atlasTwinPreferencesTable).values({
          workspaceId,
          ownerEmail,
          ingestionKeywords: ["Alky Reactor", "Alky Flare", "5884", "5333"],
          allowedSenderEmails: [],
          excludedDomains: [],
          offlineCourtesyMessage: `I am ${twinDisplayName}, my twin is currently offline, I will make sure your message is replied once he is online.`,
          offlineCourtesyMode: "dms_and_mentions",
          signature: twinDisplayName,
        });
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "workspaceContext database query fallback to default workspace");
  }

  return {
    userId,
    ownerEmail,
    ownerName,
    workspaceId,
    role: "owner",
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
  // 1. First look up by workspaceId and ownerEmail
  let rows = await db
    .select()
    .from(atlasTwinsTable)
    .where(
      and(
        eq(atlasTwinsTable.workspaceId, context.workspaceId),
        eq(atlasTwinsTable.ownerEmail, context.ownerEmail),
      ),
    )
    .limit(1);

  // 2. Fall back to workspaceId and ownerId
  if (rows.length === 0) {
    rows = await db
      .select()
      .from(atlasTwinsTable)
      .where(
        and(
          eq(atlasTwinsTable.workspaceId, context.workspaceId),
          eq(atlasTwinsTable.ownerId, context.userId),
        ),
      )
      .limit(1);
  }

  // 3. Fall back to any twin in this isolated workspace
  if (rows.length === 0) {
    rows = await db
      .select()
      .from(atlasTwinsTable)
      .where(eq(atlasTwinsTable.workspaceId, context.workspaceId))
      .limit(1);
  }

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