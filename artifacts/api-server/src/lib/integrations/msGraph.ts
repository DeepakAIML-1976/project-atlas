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

export async function resolveMSGraphToken(config: MSGraphConfig = getMSGraphConfig()): Promise<string | null> {
  if (config.accessToken) {
    return config.accessToken;
  }

  if (config.clientId && config.clientSecret) {
    try {
      const tenant = config.tenantId || "common";
      const params = new URLSearchParams();
      params.append("client_id", config.clientId);
      params.append("client_secret", config.clientSecret);
      params.append("grant_type", "client_credentials");
      params.append("scope", "https://graph.microsoft.com/.default");

      const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { access_token?: string };
        return tokenData.access_token || null;
      }
    } catch (err) {
      console.warn("Microsoft Graph OAuth token fetch failed:", err);
    }
  }

  return null;
}

export async function fetchLiveOutlookEmails(
  workspaceId: string,
  userId: string,
  config: MSGraphConfig = getMSGraphConfig(),
) {
  const token = await resolveMSGraphToken(config);
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

export async function verifyMSGraphToken(token: string) {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return { valid: false, error: `Microsoft Graph API Authentication Error (${response.status}): ${errText}` };
    }

    const profile = (await response.json()) as {
      userPrincipalName?: string;
      displayName?: string;
      mail?: string;
      jobTitle?: string;
      officeLocation?: string;
    };

    return {
      valid: true,
      email: profile.mail || profile.userPrincipalName || "Unknown",
      displayName: profile.displayName || "Deepak Paranjape",
      jobTitle: profile.jobTitle || "Piping Engineer",
      office: profile.officeLocation || "Kent PLC / Kentech Group DMCC",
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || "Failed to communicate with Microsoft Graph API" };
  }
}

export async function fetchLiveTeamsMeetings(
  workspaceId: string,
  userId: string,
  config: MSGraphConfig = getMSGraphConfig(),
) {
  const token = await resolveMSGraphToken(config);
  if (!token) {
    return {
      success: false,
      error: "Microsoft Graph Access Token not configured for Teams Online Meetings",
      requiresSetup: true,
    };
  }

  try {
    const syncedMeetings = [];

    // 1. Fetch online meetings endpoint
    const meetingsRes = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (meetingsRes.ok) {
      const data = (await meetingsRes.json()) as {
        value: Array<{
          id: string;
          subject: string;
          joinWebUrl: string;
          startDateTime: string;
        }>;
      };

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
    }

    // 2. Fetch calendar events endpoint (for scheduled Teams meetings)
    const calendarRes = await fetch("https://graph.microsoft.com/v1.0/me/calendar/events?$top=20&$orderby=start/dateTime desc", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (calendarRes.ok) {
      const calData = (await calendarRes.json()) as {
        value: Array<{
          id: string;
          subject: string;
          isOnlineMeeting?: boolean;
          onlineMeeting?: { joinUrl?: string };
          webLink?: string;
        }>;
      };

      for (const event of calData.value ?? []) {
        const joinUrl = event.onlineMeeting?.joinUrl || event.webLink;
        const [newMeeting] = await db
          .insert(atlasLiveMeetingsTable)
          .values({
            workspaceId,
            meetingTitle: event.subject || "Live MS Teams / Outlook Meeting",
            platform: "teams",
            meetingUrl: joinUrl,
            botStatus: "idle",
            botDisplayName: "Deepak's AI Representative (Atlas)",
          })
          .returning();
        syncedMeetings.push(newMeeting);
      }
    }

    if (!meetingsRes.ok && !calendarRes.ok) {
      const errText = await calendarRes.text();
      return { success: false, error: `Microsoft Graph API error: ${errText}` };
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
