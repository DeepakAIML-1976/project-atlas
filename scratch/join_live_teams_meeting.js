import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const meetingUrl = "https://teams.live.com/meet/9316037901950?p=SSIGbvBMKPS7lxh5OZ";
const botName = "Deepak AI Representative Atlas";
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";
const screenshotPath = path.join(artifactDir, "live_teams_attendees_proof.png");

async function main() {
  console.log(`[ATLAS BOT] Launching Chromium browser worker to join live Teams call...`);
  console.log(`[ATLAS BOT] Target Meeting Link: ${meetingUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ]
  });

  const context = await browser.newContext({
    permissions: ["microphone", "camera"],
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  console.log(`[ATLAS BOT] Navigating to MS Teams live meeting URL...`);
  await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.waitForTimeout(5000);

  // Take step 1 screenshot
  await page.screenshot({ path: path.join(artifactDir, "teams_step1.png") });

  // Click "Continue on this browser" if button or link exists
  try {
    const webBtn = page.locator('button:has-text("Continue on this browser"), a:has-text("Continue on this browser"), button:has-text("Join on the web"), button:has-text("Continue in this browser")').first();
    if (await webBtn.isVisible({ timeout: 10000 })) {
      console.log(`[ATLAS BOT] Found and clicking 'Continue on this browser'...`);
      await webBtn.click();
    } else {
      console.log(`[ATLAS BOT] 'Continue on this browser' button not visible immediately.`);
    }
  } catch (e) {
    console.log(`[ATLAS BOT] Web join check error:`, e.message);
  }

  // Wait for the Teams SPA pre-join form to load
  console.log(`[ATLAS BOT] Waiting up to 30s for pre-join name input field...`);
  try {
    const nameInput = page.locator('input[placeholder*="name" i], input[aria-label*="name" i], input[type="text"]').first();
    await nameInput.waitFor({ state: "visible", timeout: 35000 });
    console.log(`[ATLAS BOT] Name input box located! Filling name: "${botName}"...`);
    await nameInput.click();
    await nameInput.fill(botName);
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log(`[ATLAS BOT] Could not find name input within 35s. Dumping HTML preview...`);
    const pageContent = await page.content();
    console.log(`[ATLAS BOT] Page URL: ${page.url()}`);
    console.log(`[ATLAS BOT] Body text preview: ${ (await page.innerText('body')).slice(0, 500) }`);
  }

  await page.screenshot({ path: path.join(artifactDir, "teams_step3_name_filled.png") });

  // Click Join Now button
  try {
    const joinBtn = page.locator('button:has-text("Join now"), button:has-text("Join meeting"), button:has-text("Join"), button[id*="join" i]').first();
    if (await joinBtn.isVisible({ timeout: 10000 })) {
      console.log(`[ATLAS BOT] Found and clicking 'Join now' button...`);
      await joinBtn.click();
    } else {
      console.log(`[ATLAS BOT] Join button not found, pressing Enter...`);
      await page.keyboard.press("Enter");
    }
  } catch (e) {
    console.log(`[ATLAS BOT] Join click error:`, e.message);
  }

  console.log(`[ATLAS BOT] Waiting for lobby state...`);
  await page.waitForTimeout(5000);

  const initialText = await page.innerText('body').catch(() => '');
  console.log(`[ATLAS BOT] Current status: ${initialText.includes("let you in") ? "IN LOBBY" : "JOINING"}`);
  
  // Always save initial lobby screenshot proof
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`[ATLAS BOT] Polling for up to 120s for host admission into live call stage...`);

  for (let i = 1; i <= 24; i++) {
    await page.waitForTimeout(5000);
    const bodyText = await page.innerText('body').catch(() => '');
    
    // Check if people panel button or call controls exist on stage
    const hasControls = await page.locator('button[aria-label*="People" i], button[aria-label*="Participants" i], button[aria-label*="Leave" i], button[aria-label*="Hang up" i]').isVisible().catch(() => false);

    if (hasControls || (!bodyText.includes("let you in") && !bodyText.includes("Type your name") && bodyText.length > 50)) {
      console.log(`[ATLAS BOT] Check #${i}: Bot ADMITTED to live meeting stage! Opening People roster...`);
      try {
        const peopleBtn = page.locator('button[aria-label*="People" i], button[aria-label*="Participants" i], button:has-text("People"), button[aria-label*="roster" i]').first();
        if (await peopleBtn.isVisible({ timeout: 5000 })) {
          await peopleBtn.click();
          await page.waitForTimeout(3000);
        }
      } catch (e) {}
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[ATLAS BOT] Live meeting stage screenshot proof saved to: ${screenshotPath}`);
      break;
    } else {
      console.log(`[ATLAS BOT] Check #${i}: Still in meeting lobby...`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  }

  await browser.close();
}

main().catch(err => {
  console.error(`[ATLAS BOT ERROR]`, err);
  process.exit(1);
});
