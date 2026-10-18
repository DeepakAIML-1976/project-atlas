import fs from 'fs';
import path from 'path';
import { scheduleAndDispatchMeeting } from './test_meeting_scheduler.mjs';

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
const userGuid = '534a887e-47ef-435c-bbc6-90ac75b9f5b4';
const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
const params = new URLSearchParams({
  client_id: env.MS_GRAPH_CLIENT_ID,
  client_secret: env.MS_GRAPH_CLIENT_SECRET,
  grant_type: 'client_credentials',
  scope: 'https://graph.microsoft.com/.default',
});

let tokenCache = null;
let tokenExpires = 0;

async function getAppToken() {
  if (tokenCache && Date.now() < tokenExpires) return tokenCache;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  tokenCache = data.access_token;
  tokenExpires = Date.now() + (data.expires_in - 60) * 1000;
  return tokenCache;
}

async function getDelegatedToken() {
  const tokenFilePath = path.resolve('scratch/teams_delegated_tokens.json');
  let tokenData = null;
  if (fs.existsSync(tokenFilePath)) {
    try {
      tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));
    } catch (_) {}
  }

  const refreshToken = tokenData?.refresh_token || env.MS_GRAPH_REFRESH_TOKEN;
  if (refreshToken) {
    try {
      const refreshParams = new URLSearchParams({
        client_id: env.MS_GRAPH_CLIENT_ID,
        client_secret: env.MS_GRAPH_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access',
      });

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      if (res.ok) {
        const refreshed = await res.json();
        if (refreshed.access_token) {
          fs.writeFileSync(tokenFilePath, JSON.stringify({ ...tokenData, ...refreshed }, null, 2));
          return refreshed.access_token;
        }
      }
    } catch (e) {
      console.warn('Error refreshing delegated Teams token:', e);
    }
  }

  return tokenData?.access_token || null;
}

// Track seen messages so we never repeat
const seenChatMsgIds = new Set(['1792254760472', '1792250830731', '1792250829586', '1792248891699', '1792248891641']);
const seenMailIds = new Set();

