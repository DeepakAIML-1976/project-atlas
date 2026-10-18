import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'teams_user_data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Opening Teams v2 Web...');
  await page.goto('https://teams.microsoft.com/v2/', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('Networkidle timeout, continuing...'));
  
  await page.waitForTimeout(10000);
  console.log('Current URL:', page.url());
  console.log('Page Title:', await page.title());

  await page.screenshot({ path: 'scratch/teams_active_view.png' });
  console.log('Saved screenshot to scratch/teams_active_view.png');

  // Let's inspect the DOM elements to find chat items or compose box
  const composeBoxes = await page.$$('[contenteditable="true"], [role="textbox"], textarea');
  console.log('Found compose boxes count:', composeBoxes.length);

  await context.close();
}

main().catch(console.error);
