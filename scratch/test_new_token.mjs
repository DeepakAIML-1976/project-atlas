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

console.log('Testing refresh token with client_secret...');

const params = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: 'refresh_token',
  refresh_token: refreshToken,
  scope: 'https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access',
});

const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
});

const data = await res.json();
console.log('Token Refresh HTTP Status:', res.status);
if (data.access_token) {
  console.log('>>> SUCCESS! Delegated Access Token acquired! Length:', data.access_token.length);

  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${data.access_token}` }
  });
  console.log('Graph /me HTTP Status:', meRes.status);
  const meData = await meRes.json();
  console.log('Graph User:', meData.displayName, '| Email:', meData.userPrincipalName || meData.mail);

  // Update scratch/teams_delegated_tokens.json
  fs.writeFileSync('scratch/teams_delegated_tokens.json', JSON.stringify(data, null, 2));
  if (data.refresh_token) {
    let curEnv = fs.readFileSync('.env', 'utf8');
    curEnv = curEnv.replace(/MS_GRAPH_REFRESH_TOKEN=.*/, `MS_GRAPH_REFRESH_TOKEN=${data.refresh_token}`);
    fs.writeFileSync('.env', curEnv, 'utf8');
  }
  console.log('Updated scratch/teams_delegated_tokens.json and .env successfully!');
} else {
  console.log('Token Refresh Error:', data);
}
