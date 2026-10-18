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

const chatId = '19:011fa9e3cbd548ee8419c4028c597580@thread.v2';

async function main() {
  const env = getEnv();
  console.log('================================================================');
  console.log('   MICROSOFT TEAMS LIVE CHAT REAL-TIME LISTENER ACTIVE          ');
  console.log('================================================================');
  console.log(`Listening on Real Teams Chat: ${chatId}`);
  console.log('Web URL: https://teams.microsoft.com/l/chat/19%3A011fa9e3cbd548ee8419c4028c597580%40thread.v2/0?tenantId=5af47cf9-2cb5-4b53-a5ec-f7fa67c69552\n');
  console.log('Please type any message or piping question into this chat in your Teams app!');

  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    client_secret: env.MS_GRAPH_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const seenMessageIds = new Set();

  while (true) {
    try {
      const tRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const { access_token } = await tRes.json();

      const mRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages?$top=10`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (mRes.ok) {
        const data = await mRes.json();
        for (const msg of data.value ?? []) {
          const cleanContent = msg.body.content.replace(/<[^>]+>/g, '').trim();
          if (!cleanContent) continue;

          if (!seenMessageIds.has(msg.id)) {
            seenMessageIds.add(msg.id);
            const sender = msg.from?.user?.displayName || 'Deepak Paranjape';

            console.log('\n--------------------------------------------------------------');
            console.log(`🔔 [LIVE TEAMS MESSAGE RECEIVED FROM ${sender.toUpperCase()}]`);
            console.log(`Content: "${cleanContent}"`);
            console.log(`Time: ${msg.createdDateTime}`);
            console.log('Processing through Digital Twin Intelligence & DeepSeek...');

            // Dispatch to internal twin pipeline
            const botRes = await fetch('http://localhost:5000/api/atlas/integrations/teams/chat/message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chatId,
                messageId: msg.id,
                senderName: sender,
                chatType: 'group_chat',
                messageText: cleanContent,
                isMentioned: true,
              }),
            });

            const botResult = await botRes.json();
            console.log('\n[TWIN PRE-DRAFTED RESPONSE]:');
            console.log(botResult.replyText);
            console.log('--------------------------------------------------------------\n');
          }
        }
      }
    } catch (err) {
      console.error('Listener error:', err.message);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main().catch(console.error);