async function pollTeamsChats() {
  const token = await getAppToken();
  const chatsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/chats`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!chatsRes.ok) return;
  const chatsData = await chatsRes.json();

  for (const chat of chatsData.value ?? []) {
    const msgsRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages?$top=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!msgsRes.ok) continue;
    const msgsData = await msgsRes.json();

    for (const msg of msgsData.value ?? []) {
      if (msg.messageType === 'systemEventMessage' || !msg.body?.content) continue;
      if (seenChatMsgIds.has(msg.id)) continue;
      seenChatMsgIds.add(msg.id);

      // Ignore messages sent by Deepak's own AI Representative to prevent loops
      if (msg.body.content.includes("Deepak's AI Representative") ||
          msg.body.content.includes("Deepak AI Representative") || 
          msg.body.content.includes("i am an AI representative and not authorised") ||
          msg.body.content.includes("my twin is currently offline")) {
        continue;
      }

      const sender = msg.from?.user?.displayName || 'User';
      const cleanText = msg.body.content.replace(/<[^>]+>/g, '').trim();
      if (!cleanText) continue;

      console.log('\n=============================================================');
      console.log(`[REAL TEAMS MESSAGE DETECTED] Chat ID: ${chat.id}`);
      console.log(`From: ${sender}`);
      console.log(`Text: "${cleanText}"`);
      console.log('Classifying and generating AI Digital Twin response...');

      // Extract conversation thread history for multi-turn context
      const threadHistory = (msgsData.value ?? [])
        .filter((m) => m.id !== msg.id && m.body?.content)
        .reverse()
        .map((m) => ({
          sender: m.from?.user?.displayName || 'User',
          text: m.body.content.replace(/<[^>]+>/g, '').trim(),
        }));

      // Call API server chat message endpoint
      let replyText = '';
      let alreadyPosted = false;
      try {
        const botRes = await fetch('http://localhost:5000/api/atlas/integrations/teams/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: chat.id,
            messageId: msg.id,
            senderName: sender,
            senderEmail: msg.from?.user?.email || 'deepak.paranjape@kentplc.com',
            chatType: chat.chatType === 'oneOnOne' ? 'personal_dm' : 'group_chat',
            messageText: cleanText,
            isMentioned: true,
            threadHistory,
          }),
        });

        const result = await botRes.json();
        replyText = result.replyText;
        alreadyPosted = Boolean(result.postedToTeams);

        if (result.alertId) {
          console.log(`[ACTION QUEUE]: Technical draft staged in Authorization Queue (Draft ID: ${result.alertId})`);
        }

        if (!result.shouldReply) {
          console.log('[AUTHORIZATION POLICY]: Technical draft staged for Owner Approval. Zero unauthorized dispatches.');
        } else if (replyText && !alreadyPosted) {
          console.log('\nDispatching courtesy/policy reply directly to Microsoft Teams...');
          const webhookUrl = env.TEAMS_WEBHOOK_URL;
          let dispatched = false;

          if (webhookUrl) {
            try {
              const whRes = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: replyText }),
              });
              if (whRes.ok) {
                dispatched = true;
                console.log(`[DELIVERY SUCCESS] Posted to Microsoft Teams via Webhook!`);
              }
            } catch (errWh) {
              console.warn('[DELIVERY WARNING] Webhook post failed:', errWh.message);
            }
          }

          if (!dispatched) {
            const userToken = await getDelegatedToken();
            if (userToken) {
              const postRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${userToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  body: {
                    contentType: 'text',
                    content: replyText,
                  },
                }),
              });

              if (postRes.ok) {
                const sentMsg = await postRes.json();
                seenChatMsgIds.add(sentMsg.id);
                console.log(`[DELIVERY SUCCESS] Posted to Microsoft Teams! HTTP ${postRes.status} | Msg ID: ${sentMsg.id}`);
              } else {
                const errText = await postRes.text();
                console.error(`[DELIVERY NOTICE] Teams Graph Token expired or requires refresh (${postRes.status}).`);
                console.log(`>>> To refresh token in 1 click, visit: http://localhost:5000/api/atlas/auth/m365/login`);
                console.log(`>>> Or configure TEAMS_WEBHOOK_URL in .env for permanent non-expiring posting.`);
              }
            } else {
              console.log(`[DELIVERY NOTICE] No active delegated token. Visit http://localhost:5000/api/atlas/auth/m365/login to authenticate.`);
            }
          }
        }
      } catch (e) {
        console.warn('API server call fallback:', e.message);
      }

      // If meeting coordination or scheduling is detected/confirmed, dispatch the calendar invitation
      const lowerReply = (replyText || "").toLowerCase();
      const lowerClean = cleanText.toLowerCase();
      const isMeetingConfirmedOrScheduled =
        lowerReply.includes("meeting confirmed") ||
        lowerReply.includes("calendar invite") ||
        lowerReply.includes("meeting coordination confirmed") ||
        (lowerClean.includes("schedule") && (lowerClean.includes("pm") || lowerClean.includes("am")));

      if (isMeetingConfirmedOrScheduled) {
        try {
          const projMatch = cleanText.match(/\b(\d{4,5})\b/) || threadHistory.map(h => h.text).join(' ').match(/\b(\d{4,5})\b/) || [null, '5884'];
          const timeMatch = cleanText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/i) || threadHistory.map(h => h.text).join(' ').match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/i) || [null, '10:45 PM'];
          const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i) || [null, 'deepak.paranjape@kentplc.com'];
          console.log(`\n[CALENDAR DISPATCH] Ensuring calendar meeting is placed on Outlook & Teams for Project ${projMatch[1]} at ${timeMatch[1]}...`);
          const calResult = await scheduleAndDispatchMeeting({
            projectNumber: projMatch[1] || '5884',
            timeText: timeMatch[1] || '10:45 PM',
            attendees: [emailMatch[0] || 'deepak.paranjape@kentplc.com'],
          });
          console.log(`[CALENDAR DISPATCH RESULT]: Success = ${calResult.success} | Meeting link = ${calResult.meetingLink}`);
        } catch (e) {
          console.warn('[CALENDAR DISPATCH ERROR]:', e.message);
        }
      }

      console.log('=============================================================\n');
    }
  }
}

