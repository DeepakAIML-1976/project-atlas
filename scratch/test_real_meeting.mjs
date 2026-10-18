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

async function main() {
  const env = getEnv();
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    client_secret: env.MS_GRAPH_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const tRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const { access_token } = await tRes.json();
  const userGuid = '534a887e-47ef-435c-bbc6-90ac75b9f5b4';

  console.log('Attempting to create a REAL Microsoft Teams Online Meeting via Graph API...');
  const mRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/onlineMeetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDateTime: new Date(Date.now() + 60000).toISOString(),
      endDateTime: new Date(Date.now() + 3600000).toISOString(),
      subject: 'Digital Twin Live Piping Consultation (ASME B31.3 / API 570)',
    }),
  });

  const mData = await mRes.json();
  console.log('HTTP Status:', mRes.status);
  console.log('Result:', JSON.stringify(mData, null, 2));

  if (mRes.ok) {
    console.log('\n=============================================');
    console.log('SUCCESS! Real Microsoft Teams Meeting Created:');
    console.log('Join Web URL:', mData.joinWebUrl);
    console.log('Audio Conferencing / Meeting ID:', mData.id);
    console.log('=============================================');
  }
}

main().catch(console.error);
