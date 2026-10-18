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
  console.log('Tenant ID:', env.MS_GRAPH_TENANT_ID);
  console.log('Client ID:', env.MS_GRAPH_CLIENT_ID);
  console.log('Target Email:', env.MS_GRAPH_USER_EMAIL);

  // 1. Get Token
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', env.MS_GRAPH_CLIENT_ID);
  params.append('client_secret', env.MS_GRAPH_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'https://graph.microsoft.com/.default');

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error('Failed to get token:', tokenData);
    return;
  }

  const token = tokenData.access_token;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  console.log('\n--- Granted Application Roles in Token ---');
  console.log(payload.roles);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  // 2. Query target user details & GUID
  const userRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MS_GRAPH_USER_EMAIL)}`, { headers });
  const userData = await userRes.json();
  console.log('\n--- Target User Profile ---');
  console.log('Status:', userRes.status);
  console.log('User GUID:', userData.id);
  console.log('Display Name:', userData.displayName);
  console.log('UPN:', userData.userPrincipalName);

  const userGuid = userData.id;

  // 3. Query Real Chats for this user
  console.log('\n--- Checking Real Teams Chats ---');
  const chatsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/chats`, { headers });
  console.log('GET /users/{id}/chats status:', chatsRes.status);
  const chatsData = await chatsRes.json();
  console.log('Chats data:', JSON.stringify(chatsData, null, 2));

  // 4. Query Teams joined by user
  console.log('\n--- Checking Joined Teams ---');
  const joinedTeamsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/joinedTeams`, { headers });
  console.log('GET /users/{id}/joinedTeams status:', joinedTeamsRes.status);
  const joinedData = await joinedTeamsRes.json();
  console.log('Joined Teams data:', JSON.stringify(joinedData, null, 2));

  // 5. Query Online Meetings
  console.log('\n--- Checking Online Meetings ---');
  const onlineMeetingsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/onlineMeetings`, { headers });
  console.log('GET /users/{id}/onlineMeetings status:', onlineMeetingsRes.status);
  const onlineData = await onlineMeetingsRes.json();
  console.log('Online Meetings data:', JSON.stringify(onlineData, null, 2));
}

main().catch(console.error);
