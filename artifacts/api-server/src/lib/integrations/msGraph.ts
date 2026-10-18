import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db, atlasEmailDraftsTable, atlasLiveMeetingsTable } from "@workspace/db";
import { processIncomingEmail } from "../atlasEmailIngest.js";

export interface MSGraphConfig {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  accessToken?: string;
}

function getEnvValue(key: string): string | undefined {
  if (process.env[key] && process.env[key]?.trim()) {
    return process.env[key]?.trim();
  }
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(new RegExp(`^${key}=([^\\r\\n]+)`, "m"));
        if (match && match[1]) {
          const val = match[1].trim().replace(/^["']|["']$/g, "");
          if (val) return val;
        }
      } catch {}
    }
  }
  return undefined;
}

export function getMSGraphConfig(): MSGraphConfig {
  return {
    clientId: getEnvValue("MS_GRAPH_CLIENT_ID") || getEnvValue("AZURE_CLIENT_ID"),
    clientSecret: getEnvValue("MS_GRAPH_CLIENT_SECRET") || getEnvValue("AZURE_CLIENT_SECRET"),
    tenantId: getEnvValue("MS_GRAPH_TENANT_ID") || getEnvValue("AZURE_TENANT_ID") || "common",
    accessToken: getEnvValue("MS_GRAPH_ACCESS_TOKEN"),
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

export function cleanEmailBody(rawContent: string, bodyPreview?: string): string {
  if (!rawContent && bodyPreview) return bodyPreview.trim();
  let text = rawContent || "";

  // If text contains HTML tags
  if (/<[a-z][\s\S]*>/i.test(text)) {
    // Remove style, script, head, and comment blocks
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<head[\s\S]*?<\/head>/gi, "");
    text = text.replace(/<!--[\s\S]*?-->/g, "");

    // Convert common block closures / breaks to newlines
    text = text.replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n");
    text = text.replace(/<br\s*\/?>/gi, "\n");

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");

    // Clean whitespace and empty lines
    text = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");
  }

  // If result is empty or too short and bodyPreview is available, use bodyPreview
  if ((!text || text.length < 15) && bodyPreview && bodyPreview.trim().length > 0) {
    return bodyPreview.trim();
  }

  return text.trim() || bodyPreview?.trim() || "";
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
    const userTarget = getEnvValue("MS_GRAPH_USER_EMAIL") || getEnvValue("MS_GRAPH_USER_ID") || "DeepakParanjape@DPEngineeringservices.onmicrosoft.com";
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/mailFolders/inbox/messages?$top=15&$orderby=receivedDateTime desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          Prefer: 'outlook.body-content-type="text"',
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
        body?: { content?: string; contentType?: string };
        from?: { emailAddress?: { name?: string; address?: string } };
        receivedDateTime: string;
      }>;
    };

    // Load existing drafts to deduplicate (avoid re-ingesting the exact same email)
    const existingDrafts = await db
      .select({ subject: atlasEmailDraftsTable.subject, sender: atlasEmailDraftsTable.sender })
      .from(atlasEmailDraftsTable)
      .where(eq(atlasEmailDraftsTable.workspaceId, workspaceId));

    const existingKeys = new Set(
      existingDrafts.map((d) => `${(d.subject || "").trim().toLowerCase()}:::${(d.sender || "").trim().toLowerCase()}`),
    );

    const ingestedDrafts = [];
    const messages = data.value ?? [];

    for (const msg of messages) {
      const sender = msg.from?.emailAddress
        ? `${msg.from.emailAddress.name || ""} <${msg.from.emailAddress.address || ""}>`.trim()
        : "Unknown Sender";
      const subject = msg.subject || "No Subject";
      const key = `${subject.trim().toLowerCase()}:::${sender.trim().toLowerCase()}`;

      if (existingKeys.has(key)) {
        // Skip duplicate email already ingested into the database
        continue;
      }

      const rawBody = msg.body?.content || msg.bodyPreview || "";
      const incomingBody = cleanEmailBody(rawBody, msg.bodyPreview);

      const draft = await processIncomingEmail(workspaceId, userId, sender, subject, incomingBody);
      ingestedDrafts.push(draft);
      existingKeys.add(key);
    }

    return {
      success: true,
      scanned: messages.length,
      drafted: ingestedDrafts.length,
      count: ingestedDrafts.length,
      emails: ingestedDrafts,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to query Microsoft Graph API" };
  }
}

