import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db, atlasUsersTable, atlasWorkspacesTable, atlasMembershipsTable, atlasTwinsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, encryptCredential } from "../lib/authCrypto";
import { getTwinDisplayName } from "../lib/atlas";

const router: IRouter = Router();

export function generateSessionToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, timestamp: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.CREDENTIALS_ENCRYPTION_KEY || "kent-digital-twin-suite-2026-key-32b")
    .update(payload)
    .digest("hex");
  return `atlas_sess_${payload}.${signature}`;
}

// POST /api/atlas/auth/login
router.post("/atlas/auth/login", async (req, res): Promise<void> => {
  const { email, password, consent } = req.body || {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid corporate email ID is required." });
    return;
  }

  if (!password || typeof password !== "string" || password.trim().length === 0) {
    res.status(400).json({ error: "Email password is required to authenticate." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    let [user] = await db
      .select()
      .from(atlasUsersTable)
      .where(eq(atlasUsersTable.email, normalizedEmail))
      .limit(1);

    if (!user) {
      // Auto-register any new Kent engineer corporate email upon first verified sign-in
      const localPart = normalizedEmail.split("@")[0];
      const formattedName = localPart
        .split(/[._-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");

      const pHash = hashPassword(password);
      const encPassword = encryptCredential(password);

      [user] = await db
        .insert(atlasUsersTable)
        .values({
          email: normalizedEmail,
          passwordHash: pHash,
          displayName: formattedName || "Kent Engineer",
          role: "engineer",
          encryptedEmailPassword: encPassword,
          consentGiven: Boolean(consent),
          consentGivenAt: consent ? new Date() : null,
          lastLoginAt: new Date(),
        })
        .returning();
    } else {
      // Verify password against stored hash in the database
      const isValid = verifyPassword(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "Invalid corporate email ID or email password. Please check your credentials and try again." });
        return;
      }

      // Update encrypted email password for background M365 (Outlook/Teams) access & record login
      const encPassword = encryptCredential(password);
      await db
        .update(atlasUsersTable)
        .set({
          encryptedEmailPassword: encPassword,
          lastLoginAt: new Date(),
          ...(consent ? { consentGiven: true, consentGivenAt: new Date() } : {}),
        })
        .where(eq(atlasUsersTable.id, user.id));
    }

    // Ensure user has an isolated workspace and digital twin created
    const existingTwins = await db
      .select()
      .from(atlasTwinsTable)
      .where(eq(atlasTwinsTable.ownerEmail, normalizedEmail))
      .limit(1);

    if (existingTwins.length === 0) {
      const twinDisplayName = getTwinDisplayName(user.displayName);
      const [workspace] = await db
        .insert(atlasWorkspacesTable)
        .values({
          name: `${user.displayName}'s Piping Engineering Workspace`,
          industry: "Oil & Gas Piping Engineering",
        })
        .returning();

      await db.insert(atlasMembershipsTable).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
      });

      await db.insert(atlasTwinsTable).values({
        workspaceId: workspace.id,
        ownerId: user.id,
        ownerEmail: normalizedEmail,
        displayName: twinDisplayName,
        autonomyLevel: 1,
        autonomyReason: `Initial SME workspace auto-provisioned for ${normalizedEmail}`,
      });
    }

    const token = generateSessionToken(normalizedEmail);
    const firstName = user.displayName.split(" ")[0];

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        twinTitle: `${firstName}'s AI Representative`,
        consentGiven: user.consentGiven || Boolean(consent),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: `Authentication failed: ${err.message}` });
  }
});

// POST /api/atlas/auth/verify-switch
router.post("/atlas/auth/verify-switch", async (req, res): Promise<void> => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    res.status(400).json({ error: "Email ID and password are required to switch profiles." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(atlasUsersTable)
    .where(eq(atlasUsersTable.email, normalizedEmail))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Profile not found in database. Please log in first." });
    return;
  }

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ error: "Invalid password for this engineer profile." });
    return;
  }

  const token = generateSessionToken(normalizedEmail);
  const firstName = user.displayName.split(" ")[0];

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      twinTitle: `${firstName}'s AI Representative`,
    },
  });
});

// GET /api/atlas/auth/me
router.get("/atlas/auth/me", async (req, res): Promise<void> => {
  const ownerEmail = (req.headers["x-owner-email"] as string)?.trim().toLowerCase() || "deepak.paranjape@kentplc.com";

  const [user] = await db
    .select()
    .from(atlasUsersTable)
    .where(eq(atlasUsersTable.email, ownerEmail))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const firstName = user.displayName.split(" ")[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      twinTitle: `${firstName}'s AI Representative`,
      consentGiven: user.consentGiven,
      lastLoginAt: user.lastLoginAt,
    },
  });
});

// GET /api/atlas/auth/m365/login
router.get("/atlas/auth/m365/login", async (_req, res): Promise<void> => {
  const { generatePkce } = await import("../lib/pkce");
  const tenantId = process.env.MS_GRAPH_TENANT_ID || "5af47cf9-2cb5-4b53-a5ec-f7fa67c69552";
  const clientId = process.env.MS_GRAPH_CLIENT_ID || "36cd549a-b6da-4af7-a41c-c898a8d7553e";
  const redirectUri = "http://localhost:5000/auth/callback";
  const { challenge, state } = generatePkce();
  const scope = encodeURIComponent("https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access");
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256&login_hint=DeepakParanjape@DPEngineeringservices.onmicrosoft.com`;
  res.redirect(authUrl);
});

export default router;
