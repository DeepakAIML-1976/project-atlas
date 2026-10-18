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
const tokenFilePath = path.resolve('scratch/teams_delegated_tokens.json');
let tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));

console.log('Testing refresh as public client (WITHOUT client_secret)...');
const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
const refreshParams = new URLSearchParams({
  client_id: env.MS_GRAPH_CLIENT_ID,
  grant_type: 'refresh_token',
  refresh_token: tokenData.refresh_token,
});

const res = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: refreshParams.toString(),
});

console.log('Public client refresh HTTP status:', res.status);
const json = await res.json();
console.log('Public client refresh response:', json);

if (json.access_token) {
  console.log('SUCCESS! Obtained new delegated access token!');
  fs.writeFileSync(tokenFilePath, JSON.stringify({ ...tokenData, ...json }, null, 2));
}
