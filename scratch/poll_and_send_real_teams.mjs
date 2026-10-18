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

const deviceCode = 'NBgABIQEAAAA9VeaV3ywaSLp1O3c4_Et5RXZvU3RzQXJ0aWZhY3RzAQAAAAAAG6_furd6yVyqxvVKqwN9FbA99b5YPVY2iIWBff0MzGxOd_gtFqeHhuCQ9BXr5QkilhsI5YFv8RCgH3gbDXF-nhu6xa1AKwyO8wF93IijCex7mXxw-sh2hyHVaem3jkicUSZvgagYjUAPKxo-N7GLNqa0ah6-De5ztYlkEJV6QSpqtBhO2sr8q3D6mrGNfeMYbpG2f32GBULTN8hXNh98nsGtIIi0wrkDMPZrnihwn9XUCu7EP6qdhfJmePcfWJoTzsxVCzaWCVtA9KisyM4kNV9-EqEDmilKPdGE_Bd_baF_sXtkaGQy03PXcUndgqYH2MN73bLKf4QST6PKcDb2vygXTduo_b2oqcfjo5phWdgTEq-oPGS2Ccq-20FdBwMaYwODBiOAJWH5d9k9vn3S0YBgbazy6BF8UOhYTk5z1TnKTylHG3FgvVD8JBlZMLmxt2AHKP5dm6GnXUxVvhE4EX6azheaSjsppmDM-WhV31LMCiWVkyN_zmhchoMTNrc56GXFZSv7sa4a4Cqa6nEsdp1WaBgVIbINy0Lr11IDgbLODZ6yn5_zaONnX_jJQXtiGslggwK5Ap-Q-9UKKJO0XjbRfqGzl8-74UQLSSD-kxro4mX9Kq-RxjisNLUMtCuDgzxXpuA2jAi7N_q-_MpsimFi8KFyZOxpUak22jzTdO8vuIAvO5vS5Sz9BfYQ5HKXY1qAiVyEZZSWtQtNiQ5ocUw_y8t1-7iGr78Wh_30MznzIVsPKtzYVWZCGXm9G7FhX9BxyHZ2wFPzjFaeNSQc49sl63q8KeO-fSI1njfRfPbyEbcsqcSiV-7bDOxQqRSeIAA';

async function main() {
  const env = getEnv();
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;

  console.log('Polling for authentication completion...');
  for (let i = 0; i < 60; i++) {
    const params = new URLSearchParams({
      client_id: env.MS_GRAPH_CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      console.log('\n======================================================');
      console.log('SUCCESS! DELEGATED AUTHENTICATION COMPLETED!');
      console.log('======================================================\n');

      const chatId = '19:011fa9e3cbd548ee8419c4028c597580@thread.v2';
      console.log(`Posting live message to Teams Chat (${chatId})...`);

      const msgPayload = {
        body: {
          contentType: 'html',
          content: `<b>Hello Deepak!</b><br><br>This is a <b>live test message</b> delivered directly into your Microsoft Teams app by your <b>AI Digital Twin Representative (Atlas)</b>.<br><br>Your ASME B31.3 & API 570 knowledge base and DeepSeek engine are linked and ready for real-time Teams collaboration.`,
        },
      };

      const sendRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(msgPayload),
      });

      const sendData = await sendRes.json();
      console.log('Send Message HTTP Status:', sendRes.status);
      console.log('Send Message Result:', JSON.stringify(sendData, null, 2));

      if (sendRes.ok) {
        console.log('\n🎉 SUCCESS! Message is now visible inside your Microsoft Teams application!');
      }

      // Also save the refresh token and delegated access token into .env
      if (data.refresh_token) {
        console.log('Saving delegated tokens to .env for persistent background operation...');
        let curEnv = fs.readFileSync(path.resolve('.env'), 'utf8');
        if (!curEnv.includes('MS_TEAMS_REFRESH_TOKEN=')) {
          curEnv += `\nMS_TEAMS_REFRESH_TOKEN=${data.refresh_token}\nMS_TEAMS_DELEGATED_TOKEN=${data.access_token}\n`;
        } else {
          curEnv = curEnv.replace(/MS_TEAMS_REFRESH_TOKEN=.*/, `MS_TEAMS_REFRESH_TOKEN=${data.refresh_token}`);
          curEnv = curEnv.replace(/MS_TEAMS_DELEGATED_TOKEN=.*/, `MS_TEAMS_DELEGATED_TOKEN=${data.access_token}`);
        }
        fs.writeFileSync(path.resolve('.env'), curEnv, 'utf8');
      }
      return;
    }

    if (data.error === 'authorization_pending') {
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      console.log('\nToken Poll Status:', data);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch(console.error);
