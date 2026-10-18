import { chromium } from 'playwright';
import path from 'path';

async function run() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'teams_user_data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to Teams v2...');
  await page.goto('https://teams.microsoft.com/v2/', { waitUntil: 'domcontentloaded' });
  
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2000);
    const u = page.url();
    console.log(`[${i * 2}s] ${u.substring(0, 90)}`);
    if (u.includes('teams.microsoft.com/v2') && !u.includes('login.microsoftonline.com')) {
      console.log('Teams workspace loaded successfully!');
      break;
    }
  }

  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'scratch/teams_sso_result.png' });
  console.log('Screenshot saved to scratch/teams_sso_result.png');
  await context.close();
}

run().catch(console.error);
