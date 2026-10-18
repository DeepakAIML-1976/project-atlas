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

function updateEnv(key, val) {
  let envText = fs.readFileSync(path.resolve('.env'), 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envText)) {
    envText = envText.replace(regex, `${key}=${val}`);
  } else {
    envText += `\n${key}=${val}`;
  }
  fs.writeFileSync(path.resolve('.env'), envText, 'utf8');
}

const env = getEnv();
const tenantId = env.MS_GRAPH_TENANT_ID;
const clientId = env.MS_GRAPH_CLIENT_ID;

console.log('Requesting Microsoft Device Login code with public client enabled...');
const deviceCodeParams = new URLSearchParams({
  client_id: clientId,
  scope: 'https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/User.Read offline_access',
});

const deviceRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: deviceCodeParams.toString(),
});

const deviceData = await deviceRes.json();
if (!deviceData.device_code) {
  console.error('Failed to get device code:', deviceData);
  process.exit(1);
}

console.log('\n=============================================================');
console.log('>>> ONE-TIME TEAMS PERMISSION CONFIRMATION <<<');
console.log(`URL:  https://microsoft.com/devicelogin`);
console.log(`CODE: ${deviceData.user_code}`);
console.log(`ACCOUNT: DeepakParanjape@DPEngineeringservices.onmicrosoft.com`);
console.log('=============================================================\n');
console.log('Waiting for you to enter the code in your browser...');

const pollInterval = (deviceData.interval || 5) * 1000;
const expiresAt = Date.now() + (deviceData.expires_in * 1000);

let tokens = null;
while (Date.now() < expiresAt) {
  await new Promise(r => setTimeout(r, pollInterval));
  
  // Try polling as public client (without client_secret)
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceData.device_code,
  });

  const pollRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });

  const pollData = await pollRes.json();
  if (pollData.access_token) {
    tokens = pollData;
    break;
  }

  if (pollData.error === 'authorization_pending') {
    process.stdout.write('.');
    continue;
  }

  if (pollData.error === 'slow_down') {
    await new Promise(r => setTimeout(r, 5000));
    continue;
  }

  // If public client failed because client_secret is needed, try with secret
  if (pollData.error === 'invalid_client' && pollData.error_description?.includes('client_secret')) {
    const tokenParamsWithSecret = new URLSearchParams({
      client_id: clientId,
      client_secret: env.MS_GRAPH_CLIENT_SECRET,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceData.device_code,
    });
    const pollRes2 = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParamsWithSecret.toString(),
    });
    const pollData2 = await pollRes2.json();
    if (pollData2.access_token) {
      tokens = pollData2;
      break;
    }
    if (pollData2.error === 'authorization_pending') {
      process.stdout.write('.');
      continue;
    }
  }

  console.error('\nOAuth error during polling:', pollData);
  process.exit(1);
}

if (!tokens) {
  console.error('\nDevice code expired before authorization.');
  process.exit(1);
}

console.log('\n\n=============================================================');
console.log('SUCCESS! Delegated user token acquired.');
console.log('Account authenticated successfully.');

fs.writeFileSync('scratch/teams_delegated_tokens.json', JSON.stringify(tokens, null, 2));
if (tokens.refresh_token) {
  updateEnv('MS_GRAPH_REFRESH_TOKEN', tokens.refresh_token);
}

// Now immediately post the hydrotest answer into the Teams chat!
const chatId = '19:uni01_pesp5dvfbg5rtt5opj2fypaoucdpnegaq5ybobklo2sshkmro3xq@thread.v2';
const messageText = `Deepak AI Representative Atlas: The governing hydrostatic test pressure formula per ASME B31.3 Para. 345.4.2 is:

P_T = 1.5 * P * (S_T / S)

Where:
- P_T = minimum hydrostatic test gauge pressure
- P = internal design gauge pressure
- S_T = allowable stress at test temperature (from Table A-1)
- S = allowable stress at design temperature (from Table A-1)

When test temperature and design temperature are the same, this simplifies to 1.5 * P.

On limiting by yield strength -- yes, this is a mandatory code check. Per ASME B31.3 Para. 345.4.2(b), the test pressure must not produce a nominal stress in any component exceeding the yield strength at test temperature. In hoop stress terms: P_T <= (2 * S_y * t) / D using minimum measured wall thickness.

Key SME checks before signing the test pack:
1. Verify S_T at actual test water temperature, not assumed ambient.
2. Check the governing component -- flanges, valves, and expansion joints often have lower rating limits than the pipe wall (Rule #13, Rule #85).
3. Isolate control valves, PSVs, orifice plates, and instruments per Rule #83.
4. For gas lines, evaluate the hydrotest water weight case per Rule #74.`;

console.log(`\nPosting live reply directly to Teams chat (${chatId})...`);
const postRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${tokens.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    body: {
      contentType: 'text',
      content: messageText,
    },
  }),
});

console.log('Teams Message Post HTTP Status:', postRes.status);
const postResult = await postRes.json();
console.log('Teams Message Result:', JSON.stringify(postResult, null, 2));
console.log('=============================================================\n');
