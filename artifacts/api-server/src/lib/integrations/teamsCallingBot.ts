import { logger } from "../logger";
import { resolveMSGraphToken } from "./msGraph.js";

export interface TeamsCallingMeetingPayload {
  meetingUrl: string;
  tenantId?: string;
  botDisplayName?: string;
}

/**
 * Microsoft Graph Real-Time Communications Calling API Client
 * 
 * Uses Microsoft Graph Call Protocol:
 * POST https://graph.microsoft.com/v1.0/communications/calls
 * 
 * Permissions Required in Azure AD:
 * - Calls.JoinGroupCall.All (Application Permission)
 * - Calls.AccessMedia.All (Application Permission)
 */
export async function joinTeamsLiveCallMediaStream(
  workspaceId: string,
  payload: TeamsCallingMeetingPayload,
  accessToken?: string
) {
  const token = accessToken || (await resolveMSGraphToken());
  if (!token) {
    return {
      success: false,
      error: "Microsoft Graph Access Token could not be resolved from Client Credentials.",
    };
  }

  try {
    // Microsoft Graph Calling API payload to join meeting via URL
    const body = {
      "@odata.type": "#microsoft.graph.call",
      callbackUri: `${process.env.PUBLIC_APP_URL || "https://localhost:5000"}/api/teams/calling/callback`,
      requestedModalities: ["audio"],
      mediaConfig: {
        "@odata.type": "#microsoft.graph.serviceHostedMediaConfig",
      },
      meetingInfo: {
        "@odata.type": "#microsoft.graph.organizerMeetingInfo",
        organizer: {
          "@odata.type": "#microsoft.graph.identitySet",
          user: {
            id: "organizer-id",
            displayName: payload.botDisplayName || "Deepak's AI Representative (Atlas)",
          }
        }
      }
    };

    const response = await fetch("https://graph.microsoft.com/v1.0/communications/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn({ errText, status: response.status }, "Microsoft Graph Calling API join failed");
      return {
        success: false,
        status: response.status,
        error: `Microsoft Graph Calling API Error (${response.status}): ${errText}`,
      };
    }

    const callData = (await response.json()) as { id?: string; state?: string };
    return {
      success: true,
      callId: callData.id,
      state: callData.state,
      message: "Successfully initiated Microsoft Graph Call Join protocol to live Teams meeting!",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to trigger Microsoft Graph Calling API",
    };
  }
}
