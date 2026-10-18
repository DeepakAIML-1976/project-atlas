import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, atlasTwinPreferencesTable } from "@workspace/db";
import { workspaceContext, getTwinDisplayName } from "../lib/atlas";

const router: IRouter = Router();

// GET /api/atlas/preferences/rules
router.get("/atlas/preferences/rules", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  try {
    const existing = await db
      .select()
      .from(atlasTwinPreferencesTable)
      .where(eq(atlasTwinPreferencesTable.ownerEmail, context.ownerEmail))
      .limit(1);

    if (existing.length > 0) {
      res.json(existing[0]);
      return;
    }

    // Default initialization if none exists yet
    const twinName = getTwinDisplayName(context.ownerName);
    const [newPref] = await db
      .insert(atlasTwinPreferencesTable)
      .values({
        workspaceId: context.workspaceId,
        ownerEmail: context.ownerEmail,
        ingestionKeywords: ["Alky Reactor", "Alky Flare", "5884", "5333"],
        allowedSenderEmails: [],
        excludedDomains: [],
        offlineCourtesyMessage: `I am ${twinName}, my twin is currently offline, I will make sure your message is replied once he is online.`,
        offlineCourtesyMode: "dms_and_mentions",
        signature: twinName,
      })
      .returning();

    res.json(newPref);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch preferences" });
  }
});

// PUT /api/atlas/preferences/rules
router.put("/atlas/preferences/rules", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;

  try {
    const {
      ingestionKeywords,
      allowedSenderEmails,
      excludedDomains,
      offlineCourtesyMessage,
      offlineCourtesyMode,
      signature,
      ownerIsOnline,
    } = req.body;

    const existing = await db
      .select()
      .from(atlasTwinPreferencesTable)
      .where(eq(atlasTwinPreferencesTable.ownerEmail, context.ownerEmail))
      .limit(1);

    const twinName = getTwinDisplayName(context.ownerName);

    if (existing.length > 0) {
      const [updated] = await db
        .update(atlasTwinPreferencesTable)
        .set({
          ingestionKeywords: Array.isArray(ingestionKeywords) ? ingestionKeywords : existing[0].ingestionKeywords,
          allowedSenderEmails: Array.isArray(allowedSenderEmails) ? allowedSenderEmails : existing[0].allowedSenderEmails,
          excludedDomains: Array.isArray(excludedDomains) ? excludedDomains : existing[0].excludedDomains,
          offlineCourtesyMessage: typeof offlineCourtesyMessage === "string" && offlineCourtesyMessage.trim() ? offlineCourtesyMessage.trim() : existing[0].offlineCourtesyMessage,
          offlineCourtesyMode: offlineCourtesyMode || existing[0].offlineCourtesyMode,
          signature: typeof signature === "string" && signature.trim() ? signature.trim() : existing[0].signature,
          ownerIsOnline: typeof ownerIsOnline === "boolean" ? ownerIsOnline : existing[0].ownerIsOnline,
          updatedAt: new Date(),
        })
        .where(eq(atlasTwinPreferencesTable.id, existing[0].id))
        .returning();

      res.json(updated);
    } else {
      const [created] = await db
        .insert(atlasTwinPreferencesTable)
        .values({
          workspaceId: context.workspaceId,
          ownerEmail: context.ownerEmail,
          ingestionKeywords: Array.isArray(ingestionKeywords) ? ingestionKeywords : ["Alky Reactor", "Alky Flare", "5884", "5333"],
          allowedSenderEmails: Array.isArray(allowedSenderEmails) ? allowedSenderEmails : [],
          excludedDomains: Array.isArray(excludedDomains) ? excludedDomains : [],
          offlineCourtesyMessage: typeof offlineCourtesyMessage === "string" && offlineCourtesyMessage.trim() ? offlineCourtesyMessage.trim() : `I am ${twinName}, my twin is currently offline, I will make sure your message is replied once he is online.`,
          offlineCourtesyMode: offlineCourtesyMode || "dms_and_mentions",
          signature: typeof signature === "string" && signature.trim() ? signature.trim() : twinName,
          ownerIsOnline: typeof ownerIsOnline === "boolean" ? ownerIsOnline : false,
        })
        .returning();

      res.json(created);
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to update preferences" });
  }
});

export default router;
