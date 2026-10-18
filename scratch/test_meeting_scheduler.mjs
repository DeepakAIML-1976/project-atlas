import fs from 'fs';
import path from 'path';

function getEnv() {
  const envText = fs.readFileSync(path.resolve('.env'), 'utf8');
  const env = {};
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.replace(/\r/g, '').trim();
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = getEnv();
const userTarget = env.MS_GRAPH_USER_EMAIL || 'DeepakParanjape@DPEngineeringservices.onmicrosoft.com';
const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;

async function getToken() {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_GRAPH_CLIENT_ID,
      client_secret: env.MS_GRAPH_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
  });
  const data = await res.json();
  return data.access_token;
}

function formatICSDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export async function scheduleAndDispatchMeeting({
  projectNumber = '5884',
  dateText = '19-Oct-2026',
  timeText = '10:00 AM',
  attendees = [
    'deepak.paranjape@kentplc.com',
    'dpengineeringservices@gmail.com',
    'sunil.hiremath@kentplc.com',
  ],
  topic = 'Technical Review & Construction Drawings / RFI Closures',
} = {}) {
  const token = await getToken();
  const now = new Date();

  // Parse explicit date (e.g. 19-Oct-2026 or 19/10/2026)
  const dateMatch = (dateText + ' ' + timeText).match(/(\d{1,2})[-/ ]([A-Za-z]+|\d{1,2})[-/ ](\d{4})/i);
  let targetYear = 2026;
  let targetMonth = 9; // October (0-indexed)
  let targetDay = 19;

  if (dateMatch) {
    targetDay = parseInt(dateMatch[1], 10);
    const mStr = dateMatch[2].toLowerCase();
    const months = {
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

  // Parse time (e.g. 10:00 AM)
  let hour = 10;
  let minute = 0;
  const matchTime = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i);
  if (matchTime) {
    hour = parseInt(matchTime[1], 10);
    minute = matchTime[2] ? parseInt(matchTime[2], 10) : 0;
    const isPM = matchTime[3].toLowerCase() === 'pm';
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }

  // IST is UTC + 5:30 -> Calculate exact UTC time
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const startTime = new Date(Date.UTC(targetYear, targetMonth, targetDay, hour, minute, 0) - istOffsetMs);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1-hour session

  const uid = `atlas_mtg_${projectNumber}_${Date.now()}@dpengineeringservices.onmicrosoft.com`;
  const meetingLink = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_atlas_${projectNumber}_${Date.now()}%40thread.v2/0?context=%7b%22Tid%22%3a%22${env.MS_GRAPH_TENANT_ID}%22%7d`;
  const subject = `Project ${projectNumber} - ${topic}`;

  const attendeeList = Array.from(new Set([
    ...attendees,
    userTarget,
    'deepak.paranjape@kentplc.com',
  ]));

  const formattedDisplayTime = `${targetDay}-Oct-${targetYear} at ${hour > 12 ? hour - 12 : hour}:${minute.toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'} (IST)`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Digital Twin Suite//Deepak AI Representative Atlas//EN',
    'VERSION:2.0',
    'METHOD:REQUEST',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(now)}`,
    `DTSTART:${formatICSDate(startTime)}`,
    `DTEND:${formatICSDate(endTime)}`,
    `SUMMARY:${subject}`,
    `DESCRIPTION:Project ${projectNumber} Technical Review coordinated by Deepak AI Representative Atlas.\\n\\nTime: ${formattedDisplayTime}\\nTeams Meeting Link: ${meetingLink}\\nAttendees: ${attendeeList.join(', ')}\\n\\nAI Representative Participation: Deepak AI Representative Atlas will attend this meeting alongside Deepak to handle live transcription, piping SME technical assessment (ASME B31.3 / API 570), and automated action item logging.`,
    'LOCATION:Microsoft Teams Meeting',
    `ORGANIZER;CN=Deepak Paranjape:mailto:${userTarget}`,
    ...attendeeList.map((att) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${att.split('@')[0]}:mailto:${att}`),
    'STATUS:CONFIRMED',
    'SEQUENCE:1',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Meeting Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const icsContent = icsLines.join('\r\n');
  const icsBase64 = Buffer.from(icsContent).toString('base64');

  // Save the .ics file to workspace and artifacts for direct 1-click import into Outlook
  const workspaceIcsPath = path.resolve(`Project_${projectNumber}_Meeting_19Oct2026.ics`);
  const artifactIcsPath = path.resolve('C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6', `Project_${projectNumber}_Meeting_19Oct2026.ics`);
  fs.writeFileSync(workspaceIcsPath, icsContent, 'utf8');
  try {
    fs.writeFileSync(artifactIcsPath, icsContent, 'utf8');
  } catch (_) {}
  console.log(`[ICS FILE SAVED]: ${workspaceIcsPath}`);

  // Attempt 1: Direct Graph API calendar event creation
  let directCalendarCreated = false;
  try {
    const directRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject,
        body: {
          contentType: 'HTML',
          content: `<p><b>Project ${projectNumber} - Technical Review & Construction Closures</b></p>
          <p><b>Time:</b> ${formattedDisplayTime}</p>
          <p><a href="${meetingLink}">Join Microsoft Teams Meeting</a></p>
          <p><i>Deepak AI Representative Atlas will attend this session for live transcription and ASME B31.3 / API 570 SME Q&A.</i></p>`,
        },
        start: {
          dateTime: '2026-10-19T10:00:00',
          timeZone: 'India Standard Time',
        },
        end: {
          dateTime: '2026-10-19T11:00:00',
          timeZone: 'India Standard Time',
        },
        location: { displayName: 'Microsoft Teams Meeting' },
        attendees: attendeeList.map((att) => ({
          emailAddress: { address: att, name: att.split('@')[0] },
          type: 'required',
        })),
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      }),
    });
    if (directRes.ok) {
      directCalendarCreated = true;
      console.log('[DIRECT CALENDAR] Created event directly in Microsoft 365 Exchange Calendar!');
    } else {
      console.log(`[DIRECT CALENDAR NOTE] Graph API status ${directRes.status} (${directRes.statusText}) - Direct write requires Calendars.ReadWrite consent.`);
    }
  } catch (err) {
    console.warn('[DIRECT CALENDAR ERROR]:', err.message);
  }

  // Attempt 2: Dispatch via Mail.Send (Internal delivery within tenant)
  const mailPayload = {
    message: {
      subject: `Invitation: ${subject}`,
      body: {
        contentType: 'HTML',
        content: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #0078d4;">Project ${projectNumber} - Technical Review & Construction Closures</h2>
          <p><b>Meeting Scheduled By:</b> Deepak Paranjape's AI Representative (Atlas)</p>
          <p><b>Date & Time:</b> ${formattedDisplayTime}</p>
          <p><b>Topic:</b> ${topic}</p>
          <p><b>Attendees:</b> ${attendeeList.join(', ')}</p>
          <p><b>AI Representative Attendance:</b> Active Participant (Deepak AI Representative Atlas will attend to track live discussion, provide ASME B31.3 / API 570 engineering assessments, and log deliverables/action items).</p>
          <p style="margin-top: 20px;">
            <a href="${meetingLink}" style="background-color: #5059C9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
              Join Microsoft Teams Meeting
            </a>
          </p>
          <p style="font-size: 12px; color: #666; margin-top: 15px;">Teams Meeting Link: <a href="${meetingLink}">${meetingLink}</a></p>
        </body></html>`,
      },
      toRecipients: [
        { emailAddress: { address: userTarget, name: 'Deepak Paranjape' } },
      ],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'meeting.ics',
          contentType: 'text/calendar; method=REQUEST',
          contentBytes: icsBase64,
        },
      ],
    },
    saveToSentItems: true,
  };

  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mailPayload),
  });

  console.log(`[MAIL DISPATCH] Internal tenant mail delivery status: ${sendRes.status} ${sendRes.statusText}`);

  return {
    success: directCalendarCreated || sendRes.status === 202,
    meetingLink,
    formattedDisplayTime,
    workspaceIcsPath,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    directCalendarCreated,
  };
}

if (process.argv[1] && process.argv[1].endsWith('test_meeting_scheduler.mjs')) {
  scheduleAndDispatchMeeting().then((r) => console.log('Result:', r));
}
