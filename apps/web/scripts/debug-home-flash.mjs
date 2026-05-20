import { chromium } from 'playwright';

const token = process.env.DEBUG_YEEN_TOKEN ?? '';

if (!token) {
  console.error('DEBUG_YEEN_TOKEN is required');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });

await context.addInitScript((value) => {
  localStorage.setItem('yeen_access_token', value);
}, token);

const page = await context.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });

await page.waitForTimeout(300);
await page.screenshot({ path: 'apps/web/home-auth-0.3s.png', fullPage: true });

await page.waitForTimeout(2500);
await page.screenshot({ path: 'apps/web/home-auth-2.8s.png', fullPage: true });

const rootSnapshot = await page.$eval('#root', (node) => ({
  childCount: node.childElementCount,
  text: (node.textContent ?? '').trim().slice(0, 300),
}));

console.log(JSON.stringify(rootSnapshot));

await browser.close();
