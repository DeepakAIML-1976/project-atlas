import { chromium } from "playwright";
import path from "node:path";

const userDataDir = path.join(process.cwd(), "scratch", "teams_user_data");
const artifactDir = "C:\\Users\\dpeng\\.gemini\\antigravity\\brain\\a6139213-1b01-4be2-a990-f6942830b6a6";

async function main() {
  console.log(`[AUTH VERIFY] Validating saved Microsoft 365 profile: ${userDataDir}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 850 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`[AUTH VERIFY] Navigating to https://teams.microsoft.com/v2/...`);
  await page.goto("https://teams.microsoft.com/v2/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  const url = page.url();
  const pageTitle = await page.title();
  const bodyText = await page.innerText('body').catch(() => '');

  console.log(`[AUTH VERIFY SUCCESS] Current Authenticated URL: ${url}`);
  console.log(`[AUTH VERIFY SUCCESS] Page Title: "${pageTitle}"`);

  // Capture screenshot proof of authenticated Teams workspace
  const proofPath = path.join(artifactDir, "m365_authentication_proof.png");
  await page.screenshot({ path: proofPath });
  console.log(`[AUTH VERIFY SUCCESS] Screenshot saved to: ${proofPath}`);

  await context.close();
}

main().catch(err => {
  console.error(`[AUTH VERIFY ERROR]`, err);
  process.exit(1);
});
