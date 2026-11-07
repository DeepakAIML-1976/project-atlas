import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, atlasMembershipsTable, atlasTwinsTable, atlasWorkspacesTable, atlasUsersTable } from "@workspace/db";
import { logger } from "./logger";
import { parseSessionToken } from "../routes/auth";

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
  // 1. Check Clerk auth if configured
  if (process.env.CLERK_SECRET_KEY) {
    try {
      const auth = getAuth(req);
      if (auth.userId) {
        const headerEmail = (req.headers["x-owner-email"] as string)?.trim().toLowerCase() || "deepak.paranjape@kentplc.com";
        return { userId: auth.userId, ownerEmail: headerEmail, ownerName: "Deepak Paranjape" };
      }
    } catch {}
  }

  // 2. Extract token from Authorization header, cookie, or custom header
  const authHeader = (req.headers["authorization"] as string)?.trim();
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cookieToken = (req.cookies?.atlas_session as string)?.trim() || null;
  const customHeaderToken = (req.headers["x-session-token"] as string)?.trim() || null;
  const token = bearerToken || cookieToken || customHeaderToken;

  if (!token) {
    res.status(401).json({
      error: "Authentication required. Please log in with your email and password.",
      code: "AUTH_REQUIRED",
    });
    return null;
  }

  // 3. Verify cryptographic token signature & extract payload
  const parsed = parseSessionToken(token);
  if (!parsed || !parsed.email) {
    res.status(401).json({
      error: "Invalid or expired session token. Please log in again.",
      code: "AUTH_REQUIRED",
    });
    return null;
  }

  const normalizedEmail = parsed.email.trim().toLowerCase();

  // 4. Validate active session token against database (Single Concurrent Session Enforcement)
  try {
    const [user] = await db
      .select()
      .from(atlasUsersTable)
      .where(eq(atlasUsersTable.email, normalizedEmail))
      .limit(1);

    if (!user) {
      res.status(401).json({
        error: "User account not found. Please log in again.",
        code: "AUTH_REQUIRED",
      });
      return null;
    }

    // If another device/browser logged in, user.activeSessionToken was replaced with a new token!
    // Or if logged out, activeSessionToken was cleared to null.
    if (!user.activeSessionToken || user.activeSessionToken !== token) {
      const isSuperseded = Boolean(user.activeSessionToken && user.activeSessionToken !== token);
      logger.warn({ email: normalizedEmail, providedToken: token.substring(0, 18) }, isSuperseded ? "Session superseded by login on another device" : "Session token is no longer active");
      res.status(401).json({
        error: isSuperseded
          ? "This account has been logged in on another device or system. Your session has ended."
          : "Session has expired or was terminated. Please log in again.",
        code: isSuperseded ? "SESSION_SUPERSEDED" : "AUTH_REQUIRED",
      });
      return null;
    }

    const userId = user.id;
    const ownerEmail = user.email;
    const ownerName = user.displayName;

    return { userId, ownerEmail, ownerName };
  } catch (err: any) {
    logger.error({ err }, "Database error during session validation");
    res.status(500).json({ error: "Failed to validate session.", code: "SERVER_ERROR" });
    return null;
  }
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
  try {
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

    if (rows[0]) return rows[0];
  } catch (err: any) {
    logger.warn({ err: err?.message }, "userTwin query fallback");
  }

  return {
    id: "twin_deepak_default",
    workspaceId: context.workspaceId,
    ownerId: context.userId,
    ownerEmail: context.ownerEmail,
    displayName: `${context.ownerName}'s AI Representative`,
    autonomyLevel: 1,
    autonomyReason: "Default representative",
    autonomyUpdatedAt: new Date(),
    createdAt: new Date(),
  };
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