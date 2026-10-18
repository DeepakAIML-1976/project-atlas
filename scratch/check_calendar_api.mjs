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

async function testCalendar() {
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_GRAPH_CLIENT_ID,
      client_secret: env.MS_GRAPH_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
  });
  const { access_token } = await tokenRes.json();
  
  console.log('1. Testing GET /users/' + userTarget + '/calendars');
  const calRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/calendars`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  console.log('GET calendars status:', calRes.status);
  const calData = await calRes.json();
  console.log('Calendars:', JSON.stringify(calData, null, 2));

  console.log('2. Testing GET /users/' + userTarget + '/calendar/events');
  const eventsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/calendar/events?$top=5`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  console.log('GET events status:', eventsRes.status);
  const eventsData = await eventsRes.json();
  console.log('Events:', JSON.stringify(eventsData, null, 2));

  // Try creating an event directly on the calendar!
  console.log('3. Testing POST /users/' + userTarget + '/events');
  const newEventRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: 'Test Calendar Direct Insertion',
      start: {
        dateTime: '2026-10-19T10:00:00',
        timeZone: 'India Standard Time',
      },
      end: {
        dateTime: '2026-10-19T11:00:00',
        timeZone: 'India Standard Time',
      },
    }),
  });
  console.log('POST events status:', newEventRes.status);
  const newEventData = await newEventRes.json();
  console.log('POST event result:', JSON.stringify(newEventData, null, 2));
}

testCalendar().catch(console.error);
