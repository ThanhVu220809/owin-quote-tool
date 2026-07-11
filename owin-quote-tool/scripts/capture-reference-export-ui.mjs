import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve('review-screenshots/docx-qa/reference-real-output');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

await page.goto('http://localhost:3000/admin/catalogue', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: resolve(out, 'reference-catalogue-page.png'), fullPage: false });

await page.goto('http://localhost:3000/admin/quotes', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(out, 'reference-quotes-list.png'), fullPage: false });

const link = page.locator('a[href*="/admin/quotes/"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: resolve(out, 'reference-quote-detail.png'), fullPage: false });
}

await browser.close();
console.log('REFERENCE UI screenshots saved to', out);
