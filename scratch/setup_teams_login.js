import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");

async function main() {
  console.log(`[ATLAS TEAMS SETUP] Launching VISIBLE browser for Microsoft 365 Login...`);
  console.log(`[ATLAS TEAMS SETUP] Profile Directory: ${userDataDir}`);
  console.log(`[ATLAS TEAMS SETUP] Please log in with DeepakParanjape@DPEngineeringservices.onmicrosoft.com in the opened browser window.`);

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 850 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[ATLAS TEAMS SETUP] Navigating to Microsoft Teams Web (https://teams.microsoft.com/v2/)...`);
  await page.goto("https://teams.microsoft.com/v2/", { waitUntil: "domcontentloaded" });

  console.log(`================================================================`);
  console.log(`>>> PLEASE COMPLETE SIGN-IN IN THE OPEN BROWSER WINDOW <<<`);
  console.log(`Account: DeepakParanjape@DPEngineeringservices.onmicrosoft.com`);
  console.log(`Complete sign-in and keep 'Stay signed in? Yes'.`);
  console.log(`Once you see your Teams chats loaded, the session will be saved.`);
  console.log(`================================================================`);

  // Keep the browser open and wait for genuine sign-in completion
  console.log('[ATLAS TEAMS SETUP] Monitoring for successful login...');
  while (true) {
    await page.waitForTimeout(3000);
    const url = page.url();
    
    // Check for actual authenticated Teams app elements
    const chatButton = await page.$('[aria-label="Chat"], [data-tid="app-bar-chat"], [data-tid="chat-list"], button[aria-label*="Deepak"]');
    const isLoggedIn = chatButton && !url.includes("login.microsoftonline.com") && !url.includes("login.live.com");

    if (isLoggedIn) {
      console.log(`[ATLAS TEAMS SETUP SUCCESS] Authenticated Teams UI verified!`);
      console.log(`[ATLAS TEAMS SETUP SUCCESS] Session saved to profile.`);
      break;
    }
  }

  await page.waitForTimeout(5000);
  await context.close();
  console.log(`[ATLAS TEAMS SETUP COMPLETE] Session setup done.`);
}

main().catch(err => {
  console.error(`[ATLAS TEAMS SETUP ERROR]`, err);
  process.exit(1);
});
