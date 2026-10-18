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

async function checkAppPerms() {
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_GRAPH_CLIENT_ID,
      client_secret: env.MS_GRAPH_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
  });
  const { access_token } = await tokenRes.json();
  
  const res = await fetch(`https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${env.MS_GRAPH_CLIENT_ID}'`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  if (data.value && data.value[0]) {
    console.log('App roles assigned:', JSON.stringify(data.value[0].appRoles, null, 2));
    console.log('OAuth2PermissionGrants:', JSON.stringify(data.value[0].oauth2PermissionGrants, null, 2));
  } else {
    console.log('Result:', JSON.stringify(data, null, 2));
  }
}
checkAppPerms().catch(console.error);
