import { db, atlasEmailDraftsTable, atlasLiveMeetingsTable } from "@workspace/db";
import { processIncomingEmail } from "../atlasEmailIngest";

export interface MSGraphConfig {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  accessToken?: string;
}

export function getMSGraphConfig(): MSGraphConfig {
  return {
    clientId: process.env.MS_GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET,
    tenantId: process.env.MS_GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID || "common",
    accessToken: process.env.MS_GRAPH_ACCESS_TOKEN,
  };
}

export async function fetchLiveOutlookEmails(
  workspaceId: string,
  userId: string,
  config: MSGraphConfig = getMSGraphConfig(),
) {
  const token = config.accessToken;
  if (!token) {
    return {
      success: false,
      error: "Microsoft Graph Access Token (MS_GRAPH_ACCESS_TOKEN) or OAuth Client Credentials not configured in .env",
      requiresSetup: true,
      setupInstructions: "Set MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MS_GRAPH_TENANT_ID or MS_GRAPH_ACCESS_TOKEN in .env",
    };
  }

  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime desc",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Microsoft Graph API error (${response.status}): ${errText}` };
    }

    const data = (await response.json()) as {
      value: Array<{
        id: string;
        subject: string;
        bodyPreview: string;
        body?: { content?: string };
        from?: { emailAddress?: { name?: string; address?: string } };
        receivedDateTime: string;
      }>;
    };

    const ingestedDrafts = [];
    for (const msg of data.value ?? []) {
      const sender = msg.from?.emailAddress
        ? `${msg.from.emailAddress.name || ""} <${msg.from.emailAddress.address || ""}>`.trim()
        : "Unknown Sender";
      const subject = msg.subject || "No Subject";
      const incomingBody = msg.body?.content || msg.bodyPreview || "";

      const draft = await processIncomingEmail(workspaceId, userId, sender, subject, incomingBody);
      ingestedDrafts.push(draft);
    }

    return {
      success: true,
      count: ingestedDrafts.length,
      emails: ingestedDrafts,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to query Microsoft Graph API" };
  }
}

export async function fetchLiveTeamsMeetings(
  workspaceId: string,
  userId: string,
  config: MSGraphConfig = getMSGraphConfig(),
) {
  const token = config.accessToken;
  if (!token) {
    return {
      success: false,
      error: "Microsoft Graph Access Token not configured for Teams Online Meetings",
      requiresSetup: true,
    };
  }

  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Microsoft Graph Teams API error (${response.status}): ${errText}` };
    }

    const data = (await response.json()) as {
      value: Array<{
        id: string;
        subject: string;
        joinWebUrl: string;
        startDateTime: string;
      }>;
    };

    const syncedMeetings = [];
    for (const meeting of data.value ?? []) {
      const [newMeeting] = await db
        .insert(atlasLiveMeetingsTable)
        .values({
          workspaceId,
          meetingTitle: meeting.subject || "Live MS Teams Meeting",
          platform: "teams",
          meetingUrl: meeting.joinWebUrl,
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
    return { success: false, error: err?.message || "Failed to fetch Microsoft Teams meetings" };
  }
}
