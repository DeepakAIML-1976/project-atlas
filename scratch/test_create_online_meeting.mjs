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
const userGuid = '534a887e-47ef-435c-bbc6-90ac75b9f5b4';

async function testOnlineMeeting() {
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
  
  console.log('Testing POST /users/' + userGuid + '/onlineMeetings with App Token...');
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/onlineMeetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDateTime: '2026-10-19T04:30:00Z',
      endDateTime: '2026-10-19T05:30:00Z',
      subject: 'Project 5884 - Technical Review & Construction Closures',
    }),
  });
  console.log('Status:', res.status, res.statusText);
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));

  // Also test with Delegated Token!
  const tokenFilePath = path.resolve('scratch/teams_delegated_tokens.json');
  if (fs.existsSync(tokenFilePath)) {
    const delData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));
    console.log('\nTesting POST /me/onlineMeetings with Delegated Token...');
    const delRes = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${delData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDateTime: '2026-10-19T04:30:00Z',
        endDateTime: '2026-10-19T05:30:00Z',
        subject: 'Project 5884 - Technical Review & Construction Closures',
      }),
    });
    console.log('Delegated Status:', delRes.status, delRes.statusText);
    const delResult = await delRes.json();
    console.log('Delegated Response:', JSON.stringify(delResult, null, 2));
  }
}
testOnlineMeeting().catch(console.error);
