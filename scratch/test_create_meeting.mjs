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
const userGuid = '534a887e-47ef-435c-bbc6-90ac75b9f5b4';

// Get app token
const tRes = await fetch(`https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    client_secret: env.MS_GRAPH_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  }).toString(),
});
const appToken = (await tRes.json()).access_token;

const start = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '');
const end = new Date(Date.now() + 45 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '');

console.log('Testing Calendar Event creation via Microsoft Graph...');
const calRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/calendar/events`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${appToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    subject: 'Project Technical Discussion',
    body: {
      contentType: 'HTML',
      content: 'Discussion coordinated by Deepak AI Representative Atlas.',
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
const data = await calRes.json();
console.log('Calendar Event Result:', data.id ? {
  id: data.id,
  subject: data.subject,
  joinUrl: data.onlineMeeting?.joinUrl || data.webLink,
} : data);
