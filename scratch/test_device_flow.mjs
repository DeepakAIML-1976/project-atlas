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
const params = new URLSearchParams({
  client_id: env.MS_GRAPH_CLIENT_ID,
  scope: 'https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/User.Read offline_access',
});

const res = await fetch(`https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/devicecode`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
});
const data = await res.json();
console.log('Device code response:', data);

if (data.device_code) {
  const tokenParams = new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: data.device_code,
  });
  const pollRes = await fetch(`https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });
  const pollData = await pollRes.json();
  console.log('Poll Response (expect authorization_pending):', pollData);
}
