import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const meetingUrl = process.env.TARGET_MEETING_URL || "https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm";
const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[DEBUG AUTH MEETING] Profile: ${userDataDir}`);
  console.log(`[DEBUG AUTH MEETING] Meeting URL: ${meetingUrl}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 850 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--use-fake-ui-for-media-stream",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--mute-audio",
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[DEBUG AUTH MEETING] Navigating...`);
  await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  await page.screenshot({ path: path.join(artifactDir, "debug_auth_step1.png") });

  // 1. Click "Join your meeting on the web"
  try {
    const webBtn = page.locator('button:has-text("Join your meeting on the web"), button:has-text("Continue on this browser"), a:has-text("Continue on this browser"), button:has-text("Join on the web")').first();
    if (await webBtn.isVisible({ timeout: 5000 })) {
      console.log(`[DEBUG AUTH MEETING] Clicking web button...`);
      await webBtn.click();
      await page.waitForTimeout(5000);
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(artifactDir, "debug_auth_step2.png") });

  // 2. Dismiss media popup if any
  try {
    const noMediaModalBtn = page.locator('button:has-text("Continue without audio or video"), button:has-text("Continue without audio and video"), button:has-text("Continue without audio")').first();
    if (await noMediaModalBtn.isVisible({ timeout: 3000 })) {
      console.log(`[DEBUG AUTH MEETING] Clicking no media modal...`);
      await noMediaModalBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(artifactDir, "debug_auth_step3.png") });

  // 3. Turn mic & cam OFF
  try {
    const dontUseAudio = page.locator('div:has-text("Don\'t use audio"), label:has-text("Don\'t use audio"), span:has-text("Don\'t use audio")').first();
    if (await dontUseAudio.isVisible({ timeout: 3000 })) {
      await dontUseAudio.click({ force: true });
      console.log(`[DEBUG AUTH MEETING] Clicked 'Don't use audio'`);
    }

    const cameraSwitch = page.locator('button[role="switch"], button[aria-label*="camera" i], div[data-tid*="toggle-video"]').first();
    if (await cameraSwitch.isVisible({ timeout: 3000 })) {
      const isChecked = await cameraSwitch.getAttribute('aria-checked').catch(() => 'true');
      if (isChecked === 'true') {
        await cameraSwitch.click({ force: true });
        console.log(`[DEBUG AUTH MEETING] Clicked Camera switch OFF`);
      }
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(artifactDir, "debug_auth_step4_prejoin.png") });

  // 4. Click Join now
  try {
    const joinBtn = page.locator('button:has-text("Join now"), button:has-text("Join meeting"), button:has-text("Join"), button[id*="join" i]').first();
    if (await joinBtn.isVisible({ timeout: 10000 })) {
      console.log(`[DEBUG AUTH MEETING] Clicking Join now...`);
      await joinBtn.click();
      await page.waitForTimeout(6000);
    }
  } catch (e) {}

  await page.screenshot({ path: path.join(artifactDir, "debug_auth_step5_stage.png") });
  console.log(`[DEBUG AUTH MEETING COMPLETE] Check step5 screenshot!`);

  await context.close();
}

main().catch(err => {
  console.error(`[DEBUG AUTH MEETING ERROR]`, err);
  process.exit(1);
});
