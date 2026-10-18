import { Router, type IRouter } from "express";
import { db, atlasLinkedAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { workspaceContext } from "../lib/atlas";
import { fetchLiveOutlookEmails, fetchLiveTeamsMeetings, getMSGraphConfig, verifyMSGraphToken } from "../lib/integrations/msGraph";
import { readOutlookInbox, readOutlookSent, syncOutlookDesktop } from "../lib/integrations/outlookDesktop";
import { fetchLiveZoomMeetings, getZoomConfig, handleZoomWebhookEvent } from "../lib/integrations/zoom";
import { syncAllLinkedAccounts } from "../lib/integrations/teamsCalendarSync";
import { joinTeamsLiveCallMediaStream } from "../lib/integrations/teamsCallingBot";
import { deployTeamsWebBrowserBot } from "../lib/integrations/teamsBrowserBot";

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

  const msGraph = getMSGraphConfig();
  const graphConfigured = Boolean(msGraph.accessToken || (msGraph.clientId && msGraph.clientSecret));

  // Preferred: Microsoft Graph when the tenant has granted app access.
  if (graphConfigured) {
    const result = await fetchLiveOutlookEmails(ctx.workspaceId, ctx.userId);
    if (result.success || !result.requiresSetup) {
      res.json(result);
      return;
    }
  }

  // Fallback: signed-in Outlook desktop app (no admin consent needed). Draft-only.
  const count = Math.min(Number(req.body?.count) || 10, 25);
  const sinceHours = Number(req.body?.sinceHours) || 48;
  const unreadOnly = req.body?.unreadOnly !== false;
  const desktop = await syncOutlookDesktop(ctx.workspaceId, ctx.userId, { count, sinceHours, unreadOnly });
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

// GET universal sync status across all workspaces
router.get("/atlas/integrations/sync/status", async (_req, res): Promise<void> => {
  const { getSyncStatus } = await import("../lib/integrations/teamsSyncService.js");
  const status = await getSyncStatus();
  res.json(status);
});

// POST trigger universal multi-workspace sync cycle immediately
router.post("/atlas/integrations/sync/trigger", async (_req, res): Promise<void> => {
  const { runTeamsSyncCycle } = await import("../lib/integrations/teamsSyncService.js");
  const status = await runTeamsSyncCycle();
  res.json({ success: true, status });
});

export default router;

