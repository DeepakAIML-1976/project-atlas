import { chromium } from 'playwright';
import path from 'path';

const answer = `Deepak AI Representative Atlas: The governing hydrostatic test pressure formula per ASME B31.3 Para. 345.4.2 is:

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

async function postReply() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'teams_user_data');
  console.log('[POST REPLY] Launching Playwright with authenticated Teams session...');
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = context.pages()[0] || await context.newPage();
  
  const targetUrl = 'https://teams.microsoft.com/v2/_#/conversations/19:uni01_pesp5dvfbg5rtt5opj2fypaoucdpnegaq5ybobklo2sshkmro3xq@thread.v2?ctx=chat';
  console.log('[POST REPLY] Navigating directly to chat:', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('[POST REPLY] Waiting for Teams chat interface to load (20s)...');
  await page.waitForTimeout(20000);
  await page.screenshot({ path: 'scratch/teams_before_compose.png' });
  console.log('[POST REPLY] Current URL:', page.url(), '| Title:', await page.title());

  // Look for compose box
  console.log('[POST REPLY] Searching for message compose box...');
  let composeBox = null;
  const selectors = [
    'div[contenteditable="true"][role="textbox"]',
    'div[aria-label*="Type a message"]',
    'div[aria-label*="compose"]',
    'div[data-tid="ckeditor"]',
    'div.ck-editor__editable',
    '[role="textbox"]'
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      const isVisible = await el.isVisible();
      if (isVisible) {
        composeBox = el;
        console.log(`[POST REPLY] Found visible compose box using selector: ${sel}`);
        break;
      }
    }
  }

  if (!composeBox) {
    console.log('[POST REPLY] Direct compose box selector not found, scanning all contenteditable elements...');
    const editables = await page.$$('[contenteditable="true"]');
    for (const ed of editables) {
      if (await ed.isVisible()) {
        composeBox = ed;
        console.log('[POST REPLY] Found visible contenteditable element!');
        break;
      }
    }
  }

  if (composeBox) {
    console.log('[POST REPLY] Clicking and typing AI representative response into Teams compose box...');
    await composeBox.click();
    await page.waitForTimeout(1000);
    
    // Fill or type response
    await page.keyboard.insertText(answer);
    await page.waitForTimeout(2000);

    // Look for send button or press Ctrl+Enter / Enter
    const sendButton = await page.$('button[aria-label*="Send"], button[data-tid="sendMessageButton"]');
    if (sendButton && await sendButton.isVisible()) {
      console.log('[POST REPLY] Clicking Teams Send button...');
      await sendButton.click();
    } else {
      console.log('[POST REPLY] Pressing Enter to send message...');
      await page.keyboard.press('Enter');
    }

    console.log('[POST REPLY] Message dispatched! Waiting 5s to capture proof...');
    await page.waitForTimeout(5000);
  } else {
    console.warn('[POST REPLY] Compose box not immediately found. Saving screenshot for diagnostics.');
  }

  await page.screenshot({ path: 'scratch/teams_live_dispatched_proof.png' });
  console.log('[POST REPLY] Proof screenshot saved: scratch/teams_live_dispatched_proof.png');

  await page.waitForTimeout(3000);
  await context.close();
  console.log('[POST REPLY] Completed.');
}

postReply().catch(console.error);
