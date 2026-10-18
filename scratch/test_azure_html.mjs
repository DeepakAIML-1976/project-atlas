const tenantId = '5af47cf9-2cb5-4b53-a5ec-f7fa67c69552';
const clientId = '36cd549a-b6da-4af7-a41c-c898a8d7553e';
const uri = 'http://localhost:5000/auth/callback';
const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(uri)}&response_mode=query&scope=https://graph.microsoft.com/Chat.ReadWrite&state=123`;
const res = await fetch(url);
const text = await res.text();
console.log('HTTP Status:', res.status);
console.log('Length:', text.length);
const aadsts = text.match(/AADSTS\d+/g);
console.log('AADSTS matches in HTML:', aadsts);
if (text.includes('Sign in')) {
  console.log('Has "Sign in"');
}
if (text.includes('No reply address is registered')) {
  console.log('Has "No reply address is registered"');
}
