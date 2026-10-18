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
  const chatId = '19:uni01_pesp5dvfbg5rtt5opj2fypaoucdpnegaq5ybobklo2sshkmro3xq@thread.v2';

  console.log(`Querying messages in real Teams chat: ${chatId}`);
  const mRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  console.log('HTTP Status:', mRes.status);
  const data = await mRes.json();
  console.log('Messages count:', data.value?.length);
  if (data.value && data.value.length > 0) {
    for (const msg of data.value) {
      console.log('--- Message ---');
      console.log('ID:', msg.id);
      console.log('From:', msg.from?.user?.displayName || msg.from?.application?.displayName || 'System');
      console.log('Content:', msg.body?.content);
      console.log('Created:', msg.createdDateTime);
    }
  } else {
    console.log('Chat is currently empty (awaiting messages).');
  }
}

main().catch(console.error);
