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
const tenantId = env.MS_GRAPH_TENANT_ID;
const clientId = env.MS_GRAPH_CLIENT_ID;
const clientSecret = env.MS_GRAPH_CLIENT_SECRET;
const refreshToken = env.MS_GRAPH_REFRESH_TOKEN;

console.log('Client ID:', clientId);
console.log('Tenant ID:', tenantId);
console.log('Testing refresh token length:', refreshToken?.length);

const refreshParams = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: 'refresh_token',
  refresh_token: refreshToken,
  scope: 'https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access',
});

const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: refreshParams.toString(),
});

const data = await res.json();
console.log('HTTP Status:', res.status);
if (data.access_token) {
  console.log('Success! access_token received. Length:', data.access_token.length);
} else {
  console.log('Error Response:', data);
}
