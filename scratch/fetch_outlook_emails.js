import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[OUTLOOK AGENT] Launching browser with persistent profile...`);
  console.log(`[OUTLOOK AGENT] Profile: ${userDataDir}`);

  if (!fs.existsSync(userDataDir)) {
    console.error(`[ERROR] Profile directory missing: ${userDataDir}`);
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[OUTLOOK AGENT] Navigating to Outlook Web (https://outlook.office.com/mail/)...`);
  await page.goto("https://outlook.office.com/mail/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  // Handle any intermediate MS login / SSO prompts if they appear
  try {
    const accountPick = page.locator('div:has-text("deepak.paranjape@kentplc.com"), small:has-text("deepak.paranjape@kentplc.com")').first();
    if (await accountPick.isVisible({ timeout: 4000 })) {
      console.log(`[OUTLOOK AGENT] Clicking account pick for deepak.paranjape@kentplc.com...`);
      await accountPick.click();
      await page.waitForTimeout(4000);
    }
  } catch (e) {}

  try {
    const staySignedInBtn = page.locator('input[type="submit"][value="Yes"], button:has-text("Yes")').first();
    if (await staySignedInBtn.isVisible({ timeout: 3000 })) {
      console.log(`[OUTLOOK AGENT] Clicking 'Stay signed in' Yes...`);
      await staySignedInBtn.click();
      await page.waitForTimeout(5000);
    }
  } catch (e) {}

  console.log(`[OUTLOOK AGENT] Current URL: ${page.url()}`);
  console.log(`[OUTLOOK AGENT] Page Title: ${await page.title()}`);

  // Wait for Outlook mailbox elements to load
  console.log(`[OUTLOOK AGENT] Waiting for Outlook Inbox to render...`);
  await page.waitForTimeout(8000);

  // Take screenshot of current page
  const inboxScreenshot = path.join(artifactDir, "outlook_inbox_proof.png");
  await page.screenshot({ path: inboxScreenshot, fullPage: false });
  console.log(`[OUTLOOK AGENT] Saved inbox screenshot to: ${inboxScreenshot}`);

  // Helper to extract email summaries from message list
  async function extractEmailList() {
    return await page.evaluate(() => {
      // Common Outlook Web selectors for conversation items / message rows
      const items = Array.from(document.querySelectorAll('div[role="option"], div[data-convid], div[aria-label*="unread"], div[aria-label*="read"]'));
      
      const results = [];
      for (const item of items) {
        const text = item.innerText || "";
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
          results.push({
            ariaLabel: item.getAttribute("aria-label") || "",
            lines: lines.slice(0, 5),
            fullText: text.replace(/\s+/g, " ").slice(0, 200)
          });
        }
      }
      return results;
    });
  }

  const inboxEmails = await extractEmailList();
  console.log(`[OUTLOOK AGENT] Found ${inboxEmails.length} items in Inbox view:`);
  console.log(JSON.stringify(inboxEmails.slice(0, 5), null, 2));

  // Now navigate to Sent Items
  console.log(`[OUTLOOK AGENT] Navigating to Sent Items...`);
  try {
    const sentFolder = page.locator('div[role="treeitem"]:has-text("Sent Items"), span:has-text("Sent Items"), a[aria-label*="Sent Items"]').first();
    if (await sentFolder.isVisible({ timeout: 4000 })) {
      console.log(`[OUTLOOK AGENT] Clicking Sent Items folder in navigation...`);
      await sentFolder.click();
      await page.waitForTimeout(6000);
    } else {
      console.log(`[OUTLOOK AGENT] Direct navigation to https://outlook.office.com/mail/sentitems...`);
      await page.goto("https://outlook.office.com/mail/sentitems", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(8000);
    }
  } catch (e) {
    console.log(`[OUTLOOK AGENT] Navigation error:`, e.message);
    await page.goto("https://outlook.office.com/mail/sentitems", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(8000);
  }

  const sentScreenshot = path.join(artifactDir, "outlook_sent_proof.png");
  await page.screenshot({ path: sentScreenshot, fullPage: false });
  console.log(`[OUTLOOK AGENT] Saved sent items screenshot to: ${sentScreenshot}`);

  const sentEmails = await extractEmailList();
  console.log(`[OUTLOOK AGENT] Found ${sentEmails.length} items in Sent Items view:`);
  console.log(JSON.stringify(sentEmails.slice(0, 5), null, 2));

  // Also grab full text from body if items list was empty
  if (inboxEmails.length === 0 && sentEmails.length === 0) {
    const bodyText = await page.innerText("body").catch(() => "");
    console.log(`[OUTLOOK AGENT DEBUG] Body text preview:`, bodyText.slice(0, 500));
  }

  await context.close();
  console.log(`[OUTLOOK AGENT COMPLETE]`);
}

main().catch(err => {
  console.error(`[OUTLOOK AGENT ERROR]`, err);
  process.exit(1);
});
