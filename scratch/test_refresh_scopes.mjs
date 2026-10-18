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
const tokens = JSON.parse(fs.readFileSync('scratch/teams_delegated_tokens.json', 'utf8'));

const refreshParams = new URLSearchParams({
  client_id: env.MS_GRAPH_CLIENT_ID,
  grant_type: 'refresh_token',
  refresh_token: tokens.refresh_token,
  scope: 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/OnlineMeetings.ReadWrite https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access',
});

const res = await fetch(`https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: refreshParams.toString(),
});

const data = await res.json();
console.log('Refresh with Calendars Status:', res.status);
console.log('Granted scopes:', data.scope || data.error_description || data.error);
if (data.access_token) {
  fs.writeFileSync('scratch/teams_delegated_tokens.json', JSON.stringify({ ...tokens, ...data }, null, 2));

  // Now test creating a calendar event with online meeting!
  const start = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  const end = new Date(Date.now() + 45 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '');

  const calRes = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: 'Project Technical Discussion',
      body: {
        contentType: 'HTML',
        content: 'Meeting coordinated by Deepak AI Representative Atlas.',
      },
      start: {
        dateTime: start,
        timeZone: 'UTC',
      },
      end: {
        dateTime: end,
        timeZone: 'UTC',
      },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    }),
  });

  console.log('Calendar Event Status:', calRes.status);
  const eventData = await calRes.json();
  console.log('Calendar Event Result:', eventData.id ? {
    id: eventData.id,
    subject: eventData.subject,
    joinUrl: eventData.onlineMeeting?.joinUrl || eventData.webLink,
  } : eventData);
}
