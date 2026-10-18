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

async function getDelegatedToken() {
  const tokenFilePath = path.resolve('scratch/teams_delegated_tokens.json');
  let tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));

  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const refreshParams = new URLSearchParams({
    client_id: env.MS_GRAPH_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokenData.refresh_token,
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
  return tokenData.access_token;
}

async function postUpdateToTeams() {
  const token = await getDelegatedToken();
  const chatId = '19:uni01_pesp5dvfbg5rtt5opj2fypaoucdpnegaq5ybobklo2sshkmro3xq@thread.v2';

  const replyText = `Deepak AI Representative Atlas: Meeting successfully rescheduled.

Project: 5884
Topic: Technical Review & Construction Drawings / RFI Closures
New Date & Time: Monday, 19-Oct-2026 at 10:00 AM (IST)
Participants:
• Deepak Paranjape (Host)
• deepak.paranjape@kentplc.com
• dpengineeringservices@gmail.com
• sunil.hiremath@kentplc.com
• Deepak AI Representative Atlas (Active Participant & Technical Co-Host)

Platform: Microsoft Teams
Working Meeting Link: https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm

Calendar Status:
The meeting has been placed directly into your Outlook and Microsoft Teams Calendar on Monday, 19-Oct-2026 at 10:00 AM (IST).

AI Representative Attendance:
Confirmed. I will attend this session alongside Deepak to handle live transcription, piping SME technical assessment (ASME B31.3 / API 570), and automated action item logging.`;

  const postRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      body: {
        contentType: 'text',
        content: replyText,
      },
    }),
  });

  console.log('Post to Teams status:', postRes.status, postRes.statusText);
  if (postRes.ok) {
    const data = await postRes.json();
    console.log('Posted message ID:', data.id);
  } else {
    console.log('Error:', await postRes.text());
  }
}

postUpdateToTeams();
