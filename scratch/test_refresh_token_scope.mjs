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
const tokenFilePath = path.resolve('scratch/teams_delegated_tokens.json');
const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));

async function testScope() {
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const refreshParams = new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokenData.refresh_token,
    scope: 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: refreshParams.toString(),
  });

  console.log('Refresh with Calendars.ReadWrite status:', res.status);
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

testScope().catch(console.error);
