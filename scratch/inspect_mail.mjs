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

async function checkMail() {
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
  
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/mailFolders/sentItems/messages?$top=5`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const data = await res.json();
  console.log('Sent messages count:', data.value?.length);
  for (const m of data.value ?? []) {
    console.log('Subject:', m.subject, 'To:', m.toRecipients?.map(r => r.emailAddress.address), 'hasAttachments:', m.hasAttachments);
  }

  const inRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/mailFolders/inbox/messages?$top=5`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const inData = await inRes.json();
  console.log('\nInbox messages count:', inData.value?.length);
  for (const m of inData.value ?? []) {
    console.log('Subject:', m.subject, 'From:', m.from?.emailAddress?.address);
  }
}
checkMail();
