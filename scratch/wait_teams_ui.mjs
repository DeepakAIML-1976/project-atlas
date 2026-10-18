import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'teams_user_data');
  console.log('Launching browser with profile:', userDataDir);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to Teams v2...');
  await page.goto('https://teams.microsoft.com/v2/', { waitUntil: 'load', timeout: 90000 });

  console.log('Waiting for Teams UI to render (up to 45 seconds)...');
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(5000);
    const url = page.url();
    const title = await page.title();
    console.log(`[${(i+1)*5}s] URL: ${url.substring(0, 70)} | Title: ${title}`);
    
    // Check if chat list or messages container or search box is present
    const hasSearch = await page.$('input[placeholder*="Search"], [aria-label*="Search"]');
    const hasChat = await page.$('[aria-label="Chat"], [data-tid="chat-list"]');
    const hasText = await page.evaluate(() => document.body.innerText.substring(0, 100));
    console.log(`Search input: ${!!hasSearch}, Chat element: ${!!hasChat}, Body preview: ${hasText.replace(/\n/g, ' ')}`);

    if (hasSearch || hasChat) {
      console.log('Teams main interface is fully rendered!');
      break;
    }
  }

  await page.screenshot({ path: 'scratch/teams_loaded_full.png' });
  console.log('Screenshot saved to scratch/teams_loaded_full.png');
  await context.close();
}

main().catch(console.error);
