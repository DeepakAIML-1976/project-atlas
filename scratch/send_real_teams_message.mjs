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
  const userGuid = '534a887e-47ef-435c-bbc6-90ac75b9f5b4';

  console.log('User GUID:', userGuid);

  // 1. Let's see if there are other users in tenant to chat with or create a chat
  const usersRes = await fetch('https://graph.microsoft.com/v1.0/users', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const usersData = await usersRes.json();
  console.log('All Users in Tenant:', usersData.value?.map(u => ({ id: u.id, upn: u.userPrincipalName, name: u.displayName })));

  // 2. Try creating a chat with Deepak as a member
  // In Teams Graph API, a group chat or 1-on-1 chat requires members
  console.log('\nAttempting to create a live Teams chat...');
  const chatPayload = {
    chatType: "group",
    topic: "Digital Twin Suite - Engineering AI Representative",
    members: [
      {
        "@odata.type": "#microsoft.graph.aadUserConversationMember",
        roles: ["owner"],
        "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${userGuid}')`,
      },
    ],
  };

  const createChatRes = await fetch("https://graph.microsoft.com/v1.0/chats", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chatPayload),
  });

  const chatResult = await createChatRes.json();
  console.log("Create Chat HTTP Status:", createChatRes.status);
  console.log("Create Chat Result:", JSON.stringify(chatResult, null, 2));

  if (createChatRes.ok && chatResult.id) {
    const chatId = chatResult.id;
    console.log(`\nChat created! ID: ${chatId}`);

    // Now POST a real message into this Teams chat!
    console.log("Posting real message into Microsoft Teams chat...");
    const msgPayload = {
      body: {
        contentType: "html",
        content: `<b>Hello Deepak!</b><br><br>This is your live <b>AI Digital Twin Representative (Atlas)</b> connected directly to your Microsoft Teams workspace via Microsoft Graph.<br><br>All piping heuristics (ASME B31.3 / API 570) and DeepSeek intelligence are now active and synchronized machine-to-machine.`,
      },
    };

    const sendMsgRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(msgPayload),
    });

    const msgResult = await sendMsgRes.json();
    console.log("Send Message HTTP Status:", sendMsgRes.status);
    console.log("Send Message Result:", JSON.stringify(msgResult, null, 2));
  }
}

main().catch(console.error);
