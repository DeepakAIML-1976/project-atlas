const tenantId = '5af47cf9-2cb5-4b53-a5ec-f7fa67c69552';
const clientId = '36cd549a-b6da-4af7-a41c-c898a8d7553e';

const redirectUris = [
  'http://localhost:5000/auth/callback',
  'http://localhost:3000/auth/callback',
  'https://login.microsoftonline.com/common/oauth2/nativeclient',
  'http://localhost',
  'ms-appx-web://microsoft.aad.brokerplugin/' + clientId,
];

for (const uri of redirectUris) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(uri)}&response_mode=query&scope=https://graph.microsoft.com/Chat.ReadWrite&state=12345`;
  const res = await fetch(url, { redirect: 'manual' });
  console.log(`Redirect URI [${uri}]: Status ${res.status}`);
  if (res.status === 302) {
    const loc = res.headers.get('location');
    console.log(`  -> Redirect to:`, loc?.slice(0, 100));
  } else {
    const text = await res.text();
    const hasError = text.includes('AADSTS50011') || text.includes('reply address');
    console.log(`  -> Valid in Azure?`, !hasError);
    if (hasError) {
      console.log(`  -> Error: AADSTS50011 (Redirect URI not registered)`);
    }
  }
}
