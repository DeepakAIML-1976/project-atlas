import fs from 'fs';
import path from 'path';

function getEnv() {
  const envText = fs.readFileSync(path.resolve('.env'), 'utf8');
  const env = {};
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.replace(/\r/g, '').trim();
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = getEnv();
const userTarget = env.MS_GRAPH_USER_EMAIL || 'DeepakParanjape@DPEngineeringservices.onmicrosoft.com';
const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;

const tRes = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    client_secret: env.MS_GRAPH_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  }).toString(),
});
const { access_token } = await tRes.json();

// Build iCalendar .ics format
const now = new Date();
const startTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins from now
const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

function formatICSDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const uid = `atlas_mtg_${Date.now()}@dpengineeringservices.onmicrosoft.com`;
const meetingLink = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_atlas_${Date.now()}%40thread.v2/0?context=%7b%22Tid%22%3a%22${env.MS_GRAPH_TENANT_ID}%22%7d`;

const icsContent = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Digital Twin Suite//Deepak AI Representative Atlas//EN',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  `UID:${uid}`,
  `DTSTAMP:${formatICSDate(now)}`,
  `DTSTART:${formatICSDate(startTime)}`,
  `DTEND:${formatICSDate(endTime)}`,
  'SUMMARY:Project 1024 - Construction Drawings & RFI Discussion',
  `DESCRIPTION:Meeting coordinated by Deepak AI Representative Atlas.\\n\\nTeams Meeting Link: ${meetingLink}`,
  `LOCATION:Microsoft Teams Meeting`,
  `ORGANIZER;CN=Deepak Paranjape:mailto:${userTarget}`,
  `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Deepak Paranjape:mailto:Deepak.Paranjape@kentplc.com`,
  `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Deepak Paranjape:mailto:${userTarget}`,
  'STATUS:CONFIRMED',
  'SEQUENCE:0',
  'BEGIN:VALARM',
  'TRIGGER:-PT15M',
  'ACTION:DISPLAY',
  'DESCRIPTION:Reminder',
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const icsBase64 = Buffer.from(icsContent).toString('base64');

console.log('Sending Calendar Invite Email via Microsoft Graph Mail.Send...');
const mailPayload = {
  message: {
    subject: 'Invitation: Project 1024 - Construction Drawings & RFI Discussion',
    body: {
      contentType: 'HTML',
      content: `<html><body>
        <h3>Project 1024 - Technical Review & Construction Drawings / RFI Closures</h3>
        <p><b>Coordinated by:</b> Deepak AI Representative Atlas</p>
        <p><b>Time:</b> ${startTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} (IST)</p>
        <p><b>Join Microsoft Teams Meeting:</b><br><a href="${meetingLink}">Click here to join the meeting</a></p>
        <hr>
        <p><i>This calendar invitation was automatically generated and synced with your Microsoft 365 schedule.</i></p>
      </body></html>`,
    },
    toRecipients: [
      { emailAddress: { address: 'Deepak.Paranjape@kentplc.com', name: 'Deepak Paranjape' } },
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
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(mailPayload),
});

console.log('SendMail Status:', sendRes.status, sendRes.statusText);
if (sendRes.status === 202) {
  console.log('SUCCESS! Meeting invitation sent directly to your mailbox and calendar!');
} else {
  console.log('Error:', await sendRes.text());
}
