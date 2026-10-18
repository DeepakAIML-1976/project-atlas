import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'teams_user_data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // let's run it visible or headless
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to Teams v2...');
  await page.goto('https://teams.microsoft.com/v2/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(10000);

  console.log('Current URL:', page.url());
  console.log('Page Title:', await page.title());

  // Take a screenshot of what Teams looks like
  await page.screenshot({ path: 'scratch/teams_current_screen.png' });
  console.log('Screenshot saved to scratch/teams_current_screen.png');

  // Let's inspect local storage / tokens
  const storageData = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return keys.filter(k => k.includes('token') || k.includes('skype') || k.includes('auth'));
  });
  console.log('Auth keys in localStorage:', storageData);

  await context.close();
}

main().catch(console.error);
