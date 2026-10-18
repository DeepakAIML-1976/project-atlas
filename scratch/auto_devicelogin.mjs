import { chromium } from 'playwright';
import path from 'path';

async function continueDeviceLogin() {
  const code = 'SB4TP69NH';
  console.log(`[DEVICE LOGIN AUTO] Continuing login for code: ${code}`);

  const userDataDir = path.join(process.cwd(), 'scratch', 'teams_user_data');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1200, height: 800 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://microsoft.com/devicelogin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Check if code field is present
  const codeInput = await page.$('input[name="otc"], input#otc');
  if (codeInput) {
    console.log('[DEVICE LOGIN AUTO] Entering code...');
    await codeInput.fill(code);
    await page.waitForTimeout(1000);
    const nextBtn = await page.$('input[type="submit"], button#btnSubmit, button[type="submit"]');
    if (nextBtn) await nextBtn.click();
    await page.waitForTimeout(4000);
  }

  console.log('[DEVICE LOGIN AUTO] Checking email field at URL:', page.url());
  const emailInput = await page.$('input[type="email"], input[name="loginfmt"]');
  if (emailInput) {
    console.log('[DEVICE LOGIN AUTO] Typing email DeepakParanjape@DPEngineeringservices.onmicrosoft.com...');
    await emailInput.fill('DeepakParanjape@DPEngineeringservices.onmicrosoft.com');
    await page.waitForTimeout(1000);
    const nextBtn = await page.$('input[type="submit"], button#idSIButton9, button[type="submit"]');
    if (nextBtn) {
      console.log('[DEVICE LOGIN AUTO] Clicking Next after email...');
      await nextBtn.click();
      await page.waitForTimeout(4000);
    }
  }

  await page.screenshot({ path: 'scratch/device_login_email_next.png' });
  console.log('[DEVICE LOGIN AUTO] Current URL after email Next:', page.url());

  // Check if password field is visible
  const passwordInput = await page.$('input[type="password"], input[name="passwd"]');
  if (passwordInput) {
    console.log('[DEVICE LOGIN AUTO] Password input field is visible!');
  }

  await browser.close();
}

continueDeviceLogin().catch(console.error);
