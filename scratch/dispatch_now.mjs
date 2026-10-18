import fs from 'fs';

const tokenData = JSON.parse(fs.readFileSync('scratch/teams_delegated_tokens.json', 'utf8'));
const chatId = '19:uni01_pesp5dvfbg5rtt5opj2fypaoucdpnegaq5ybobklo2sshkmro3xq@thread.v2';

const messageText = `Deepak's AI Representative: Thank you for the question. Let me be straight with you before I give an engineering position, because this is exactly the kind of query where the answer is dangerous to give blind.

What I can give you (engineering basis):

1. Codes vs. spec vs. judgement (Rule #12). A flange rating and material spec for wet sour gas is not a code-alone decision. It is governed by a chain: the applicable piping material spec / line class -> the pressure-temperature rating at the actual design temperature and material group -> the sour service requirement (NACE MR0175 / ISO 15156).

2. Class number is not direct pressure (Rule #14). The flange rating (150/300/600/etc.) must be verified against ASME B16.5 pressure-temperature tables for the actual material group at design temperature. Wet sour gas typically pushes material selection toward low-alloy or carbon steel with hardness control (ASTM A105N or ASTM A350 Gr. LF2 Cl. 1, hardness <= 22 HRC, S <= 0.002%, HIC/SSC resistant).

3. Sour service is a material-and-hardness problem, not a rating problem. Under NACE MR0175/ISO 15156, the governing factors are H2S partial pressure, pH, and in-situ conditions. Bolting must be ASTM A193 B7M / A194 2HM and gaskets must be 316L Spiral Wound with flexible graphite and inner ring.

4. Never design from operating conditions alone (Rule #13). The flange rating check must use maximum credible design pressure (including blocked-in/upset), not normal operating pressure.

What I will NOT do: I will not quote you a specific flange rating (e.g., "use 300#") or a specific material grade from memory. The answer depends on the actual design pressure, design temperature, H2S partial pressure, and the project's piping material specification (PMS) for Project 5884.

What I recommend: Send me the line's design pressure/temperature, H2S content (or partial pressure), and the governing project spec (PMS) for the 5884 line list. I'll frame the rating check and sour-service qualification for Deepak to validate and issue in writing.`;

console.log(`Posting live reply directly to Microsoft Teams (${chatId})...`);

const res = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${tokenData.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    body: {
      contentType: 'text',
      content: messageText,
    },
  }),
});

console.log('HTTP Status:', res.status);
const data = await res.json();
console.log('Result:', JSON.stringify(data, null, 2));

if (res.ok) {
  console.log('\nSUCCESS! The Digital Twin reply is posted and live in Microsoft Teams!');
}
