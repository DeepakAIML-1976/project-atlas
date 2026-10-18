import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[OUTLOOK AGENT] Starting Outlook Web Access with persistent profile...`);
  console.log(`[OUTLOOK AGENT] Profile: ${userDataDir}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[OUTLOOK AGENT] Navigating to https://outlook.office.com/mail/...`);
  await page.goto("https://outlook.office.com/mail/", { waitUntil: "domcontentloaded", timeout: 60000 });

  let emailSubmitted = false;
  let mailboxLoaded = false;

  console.log(`================================================================`);
  console.log(`>>> OUTLOOK MONITORING ACTIVE <<<`);
  console.log(`Autofilling account and waiting for mailbox to open...`);
  console.log(`================================================================`);

  // Wait loop (up to 5 minutes)
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(2000);
    const url = page.url();
    const title = await page.title();

    // 1. If email input is visible and hasn't been submitted, fill it and submit
    if (!emailSubmitted) {
      try {
        const emailInput = page.locator('input[type="email"], input[name="loginfmt"]').first();
        if (await emailInput.isVisible().catch(() => false)) {
          console.log(`[OUTLOOK AGENT] Entering deepak.paranjape@kentplc.com into email field...`);
          await emailInput.fill("deepak.paranjape@kentplc.com");
          await page.waitForTimeout(600);

          const nextBtn = page.locator('input[type="submit"][value="Next"], button:has-text("Next")').first();
          if (await nextBtn.isVisible().catch(() => false)) {
            await nextBtn.click();
          } else {
            await page.keyboard.press("Enter");
          }
          console.log(`[OUTLOOK AGENT] Submitted email. Moving to authentication step.`);
          emailSubmitted = true;
          await page.waitForTimeout(3000);
          continue;
        }
      } catch (e) {}
    }

    // 2. If account tile is visible (e.g. pick account), click it
    try {
      const accountTile = page.locator('div:has-text("deepak.paranjape@kentplc.com"), small:has-text("deepak.paranjape@kentplc.com")').first();
      if (await accountTile.isVisible().catch(() => false)) {
        console.log(`[OUTLOOK AGENT] Selecting existing account tile for deepak.paranjape@kentplc.com...`);
        await accountTile.click();
        emailSubmitted = true;
        await page.waitForTimeout(3000);
        continue;
      }
    } catch (e) {}

    // 3. If "Stay signed in?" appears, click Yes
    try {
      const staySignedInBtn = page.locator('input[type="submit"][value="Yes"], button:has-text("Yes")').first();
      if (await staySignedInBtn.isVisible().catch(() => false)) {
        console.log(`[OUTLOOK AGENT] Clicking 'Stay signed in' Yes...`);
        await staySignedInBtn.click();
        await page.waitForTimeout(3000);
        continue;
      }
    } catch (e) {}

    // 4. Check if Outlook mailbox has loaded
    const isOutlookDomain = url.includes("outlook.office.com/mail") || url.includes("outlook.office365.com/mail");
    const isLogin = url.includes("login.microsoftonline.com") || url.includes("login.microsoft.com");

    if (isOutlookDomain && !isLogin) {
      const hasMailUI = await page.locator('div[role="listbox"], div[data-convid], div[role="option"], button[aria-label*="New mail"], div[aria-label*="Message list"]').first().isVisible().catch(() => false);
      if (hasMailUI || title.toLowerCase().includes("outlook") || title.toLowerCase().includes("mail")) {
        console.log(`[OUTLOOK AGENT SUCCESS] Outlook mailbox loaded successfully!`);
        console.log(`[OUTLOOK AGENT] URL: ${url}`);
        console.log(`[OUTLOOK AGENT] Title: ${title}`);
        mailboxLoaded = true;
        break;
      }
    }

    if (i % 10 === 0 && i > 0) {
      console.log(`[OUTLOOK AGENT] Still waiting for sign-in completion... (${i * 2}s elapsed, URL: ${url.slice(0, 70)}...)`);
    }
  }

  if (!mailboxLoaded) {
    console.log(`[OUTLOOK AGENT TIMEOUT] Mailbox did not load within time limit.`);
    await page.screenshot({ path: path.join(artifactDir, "outlook_timeout.png") });
    await context.close();
    return;
  }

  console.log(`[OUTLOOK AGENT] Waiting 8s for emails to render in Inbox...`);
  await page.waitForTimeout(8000);

  // Helper to extract visible email cards
  async function getVisibleEmails() {
    return await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div[role="option"], div[data-convid], div[aria-label*="unread"], div[aria-label*="read"]'));
      const emails = [];
      for (const r of rows) {
        const text = (r.innerText || "").trim();
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
          emails.push({
            label: r.getAttribute("aria-label") || "",
            lines: lines.slice(0, 5),
            fullPreview: text.replace(/\s+/g, " ").slice(0, 200)
          });
        }
      }
      return emails;
    });
  }

  // 1. Inbox Extraction
  console.log(`[OUTLOOK AGENT] Capturing Inbox screenshot & extracting items...`);
  const inboxScreenshot = path.join(artifactDir, "outlook_inbox_proof.png");
  await page.screenshot({ path: inboxScreenshot, fullPage: false });
  console.log(`[OUTLOOK AGENT SUCCESS] Saved Inbox screenshot: ${inboxScreenshot}`);

  const inboxEmails = await getVisibleEmails();
  console.log(`[OUTLOOK AGENT] Extracted ${inboxEmails.length} Inbox emails:`);
  console.log(JSON.stringify(inboxEmails.slice(0, 10), null, 2));

  // 2. Sent Items Extraction
  console.log(`[OUTLOOK AGENT] Navigating to Sent Items...`);
  try {
    const sentFolder = page.locator('div[role="treeitem"]:has-text("Sent Items"), span:has-text("Sent Items"), a[aria-label*="Sent Items"]').first();
    if (await sentFolder.isVisible().catch(() => false)) {
      console.log(`[OUTLOOK AGENT] Clicking 'Sent Items' in navigation...`);
      await sentFolder.click();
      await page.waitForTimeout(6000);
    } else {
      console.log(`[OUTLOOK AGENT] Direct navigation to https://outlook.office.com/mail/sentitems...`);
      await page.goto("https://outlook.office.com/mail/sentitems", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(8000);
    }
  } catch (e) {
    await page.goto("https://outlook.office.com/mail/sentitems", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(8000);
  }

  console.log(`[OUTLOOK AGENT] Capturing Sent Items screenshot & extracting items...`);
  const sentScreenshot = path.join(artifactDir, "outlook_sent_proof.png");
  await page.screenshot({ path: sentScreenshot, fullPage: false });
  console.log(`[OUTLOOK AGENT SUCCESS] Saved Sent Items screenshot: ${sentScreenshot}`);

  const sentEmails = await getVisibleEmails();
  console.log(`[OUTLOOK AGENT] Extracted ${sentEmails.length} Sent items:`);
  console.log(JSON.stringify(sentEmails.slice(0, 10), null, 2));

  // 3. Save JSON Report
  const report = {
    account: "deepak.paranjape@kentplc.com",
    timestamp: new Date().toISOString(),
    inboxCount: inboxEmails.length,
    inboxItems: inboxEmails.slice(0, 15),
    sentCount: sentEmails.length,
    sentItems: sentEmails.slice(0, 15),
  };

  const reportPath = path.join(artifactDir, "outlook_emails_summary.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[OUTLOOK AGENT COMPLETE] Full report saved to ${reportPath}`);

  await page.waitForTimeout(4000);
  await context.close();
}

main().catch(err => {
  console.error(`[OUTLOOK AGENT ERROR]`, err);
  process.exit(1);
});
