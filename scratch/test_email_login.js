import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[TEST EMAIL LOGIN] Launching with profile: ${userDataDir}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[TEST EMAIL LOGIN] Navigating to https://outlook.office.com/mail/...`);
  await page.goto("https://outlook.office.com/mail/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  const emailInput = page.locator('input[type="email"], input[name="loginfmt"]').first();
  if (await emailInput.isVisible({ timeout: 5000 })) {
    console.log(`[TEST EMAIL LOGIN] Entering deepak.paranjape@kentplc.com...`);
    await emailInput.fill("deepak.paranjape@kentplc.com");
    await page.waitForTimeout(1000);

    const nextBtn = page.locator('input[type="submit"][value="Next"], button:has-text("Next")').first();
    await nextBtn.click();
    console.log(`[TEST EMAIL LOGIN] Clicked Next button...`);
    await page.waitForTimeout(6000);
  }

  console.log(`[TEST EMAIL LOGIN] Current URL: ${page.url()}`);
  console.log(`[TEST EMAIL LOGIN] Current Title: ${await page.title()}`);

  const stepScreenshot = path.join(artifactDir, "outlook_login_step2.png");
  await page.screenshot({ path: stepScreenshot });
  console.log(`[TEST EMAIL LOGIN] Saved screenshot to: ${stepScreenshot}`);

  const bodyText = await page.innerText("body").catch(() => "");
  console.log(`[TEST EMAIL LOGIN] Page text preview:`, bodyText.slice(0, 400));

  await context.close();
}

main().catch(err => {
  console.error(`[ERROR]`, err);
  process.exit(1);
});
