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

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const { access_token } = await res.json();
  const userGuid = '534a887e-47ef-435c-bbc6-90ac75b9f5b4';

  const chatsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/chats?$expand=members`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  const data = await chatsRes.json();
  console.log('Chats count:', data.value?.length);
  for (const c of data.value ?? []) {
    const members = (c.members || []).map(m => m.displayName || m.email).join(', ');
    console.log(`Chat ID: ${c.id} | Type: ${c.chatType} | Topic: ${c.topic || '(No Topic)'} | Members: ${members}`);
  }
}

main().catch(console.error);