async function getPreferences() {
  try {
    const res = await fetch('http://localhost:5000/api/atlas/preferences/rules', {
      headers: { 'X-Owner-Email': 'deepak.paranjape@kentplc.com' },
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return {
    ingestionKeywords: ['Alky Reactor', 'Alky Flare', '5884', '5333'],
    allowedSenderEmails: [],
    offlineCourtesyMessage: "I am Deepak's AI Representative, my twin is currently offline, I will make sure your message is replied once he is online.",
    ownerIsOnline: false,
    signature: "Deepak's AI Representative",
  };
}

async function sendMail(to, subject, content) {
  const token = await getAppToken();
  const userTarget = env.MS_GRAPH_USER_EMAIL || 'DeepakParanjape@DPEngineeringservices.onmicrosoft.com';
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: 'true',
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('sendMail error:', e.message);
    return false;
  }
}

async function pollEmails() {
  const token = await getAppToken();
  const userTarget = env.MS_GRAPH_USER_EMAIL || 'DeepakParanjape@DPEngineeringservices.onmicrosoft.com';
  const mailRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userTarget)}/mailFolders/inbox/messages?$top=5&$orderby=receivedDateTime desc`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    }
  );

  if (!mailRes.ok) return;
  const mailData = await mailRes.json();
  const prefs = await getPreferences();
  const keywords = (prefs.ingestionKeywords && prefs.ingestionKeywords.length > 0)
    ? prefs.ingestionKeywords
    : ['Alky Reactor', 'Alky Flare', '5884', '5333'];

  for (const msg of mailData.value ?? []) {
    if (seenMailIds.has(msg.id)) continue;
    seenMailIds.add(msg.id);

    const sender = msg.from?.emailAddress
      ? `${msg.from.emailAddress.name || ''} <${msg.from.emailAddress.address || ''}>`.trim()
      : 'Unknown';
    const subject = msg.subject || 'No Subject';
    const body = msg.body?.content || msg.bodyPreview || '';

    if (sender.includes('microsoft.com') || sender.includes('notifications.microsoft.com')) continue;

    console.log('\n=============================================================');
    console.log(`[INCOMING LIVE EMAIL DETECTED] From: ${sender}`);
    console.log(`Subject: "${subject}"`);
    console.log(`Body: "${body.slice(0, 150)}..."`);

    const isPersonal =
      body.toLowerCase().includes('coffee') ||
      body.toLowerCase().includes('personal') ||
      body.toLowerCase().includes('lunch') ||
      body.toLowerCase().includes('weekend') ||
      body.toLowerCase().includes('how are you');

    const combinedContent = (subject + ' ' + body).toLowerCase();
    const senderLower = sender.toLowerCase();
    const matchesKeyword = keywords.some(k => combinedContent.includes(k.toLowerCase()));
    const matchesSender = (prefs.allowedSenderEmails || []).some(s => senderLower.includes(s.toLowerCase()));

    if (!matchesKeyword && !matchesSender && !isPersonal) {
      console.log(`[EMAIL SKIPPED]: Subject "${subject}" does not match active ingestion keywords [${keywords.join(', ')}]. Cutting down unwanted emails.`);
      continue;
    }

    if (isPersonal) {
      console.log('\n[RULE APPLIED]: Personal message detected.');
      console.log('Drafting exact automated reply: "i am an AI representative and not authorised to reply personal messsages."');
      const senderAddress = msg.from?.emailAddress?.address;
      if (senderAddress) {
        await sendMail(senderAddress, `Re: ${subject}`, 'i am an AI representative and not authorised to reply personal messsages.');
        console.log('[DELIVERY SUCCESS]: Policy refusal sent via Microsoft Graph.');
      }
    } else {
      console.log(`[KEYWORD MATCH]: Email matches active ingestion criteria. Ingesting into Digital Twin Suite...`);
      const ingestRes = await fetch('http://localhost:5000/api/atlas/email-drafts/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Owner-Email': 'deepak.paranjape@kentplc.com',
        },
        body: JSON.stringify({
          sender,
          subject,
          incomingBody: body,
        }),
      });
      const draft = await ingestRes.json();
      console.log(`[DRAFT CREATED]: Draft ID ${draft.id} staged in Executive Authorization Queue (Status: ${draft.status}, LLM Fallback: ${draft.isLLMFallback})`);

      if (!prefs.ownerIsOnline) {
        console.log(`[OFFLINE DETECTED]: Owner is currently offline. Dispatching immediate courtesy notice...`);
        const senderAddress = msg.from?.emailAddress?.address;
        if (senderAddress) {
          const courtesyText = prefs.offlineCourtesyMessage || "I am Deepak's AI Representative, my twin is currently offline, I will make sure your message is replied once he is online.";
          await sendMail(senderAddress, `Re: ${subject}`, courtesyText);
          console.log(`[DELIVERY SUCCESS]: Courtesy reply sent to ${senderAddress}. Technical draft held awaiting Owner approval.`);
        }
      } else {
        console.log(`[ONLINE DETECTED]: Owner is online. Technical draft staged in Executive Authorization Queue. Awaiting owner review before dispatch.`);
      }
    }
    console.log('=============================================================\n');
  }
}

async function startLoop() {
  console.log('================================================================');
  console.log('   DEEPAK PARANJAPE DIGITAL TWIN: LIVE TEAMS & EMAIL RESPONDER  ');
  console.log('================================================================');
  console.log(`Target Mailbox & Teams Account: ${env.MS_GRAPH_USER_EMAIL || 'DeepakParanjape@DPEngineeringservices.onmicrosoft.com'}`);
  console.log('Rule 1: Technical & Project Queries -> Reply with ASME B31.3 SME Assessment.');
  console.log('Rule 2: Personal Queries -> Reply "i am an AI representative and not authorised to reply personal messsages."');
  console.log('Mode: Machine-to-Machine Native Microsoft Graph integration.');
  console.log('\nActively monitoring for incoming messages/emails now...\n');

  while (true) {
    try {
      await pollTeamsChats();
      await pollEmails();
    } catch (err) {
      console.error('Polling tick error:', err.message);
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}

startLoop().catch(console.error);
