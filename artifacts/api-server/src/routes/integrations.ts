import { Router, type IRouter } from "express";
import { workspaceContext } from "../lib/atlas";
import { fetchLiveOutlookEmails, fetchLiveTeamsMeetings, getMSGraphConfig } from "../lib/integrations/msGraph";
import { fetchLiveZoomMeetings, getZoomConfig, handleZoomWebhookEvent } from "../lib/integrations/zoom";

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

router.post("/atlas/integrations/outlook/sync", async (req, res): Promise<void> => {
  const ctx = await workspaceContext(req, res);
  if (!ctx) return;

  const result = await fetchLiveOutlookEmails(ctx.workspaceId, ctx.userId);
  if (!result.success && result.requiresSetup) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
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

export default router;
