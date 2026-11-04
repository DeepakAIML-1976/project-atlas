import { Router, type IRouter } from "express";
import { db, atlasLinkedAccountsTable, atlasUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { workspaceContext } from "../lib/atlas";
import { fetchLiveOutlookEmails, fetchLiveTeamsMeetings, getMSGraphConfig, verifyMSGraphToken } from "../lib/integrations/msGraph";
import { readOutlookInbox, readOutlookSent, syncOutlookDesktop } from "../lib/integrations/outlookDesktop";
import { fetchLiveZoomMeetings, getZoomConfig, handleZoomWebhookEvent } from "../lib/integrations/zoom";
import { syncAllLinkedAccounts } from "../lib/integrations/teamsCalendarSync";
import { joinTeamsLiveCallMediaStream } from "../lib/integrations/teamsCallingBot";
import { deployTeamsWebBrowserBot } from "../lib/integrations/teamsBrowserBot";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/atlas/integrations/status", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const msGraph = getMSGraphConfig();
  const zoom = getZoomConfig();

  res.json({
    outlook: {
      configured: Boolean(msGraph.accessToken || msGraph.clientId),
      authType: msGraph.accessToken ? "OAuth Access Token" : msGraph.clientId ? "Azure Client ID" : "Not Configured",
      envVars: ["MS_GRAPH_ACCESS_TOKEN", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MS_GRAPH_TENANT_ID"],
    },
    teams: {
      configured: Boolean(msGraph.accessToken || msGraph.clientId),
      authType: msGraph.accessToken ? "OAuth Access Token" : msGraph.clientId ? "Azure Client ID" : "Not Configured",
      envVars: ["MS_GRAPH_ACCESS_TOKEN", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"],
    },
    zoom: {
      configured: Boolean(zoom.accessToken || zoom.clientId),
      authType: zoom.accessToken ? "OAuth Access Token" : zoom.clientId ? "Zoom Account ID" : "Not Configured",
      envVars: ["ZOOM_ACCESS_TOKEN", "ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"],
    },
  });
});

// GET list of all linked accounts for workspace
router.get("/atlas/integrations/accounts", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const accounts = await db
    .select()
    .from(atlasLinkedAccountsTable)
    .where(eq(atlasLinkedAccountsTable.workspaceId, ctx.workspaceId));

  res.json({ accounts });
});

// POST link a new MS Teams/Outlook/Zoom account
router.post("/atlas/integrations/accounts", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { accountType, accountEmail, displayName, accessToken, refreshToken, tenantId, clientId, clientSecret } = req.body;

  if (!accountType || !accountEmail) {
    res.status(400).json({ error: "accountType and accountEmail are required fields." });
    return;
  }

  // If an access token is provided, verify it first against Microsoft Graph API
  let verification: { valid: boolean; email?: string; displayName?: string; jobTitle?: string; office?: string; error?: string } | null = null;
  if (accessToken) {
    verification = await verifyMSGraphToken(accessToken);
  }

  const [account] = await db
    .insert(atlasLinkedAccountsTable)
    .values({
      workspaceId: ctx.workspaceId,
      accountType, // 'teams_personal', 'teams_company', 'outlook_personal', 'outlook_company', 'zoom'
      accountEmail: verification?.email || accountEmail,
      displayName: displayName || verification?.displayName || (accountType.includes("personal") ? "Deepak's Personal MS Teams" : "Deepak Paranjape (Kent PLC)"),
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      tenantId: tenantId || null,
      clientId: clientId || null,
      clientSecret: clientSecret || null,
      syncEnabled: true,
      lastSyncedAt: new Date(),
    })
    .returning();

  res.status(201).json({ account, verification });
});

// POST verify Microsoft Graph Token
router.post("/atlas/integrations/accounts/verify-token", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { accessToken } = req.body;
  if (!accessToken) {
    res.status(400).json({ valid: false, error: "Access token is required for verification." });
    return;
  }

  const result = await verifyMSGraphToken(accessToken);
  res.json(result);
});

