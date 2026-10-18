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

async function checkBounce() {
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
  
  const inRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/mailFolders/inbox/messages?$top=1`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const inData = await inRes.json();
  console.log('Subject:', inData.value[0]?.subject);
  console.log('Body:', inData.value[0]?.body?.content?.slice(0, 1500));
}
checkBounce();
