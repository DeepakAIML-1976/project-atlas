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
const data = await res.json();
const token = data.access_token;
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
console.log('Roles granted in new token:', payload.roles);

// Let's test posting to the 1-on-1 chat
const chatId = '19:uni01_pesp5dvfbg5rtt5opj2fypaoucdpnegaq5ybobklo2sshkmro3xq@thread.v2';
const postRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    body: {
      contentType: 'text',
      content: 'i am an AI representative and not authorised to reply personal messsages.',
    },
  }),
});

console.log('Post Status:', postRes.status, postRes.statusText);
const body = await postRes.text();
console.log('Post Response Body:', body);