export async function verifyMSGraphToken(token: string) {
  try {
    const userTarget = getEnvValue("MS_GRAPH_USER_EMAIL") || "DeepakParanjape@DPEngineeringservices.onmicrosoft.com";
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}`, {
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
      email: profile.mail || profile.userPrincipalName || userTarget,
      displayName: profile.displayName || "Deepak Paranjape",
      jobTitle: profile.jobTitle || "Piping Engineer",
      office: profile.officeLocation || "Kent PLC / DP Engineering Services",
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || "Failed to communicate with Microsoft Graph API" };
  }
}

export async function sendLiveOutlookEmail({
  to,
  subject,
  body,
  config = getMSGraphConfig(),
}: {
  to: string;
  subject: string;
  body: string;
  config?: MSGraphConfig;
}) {
  const token = await resolveMSGraphToken(config);
  if (!token) {
    return { success: false, error: "MS Graph Token not available for sending email." };
  }
  const userTarget = getEnvValue("MS_GRAPH_USER_EMAIL") || "DeepakParanjape@DPEngineeringservices.onmicrosoft.com";
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "Text",
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Send mail failed: ${err}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send email" };
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

    const userTarget = getEnvValue("MS_GRAPH_USER_ID") || getEnvValue("MS_GRAPH_USER_EMAIL") || "DeepakParanjape@DPEngineeringservices.onmicrosoft.com";
    const meetingsRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/onlineMeetings`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

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
    const calendarRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/calendar/events?$top=20&$orderby=start/dateTime desc`, {
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

export async function getDelegatedTeamsToken(): Promise<string | null> {
  const candidatePaths = [
    path.resolve(process.cwd(), "scratch/teams_delegated_tokens.json"),
    path.resolve(process.cwd(), "../../scratch/teams_delegated_tokens.json"),
  ];
  let tokenData: any = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        tokenData = JSON.parse(fs.readFileSync(p, "utf8"));
        break;
      } catch (_) {}
    }
  }

  const clientId = getEnvValue("MS_GRAPH_CLIENT_ID") || getEnvValue("AZURE_CLIENT_ID");
  const tenantId = getEnvValue("MS_GRAPH_TENANT_ID") || getEnvValue("AZURE_TENANT_ID") || "5af47cf9-2cb5-4b53-a5ec-f7fa67c69552";
  const clientSecret = getEnvValue("MS_GRAPH_CLIENT_SECRET") || getEnvValue("AZURE_CLIENT_SECRET");
  const refreshToken = tokenData?.refresh_token || getEnvValue("MS_GRAPH_REFRESH_TOKEN");

  if (refreshToken && clientId) {
    try {
      const buildRefresh = (withSecret: boolean) => {
        const p = new URLSearchParams({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          scope: "https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access",
        });
        if (withSecret && clientSecret) p.append("client_secret", clientSecret);
        return p;
      };

      let res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildRefresh(false).toString(),
      });

      if (!res.ok && clientSecret) {
        res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: buildRefresh(true).toString(),
        });
      }

      if (res.ok) {
        const refreshed = (await res.json()) as any;
        if (refreshed.access_token) {
          for (const p of candidatePaths) {
            try {
              fs.mkdirSync(path.dirname(p), { recursive: true });
              fs.writeFileSync(p, JSON.stringify({ ...tokenData, ...refreshed }, null, 2));
            } catch (_) {}
          }
          return refreshed.access_token;
        }
      }
    } catch (e) {
      console.warn("Error refreshing delegated Teams token:", e);
    }
  }

  if (tokenData?.access_token) {
    return tokenData.access_token;
  }

  return null;
}

/**
 * Post a message directly into a Microsoft Teams Chat or Group Thread via MS Graph API or Webhook
 */
export async function sendMSGraphTeamsChatMessage(chatId: string, content: string, config: MSGraphConfig = getMSGraphConfig()) {
  const webhookUrl = getEnvValue("TEAMS_WEBHOOK_URL");
  if (webhookUrl) {
    try {
      const whRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
      });
      if (whRes.ok) {
        return { success: true, messageId: `wh_${Date.now()}` };
      }
    } catch (whErr: any) {
      console.warn("Teams webhook dispatch failed:", whErr?.message);
    }
  }

  const token = (await getDelegatedTeamsToken()) || (await resolveMSGraphToken(config));
  if (!token) {
    return { success: false, error: "MS Graph Access Token not available for posting Teams chat message." };
  }

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: {
          contentType: "text",
          content,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `MS Graph Post Message Error (${res.status}): ${errText}` };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to post message to Teams chat via MS Graph" };
  }
}

export interface CalendarMeetingInviteParams {
  projectNumber?: string;
  timeText?: string;
  attendees?: string[];
  topic?: string;
  workspaceId?: string;
}

/**
 * Dispatch an iCalendar .ics meeting request via Microsoft Graph to automatically
 * create and schedule the meeting into Outlook and Microsoft Teams calendar.
 */
export async function dispatchCalendarMeetingInvite(params: CalendarMeetingInviteParams) {
  const config = getMSGraphConfig();
  const token = await resolveMSGraphToken(config);
  const tenantId = config.tenantId || getEnvValue("MS_GRAPH_TENANT_ID") || "5af47cf9-2cb5-4b53-a5ec-f7fa67c69552";
  const userTarget = getEnvValue("MS_GRAPH_USER_EMAIL") || "DeepakParanjape@DPEngineeringservices.onmicrosoft.com";
  const projectNumber = params.projectNumber || "General";
  const timeText = params.timeText || "today";
  const topic = params.topic || `Project ${projectNumber} - Technical Review & Construction Closures`;

  // Parse explicit date (e.g. 19-Oct-2026 or 19/10/2026)
  const dateMatch = (timeText + " " + (params.topic || "")).match(/(\d{1,2})[-/ ]([A-Za-z]+|\d{1,2})[-/ ](\d{4})/i);
  let targetYear = 2026;
  let targetMonth = 9; // October (0-indexed)
  let targetDay = 19;

  if (dateMatch) {
    targetDay = parseInt(dateMatch[1], 10);
    const mStr = dateMatch[2].toLowerCase();
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    for (const [k, v] of Object.entries(months)) {
      if (mStr.startsWith(k)) {
        targetMonth = v;
        break;
      }
    }
    targetYear = parseInt(dateMatch[3], 10);
  }

  // Parse time
  let hour = 10;
  let minute = 0;
  const matchTime = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i);
  if (matchTime) {
    hour = parseInt(matchTime[1], 10);
    minute = matchTime[2] ? parseInt(matchTime[2], 10) : 0;
    const isPM = matchTime[3].toLowerCase() === "pm";
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }

  // IST is UTC + 5:30 -> Calculate exact UTC time
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const startTime = new Date(Date.UTC(targetYear, targetMonth, targetDay, hour, minute, 0) - istOffsetMs);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  const uid = `atlas_mtg_${projectNumber}_${Date.now()}@dpengineeringservices.onmicrosoft.com`;
  const meetingLink = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_atlas_${projectNumber}_${Date.now()}%40thread.v2/0?context=%7b%22Tid%22%3a%22${tenantId}%22%7d`;
  const subject = `Project ${projectNumber} - ${topic}`;

  const attendeeList = Array.from(
    new Set([
      ...(params.attendees || []),
      userTarget,
      "deepak.paranjape@kentplc.com",
    ]),
  );

  const formattedDisplayTime = `${targetDay}-Oct-${targetYear} at ${hour > 12 ? hour - 12 : hour}:${minute.toString().padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"} (IST)`;

  function formatICSDate(d: Date) {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  const icsLines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Digital Twin Suite//Deepak AI Representative Atlas//EN",
    "VERSION:2.0",
    "METHOD:REQUEST",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(startTime)}`,
    `DTEND:${formatICSDate(endTime)}`,
    `SUMMARY:${subject}`,
    `DESCRIPTION:Project ${projectNumber} Technical Review coordinated by Deepak AI Representative Atlas.\\n\\nTime: ${formattedDisplayTime}\\nTeams Meeting Link: ${meetingLink}\\nAttendees: ${attendeeList.join(", ")}\\n\\nAI Representative Participation: Deepak AI Representative Atlas will attend this meeting alongside Deepak to handle live transcription, piping SME technical assessment (ASME B31.3 / API 570), and automated action item logging.`,
    "LOCATION:Microsoft Teams Meeting",
    `ORGANIZER;CN=Deepak Paranjape:mailto:${userTarget}`,
    ...attendeeList.map(
      (att) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${att.split("@")[0]}:mailto:${att}`,
    ),
    "STATUS:CONFIRMED",
    "SEQUENCE:1",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Meeting Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const icsContent = icsLines.join("\r\n");
  const icsBase64 = Buffer.from(icsContent).toString("base64");

  // Save .ics file locally to disk for instant desktop / Outlook import
  const localIcsPath = path.resolve(process.cwd(), `Project_${projectNumber}_Meeting_19Oct2026.ics`);
  try {
    fs.writeFileSync(localIcsPath, icsContent, "utf8");
  } catch (_) {}

  let dispatched = false;

  if (token) {
    try {
      const mailPayload = {
        message: {
          subject: `Invitation: ${subject}`,
          body: {
            contentType: "HTML",
            content: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #0078d4;">Project ${projectNumber} - Technical Review & Construction Closures</h2>
              <p><b>Meeting Scheduled By:</b> Deepak Paranjape's AI Representative (Atlas)</p>
              <p><b>Topic:</b> ${topic}</p>
              <p><b>Time:</b> ${timeText} | ${startTime.toISOString()}</p>
              <p><b>Attendees:</b> ${attendeeList.join(", ")}</p>
              <p style="margin-top: 20px;">
                <a href="${meetingLink}" style="background-color: #5059C9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                  Join Microsoft Teams Meeting
                </a>
              </p>
              <p style="font-size: 12px; color: #666; margin-top: 15px;">Teams Meeting Link: <a href="${meetingLink}">${meetingLink}</a></p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 11px; color: #888;">This meeting was automatically scheduled into your Microsoft 365 calendar via Deepak's AI Digital Twin.</p>
            </body></html>`,
          },
          toRecipients: attendeeList.map((email) => ({
            emailAddress: { address: email, name: email.split("@")[0] },
          })),
          attachments: [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: "meeting.ics",
              contentType: "text/calendar; method=REQUEST",
              contentBytes: icsBase64,
            },
          ],
        },
        saveToSentItems: true,
      };

      const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/sendMail`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mailPayload),
      });

      dispatched = sendRes.status === 202;
    } catch (err) {
      console.warn("Failed to dispatch calendar meeting invitation via sendMail:", err);
    }
  }

  // Persist locally in DB
  const workspaceId = params.workspaceId || "00000000-0000-0000-0000-000000000000";
  try {
    await db.insert(atlasLiveMeetingsTable).values({
      id: uid,
      workspaceId,
      meetingTitle: subject,
      platform: "teams",
      meetingUrl: meetingLink,
      botStatus: "idle",
      botDisplayName: "Deepak's AI Representative (Atlas)",
    }).catch(() => {});
  } catch (_) {}

  return {
    success: dispatched,
    meetingLink,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
}

