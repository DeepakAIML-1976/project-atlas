import { db, atlasLiveMeetingsTable } from "@workspace/db";
import { processLiveTranscriptChunk } from "../atlasMeetingBot";

export interface ZoomConfig {
  accountId?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
}

export function getZoomConfig(): ZoomConfig {
  return {
    accountId: process.env.ZOOM_ACCOUNT_ID,
    clientId: process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
    accessToken: process.env.ZOOM_ACCESS_TOKEN,
  };
}

export async function fetchLiveZoomMeetings(
  workspaceId: string,
  userId: string,
  config: ZoomConfig = getZoomConfig(),
) {
  const token = config.accessToken;
  if (!token) {
    return {
      success: false,
      error: "Zoom Access Token (ZOOM_ACCESS_TOKEN) or Server-to-Server OAuth credentials not configured in .env",
      requiresSetup: true,
      setupInstructions: "Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET or ZOOM_ACCESS_TOKEN in .env",
    };
  }

  try {
    const response = await fetch("https://api.zoom.us/v2/users/me/meetings?type=live", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Zoom REST API error (${response.status}): ${errText}` };
    }

    const data = (await response.json()) as {
      meetings: Array<{
        id: number | string;
        topic: string;
        join_url: string;
        start_time: string;
      }>;
    };

    const syncedMeetings = [];
    for (const meeting of data.meetings ?? []) {
      const [newMeeting] = await db
        .insert(atlasLiveMeetingsTable)
        .values({
          workspaceId,
          meetingTitle: meeting.topic || "Live Zoom Meeting",
          platform: "zoom",
          meetingUrl: meeting.join_url,
          botStatus: "idle",
          botDisplayName: "Deepak's AI Representative (Atlas)",
        })
        .returning();
      syncedMeetings.push(newMeeting);
    }

    return {
      success: true,
      count: syncedMeetings.length,
      meetings: syncedMeetings,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to query Zoom API" };
  }
}

export async function handleZoomWebhookEvent(
  workspaceId: string,
  eventData: {
    event: string;
    payload?: {
      object?: {
        id?: string | number;
        topic?: string;
        speaker_name?: string;
        transcript_text?: string;
      };
    };
  },
) {
  const eventName = eventData.event;
  const payloadObj = eventData.payload?.object;

  if (eventName === "meeting.transcript_completed" || eventName === "meeting.live_transcript") {
    const meetingId = String(payloadObj?.id || "");
    const speakerName = payloadObj?.speaker_name || "Zoom Speaker";
    const transcriptText = payloadObj?.transcript_text || "";

    if (meetingId && transcriptText) {
      return await processLiveTranscriptChunk(workspaceId, meetingId, speakerName, transcriptText);
    }
  }

  return { received: true, event: eventName };
}