// GET Azure OAuth Login Redirect URL
router.get("/atlas/integrations/azure/login", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const clientId = process.env.MS_GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID || "";
  const tenant = process.env.MS_GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID || "common";
  const redirectUri = encodeURIComponent(`${req.protocol}://${req.get("host")}/api/atlas/integrations/azure/callback`);
  const scope = encodeURIComponent("https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/OnlineMeetings.Read https://graph.microsoft.com/Mail.Read offline_access user.read");

  const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=${scope}`;

  res.json({ authUrl, clientIdConfigured: Boolean(clientId) });
});

// DELETE unlink an account
router.delete("/atlas/integrations/accounts/:id", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { id } = req.params;
  await db
    .delete(atlasLinkedAccountsTable)
    .where(
      and(
        eq(atlasLinkedAccountsTable.id, id),
        eq(atlasLinkedAccountsTable.workspaceId, ctx.workspaceId)
      )
    );

  res.json({ success: true, message: "Linked account removed successfully" });
});

// POST sync all linked accounts immediately
router.post("/atlas/integrations/accounts/sync-all", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const result = await syncAllLinkedAccounts(ctx.workspaceId, ctx.userId);
  res.json(result);
});

router.post("/atlas/integrations/outlook/sync", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const targetEmail = (req.body?.accountEmail || req.body?.targetEmail || req.body?.email || ctx.ownerEmail)?.trim().toLowerCase();
  logger.info({ workspaceId: ctx.workspaceId, userId: ctx.userId, targetEmail }, "Initiating Outlook email sync for workspace");

  // If email password was provided during ingestion prompt, encrypt and securely persist
  if (req.body?.password) {
    try {
      const { encryptCredential } = await import("../lib/authCrypto.js");
      const encPassword = encryptCredential(req.body.password);
      await db
        .update(atlasUsersTable)
        .set({ encryptedEmailPassword: encPassword })
        .where(eq(atlasUsersTable.id, ctx.userId));
    } catch (authErr: any) {
      logger.warn({ err: authErr?.message }, "Could not update encrypted email password");
    }
  }

  const count = Math.min(Number(req.body?.count) || 50, 100);
  const sinceHours = Number(req.body?.sinceHours) || 0;
  const sinceDate = req.body?.sinceDate || "2026-10-18T00:00:00";
  const unreadOnly = req.body?.unreadOnly === true;
  const generateDraft = req.body?.generateDraft === true || req.body?.autoDraft === true;

  // On Windows (SME workstation with live desktop Outlook running):
  if (process.platform === "win32") {
    try {
      const desktop = await syncOutlookDesktop(ctx.workspaceId, ctx.userId, {
        count,
        sinceHours,
        sinceDate,
        unreadOnly,
        targetEmail,
        generateDraft,
      });
      if (desktop.success && (desktop.drafted > 0 || (desktop.ingested ?? 0) > 0 || desktop.scanned > 0)) {
        res.json(desktop);
        return;
      }
    } catch (desktopErr: any) {
      logger.warn({ err: desktopErr?.message }, "Windows desktop Outlook sync attempted but fell through to Graph");
    }
  }

  const msGraph = getMSGraphConfig();
  const graphConfigured = Boolean(msGraph.accessToken || (msGraph.clientId && msGraph.clientSecret));

  // Preferred in cloud / Render: Microsoft Graph when the tenant has granted app access
  if (graphConfigured) {
    const result = await fetchLiveOutlookEmails(ctx.workspaceId, ctx.userId, targetEmail, generateDraft);
    if (result.success || !result.requiresSetup) {
      res.json(result);
      return;
    }
  }

  // Fallback: signed-in Outlook desktop app (no admin consent needed).
  const desktop = await syncOutlookDesktop(ctx.workspaceId, ctx.userId, {
    count,
    sinceHours,
    sinceDate,
    unreadOnly,
    targetEmail,
    generateDraft,
  });
  if (!desktop.success) {
    res.status(502).json(desktop);
    return;
  }
  res.json(desktop);
});

// Read-only previews of the signed-in Outlook desktop mailbox (nothing is stored or sent).
router.get("/atlas/integrations/outlook/desktop/inbox", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;
  try {
    const count = Math.min(Number(req.query.count) || 10, 50);
    const mails = await readOutlookInbox(count, Number(req.query.sinceHours) || 0, req.query.unreadOnly === "true");
    res.json({ source: "outlook_desktop", folder: "inbox", count: mails.length, emails: mails.map((m) => ({ ...m, body: m.body.slice(0, 300) })) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "Outlook desktop unavailable" });
  }
});

router.get("/atlas/integrations/outlook/desktop/sent", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;
  try {
    const count = Math.min(Number(req.query.count) || 10, 50);
    const mails = await readOutlookSent(count, Number(req.query.sinceHours) || 0);
    res.json({ source: "outlook_desktop", folder: "sent", count: mails.length, emails: mails.map((m) => ({ ...m, body: m.body.slice(0, 300) })) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "Outlook desktop unavailable" });
  }
});

router.post("/atlas/integrations/teams/sync", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const result = await fetchLiveTeamsMeetings(ctx.workspaceId, ctx.userId);
  if (!result.success && result.requiresSetup) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

router.post("/atlas/integrations/teams/calling/join", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { meetingUrl, botDisplayName } = req.body;
  if (!meetingUrl) {
    res.status(400).json({ error: "meetingUrl is required to trigger Teams Graph Calling join." });
    return;
  }

  const result = await joinTeamsLiveCallMediaStream(ctx.workspaceId, { meetingUrl, botDisplayName });
  res.json(result);
});

router.post("/atlas/integrations/teams/browser-bot/join", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { meetingUrl, botDisplayName, autoQnA, trackAttendance, extractActions } = req.body;
  if (!meetingUrl) {
    res.status(400).json({ error: "meetingUrl is required." });
    return;
  }

  const result = await deployTeamsWebBrowserBot({
    workspaceId: ctx.workspaceId,
    meetingUrl,
    botDisplayName,
    autoQnA,
    trackAttendance,
    extractActions,
  });
  res.json(result);
});

router.post("/atlas/integrations/teams/browser-bot/transcript", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  const workspaceId = ctx?.workspaceId || "default";
  const { liveMeetingId, speakerName, text } = req.body;

  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const { handleLiveMeetingChunk } = await import("../lib/integrations/teamsBrowserBot");
  const result = await handleLiveMeetingChunk(workspaceId, liveMeetingId || "live_teams", speakerName || "Speaker", text);
  res.json(result);
});

router.post("/atlas/integrations/teams/chat/message", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  const { workspaceId: bodyWsId, chatId, messageId, senderName, senderEmail, chatType, messageText, isMentioned, isReplyToDeepak, threadHistory } = req.body;
  const workspaceId = bodyWsId || ctx?.workspaceId || "default";

  if (!messageText || !senderName) {
    res.status(400).json({ error: "messageText and senderName are required fields." });
    return;
  }

  const { processTeamsChatMessage } = await import("../lib/integrations/teamsChatBot");
  const result = await processTeamsChatMessage({
    workspaceId,
    chatId: chatId || "teams_chat_001",
    messageId: messageId || `msg_${Date.now()}`,
    senderName,
    senderEmail,
    chatType: chatType || "group_chat",
    messageText,
    isMentioned: Boolean(isMentioned),
    isReplyToDeepak: Boolean(isReplyToDeepak),
    threadHistory: Array.isArray(threadHistory) ? threadHistory : [],
  });

  res.json(result);
});



router.post("/atlas/integrations/zoom/sync", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const result = await fetchLiveZoomMeetings(ctx.workspaceId, ctx.userId);
  if (!result.success && result.requiresSetup) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

router.post("/atlas/integrations/zoom/webhook", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  const workspaceId = ctx?.workspaceId || "default";

  const result = await handleZoomWebhookEvent(workspaceId, req.body);
  res.json({ status: "received", result });
});

router.post("/atlas/integrations/outlook/webhook", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  const workspaceId = ctx?.workspaceId || "default";
  const userId = ctx?.userId || "user_deepak_sme";

  if (req.body?.value) {
    for (const notification of req.body.value) {
      if (notification.resourceData) {
        await fetchLiveOutlookEmails(workspaceId, userId);
      }
    }
  }

  res.json({ status: "acknowledged" });
});

// GET real-time health and readiness of Outlook, Teams, and Zoom
router.get("/atlas/integrations/client-health", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  const workspaceId = ctx?.workspaceId || "1a39970a-abf0-48c3-8b89-08b669e80bbe";
  const { getClientAppHealth } = await import("../lib/integrations/appHealthService.js");
  const report = await getClientAppHealth(workspaceId);
  res.json(report);
});

// POST trigger on-demand re-check of client applications and sync health
router.post("/atlas/integrations/client-health/recheck", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  const workspaceId = ctx?.workspaceId || "1a39970a-abf0-48c3-8b89-08b669e80bbe";
  const { getClientAppHealth } = await import("../lib/integrations/appHealthService.js");
  const report = await getClientAppHealth(workspaceId);
  res.json({ success: true, report });
});

// GET Outlook Desktop status (is Outlook.exe running on workstation)
router.get("/atlas/integrations/outlook/status", async (req, res): Promise<void> => {
  const { isOutlookProcessRunning } = await import("../lib/integrations/outlookCalendar.js");
  const isRunning = isOutlookProcessRunning();
  res.json({
    platform: process.platform,
    isDesktopAvailable: process.platform === "win32",
    isRunning,
    account: "deepak.paranjape@kentplc.com",
    message: isRunning
      ? "Outlook desktop app is active and ready for sync."
      : "Outlook is not currently running. Please open the Outlook desktop app to allow sync.",
  });
});

// POST sync Outlook Calendar meetings into atlas_live_meetings
router.post("/atlas/integrations/outlook/calendar/sync", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const targetEmail = (req.body?.targetEmail || req.body?.accountEmail || req.body?.email || ctx.ownerEmail || "deepak.paranjape@kentplc.com").trim().toLowerCase();
  const daysAhead = Number(req.body?.daysAhead) || 14;

  if (process.platform === "win32") {
    const { syncOutlookCalendar, isOutlookProcessRunning } = await import("../lib/integrations/outlookCalendar.js");
    if (!isOutlookProcessRunning()) {
      res.status(400).json({
        success: false,
        error: "Outlook desktop application is not open. Please open your Outlook desktop app and try again.",
        requiresOutlookOpen: true,
      });
      return;
    }

    const result = await syncOutlookCalendar(ctx.workspaceId, daysAhead, targetEmail);
    res.json(result);
    return;
  }

  // Cloud/Render notice:
  res.status(400).json({
    success: false,
    error: "Calendar synchronization from your signed-in corporate Outlook profile runs directly from your Windows workstation via sync_outlook_to_cloud.bat or the local desktop runner (no corporate IT admin consent needed).",
    requiresWorkstation: true,
  });
});

// GET universal sync status across all workspaces
router.get("/atlas/integrations/sync/status", async (_req, res): Promise<void> => {
  const { getSyncStatus } = await import("../lib/integrations/teamsSyncService.js");
  const status = await getSyncStatus();
  res.json(status);
});

// GET chat messages from MS Teams and Zoom
router.get("/atlas/chat-drafts", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const platform = req.query.platform as string | undefined;
  const status = req.query.status as string | undefined;

  try {
    const { db, atlasChatDraftsTable } = await import("@workspace/db");
    const { eq, and, desc } = await import("drizzle-orm");

    const conditions = [eq(atlasChatDraftsTable.workspaceId, ctx.workspaceId)];
    if (platform && platform !== "all") {
      conditions.push(eq(atlasChatDraftsTable.platform, platform));
    }
    if (status && status !== "all") {
      conditions.push(eq(atlasChatDraftsTable.status, status));
    }

    const chatDrafts = await db
      .select()
      .from(atlasChatDraftsTable)
      .where(and(...conditions))
      .orderBy(desc(atlasChatDraftsTable.createdAt));

    res.json({ chatDrafts });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to fetch chat drafts");
    res.json({ chatDrafts: [] });
  }
});

// POST ingest a new chat message from MS Teams or Zoom
router.post("/atlas/chat-drafts/ingest", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { platform, chatId, senderName, senderEmail, incomingMessage } = req.body;
  if (!chatId || !senderName || !incomingMessage) {
    res.status(400).json({ error: "Missing required fields (chatId, senderName, incomingMessage)" });
    return;
  }

  const { ingestCleanChatMessage } = await import("../lib/integrations/chatMonitoringService.js");
  const result = await ingestCleanChatMessage({
    workspaceId: ctx.workspaceId,
    platform: platform === "zoom" ? "zoom" : "teams",
    chatId: String(chatId),
    senderName: String(senderName),
    senderEmail: senderEmail ? String(senderEmail) : undefined,
    incomingMessage: String(incomingMessage),
  });

  res.status(201).json(result);
});

// POST generate AI draft reply for a user-selected chat message
router.post("/atlas/chat-drafts/:id/generate-draft", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { generateDraftForChatMessage } = await import("../lib/integrations/chatMonitoringService.js");
  const result = await generateDraftForChatMessage(ctx.workspaceId, id);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result);
});

// PATCH edit draft response text
router.patch("/atlas/chat-drafts/:id", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { twinDraftResponse, reasoning } = req.body;

  const { db, atlasChatDraftsTable } = await import("@workspace/db");
  const { eq, and } = await import("drizzle-orm");

  const [updated] = await db
    .update(atlasChatDraftsTable)
    .set({
      twinDraftResponse,
      reasoning: reasoning !== undefined ? reasoning : undefined,
    })
    .where(
      and(
        eq(atlasChatDraftsTable.id, id),
        eq(atlasChatDraftsTable.workspaceId, ctx.workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  res.json(updated);
});

// POST approve draft response
router.post("/atlas/chat-drafts/:id/approve", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { db, atlasChatDraftsTable } = await import("@workspace/db");
  const { eq, and } = await import("drizzle-orm");

  const [updated] = await db
    .update(atlasChatDraftsTable)
    .set({
      status: "approved",
      authorizedAt: new Date(),
    })
    .where(
      and(
        eq(atlasChatDraftsTable.id, id),
        eq(atlasChatDraftsTable.workspaceId, ctx.workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  res.json({ success: true, record: updated });
});

// DELETE chat draft
router.delete("/atlas/chat-drafts/:id", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { db, atlasChatDraftsTable } = await import("@workspace/db");
  const { eq, and } = await import("drizzle-orm");

  await db
    .delete(atlasChatDraftsTable)
    .where(
      and(
        eq(atlasChatDraftsTable.id, id),
        eq(atlasChatDraftsTable.workspaceId, ctx.workspaceId),
      ),
    );

  res.json({ success: true, id });
});

// POST clear all chat drafts for this workspace
router.post("/atlas/chat-drafts/clear", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const { clearAllChatDrafts } = await import("../lib/integrations/chatMonitoringService.js");
  const count = await clearAllChatDrafts(ctx.workspaceId);
  res.json({ success: true, clearedCount: count });
});

// POST sync Teams & Zoom messages from workstation
router.post("/atlas/integrations/chat/sync", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  if (process.platform === "win32") {
    const { syncTeamsAndZoomMessages } = await import("../lib/integrations/chatMonitoringService.js");
    const report = await syncTeamsAndZoomMessages(ctx.workspaceId);
    res.json(report);
  } else {
    // Cloud/Render environment: read desktop application health and synced messages from Supabase
    try {
      const { getClientAppHealth } = await import("../lib/integrations/appHealthService.js");
      const health = await getClientAppHealth(ctx.workspaceId);

      const { db, atlasChatDraftsTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const allDrafts = await db
        .select()
        .from(atlasChatDraftsTable)
        .where(eq(atlasChatDraftsTable.workspaceId, ctx.workspaceId));

      const teamsCount = allDrafts.filter((d) => d.platform === "teams").length;
      const zoomCount = allDrafts.filter((d) => d.platform === "zoom").length;

      let alertMessage = "";
      if (!health.apps.teams.running) {
        alertMessage = "Microsoft Teams is not running in your workstation's system tasks. Please open the Teams desktop app to ingest messages.";
      } else if (!health.apps.zoom.running) {
        alertMessage = "Zoom Workplace is not running in your workstation's system tasks. Please open the Zoom desktop app to ingest meeting chats.";
      }

      res.json({
        teamsCount,
        zoomCount,
        totalNew: 0,
        isCloud: true,
        health,
        alertMessage,
      });
    } catch (err: any) {
      res.json({ teamsCount: 0, zoomCount: 0, totalNew: 0 });
    }
  }
});

export default router;

