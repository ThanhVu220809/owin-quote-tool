import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outDir = resolve('review-screenshots/target-after-tool-simplify');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(25000);
const base = process.env.CAPTURE_URL || 'http://127.0.0.1:5177/';

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);

// Top nav
await page.screenshot({ path: resolve(outDir, 'top-nav.png'), fullPage: false });

// Product form
const productTab = page.locator('.tool-nav-item', { hasText: 'Sản phẩm' }).first();
if (await productTab.count()) await productTab.click();
await page.waitForTimeout(500);
const addProduct = page.getByRole('button', { name: /Thêm sản phẩm|Tạo sản phẩm|Thêm/i }).first();
if (await addProduct.count()) await addProduct.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(outDir, 'product-form.png'), fullPage: false });

const suggestInput = page.locator('.product-editor-card .autosuggest-control .input').first();
if (await suggestInput.count()) {
  await suggestInput.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, 'suggestion-dropdown.png'), fullPage: false });
}

// Quotes
await page.locator('.tool-nav-item', { hasText: 'Báo giá' }).first().click();
await page.waitForTimeout(700);
const createQuote = page.getByRole('button', { name: /Tạo báo giá|Báo giá mới|Tạo mới|Thêm báo giá|Tạo/i }).first();
if (await createQuote.count()) await createQuote.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: resolve(outDir, 'quote-form.png'), fullPage: false });

const pickBtn = page.getByRole('button', { name: /Chọn sản phẩm từ kho|Chọn sản phẩm/i }).first();
if (await pickBtn.count()) {
  await pickBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(outDir, 'quote-picker-modal.png'), fullPage: false });
  const card = page.locator('.quote-picker-card').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(900);
  } else {
    await page.keyboard.press('Escape');
  }
}

const itemCard = page.locator('.quote-item-card').first();
if (await itemCard.count()) {
  await itemCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, 'quote-item-card.png'), fullPage: false });
}

// Bang gia
await page.locator('.tool-nav-item', { hasText: 'Bảng giá' }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(outDir, 'bang-gia.png'), fullPage: false });

await browser.close();
console.log('screenshots saved to', outDir);
