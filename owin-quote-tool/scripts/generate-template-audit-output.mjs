/**
 * Generate sample Bảng giá / Báo giá DOCX from the current tool pipeline
 * into review-screenshots/template-audit/current-output-before/
 * Node-only (no browser download UI).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import PizZip from 'pizzip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'review-screenshots/template-audit/current-output-before');
const tplDir = resolve(root, 'src/assets/templates');

mkdirSync(outDir, { recursive: true });

// Dynamic import of TS modules via vitest is heavy; re-run the same logic using built tests path.
// Prefer importing compiled-free TS through node --import tsx if available, else use inline fixture + public API via vitest.

async function main() {
  const { renderBangGiaDocumentXml, renderQuoteDocumentXml } = await import(
    pathToFileURL(resolve(root, 'src/features/export/wordExport.ts')).href
  ).catch(async () => {
    // Fallback: load via vitest-friendly relative path under node with tsx
    throw new Error('Direct TS import failed; use npm script with vitest/tsx.');
  });
  const { calculateQuote } = await import(
    pathToFileURL(resolve(root, 'src/lib/quote/quoteCalculator.ts')).href
  );

  const fixedPackage = JSON.stringify({
    name: 'Bộ phụ kiện Kinlong',
    items: [
      { name: 'Tay nắm', quantity: 2 },
      { name: 'Bản lề', quantity: 4 },
      { name: 'Keo silicone', quantity: 0 },
    ],
    packageQuantity: 2,
    unit: 'BO',
    unitPrice: 500000,
    total: 1000000,
  });
  const extraAccessories = JSON.stringify([
    {
      id: 'extra-1',
      name: 'Nẹp phát sinh',
      unit: 'BO',
      quantity: 1,
      weight: 0,
      unitPrice: 200000,
      amount: 200000,
      total: 200000,
      sortOrder: 0,
    },
  ]);

  const product = {
    id: 'P1',
    updatedAt: '2026-07-08T00:00:00.000Z',
    numericId: 1,
    code: 'P1',
    name: 'Cửa sổ mở quay 1 cánh',
    slug: 'cua-so-mo-quay-1-canh',
    category: 'Cửa Sổ',
    unit: 'M2',
    unitPriceVnd: 2000000,
    shortDesc: null,
    coverImagePath: null,
    gallery: [],
    rawSizeText: '1.196 x 1.796',
    rawPriceText: null,
    specs: [
      { key: 'Loại Kính', value: 'Kính cường lực 8mm', sortOrder: 0 },
      { key: 'Độ Dày', value: '2 mm', sortOrder: 1 },
      { key: 'Song Nhôm Bảo Vệ', value: '', sortOrder: 2 },
    ],
    accessories: [],
    fixedAccessoryPackage: fixedPackage,
    extraAccessories,
    isFeatured: false,
    isPublic: true,
    folderPath: null,
    createdAt: '2026-07-08T00:00:00.000Z',
  };

  const quote = calculateQuote({
    customerName: 'Anh Tú',
    customerPhone: '0909123456',
    customerEmail: '',
    customerAddress: '12 Lê Lợi, Q1',
    depositVnd: 1000000,
    items: [
      {
        productCode: 'S1',
        quoteItemCode: 'S1',
        itemName: 'Cửa sổ mở quay 1 cánh',
        category: 'Cửa Sổ',
        groupName: 'Cửa Sổ',
        unit: 'M2',
        unitPriceVnd: 2000000,
        coverImagePath: null,
        specs: [
          { key: 'Loại Kính', value: 'Kính cường lực 8mm' },
          { key: 'Song Nhôm Bảo Vệ', value: '' },
        ],
        dimensions: [{ widthM: 1.196, heightM: 1.796, quantity: 1 }],
        accessories: [],
        fixedAccessoryPackage: fixedPackage,
        extraAccessories,
      },
    ],
  });

  const bangZip = new PizZip(readFileSync(resolve(tplDir, 'Template_Bang_Gia.docx')));
  const bangXml = await renderBangGiaDocumentXml(bangZip, [product]);
  bangZip.file('word/document.xml', bangXml);
  writeFileSync(
    resolve(outDir, 'bang-gia-current.docx'),
    bangZip.generate({ type: 'nodebuffer' }),
  );

  const baoZip = new PizZip(readFileSync(resolve(tplDir, 'Template_Bao_Gia.docx')));
  const baoXml = await renderQuoteDocumentXml(baoZip, quote);
  baoZip.file('word/document.xml', baoXml);
  writeFileSync(
    resolve(outDir, 'bao-gia-current.docx'),
    baoZip.generate({ type: 'nodebuffer' }),
  );

  const notes = {
    generatedAt: new Date().toISOString(),
    bangGia: {
      path: 'bang-gia-current.docx',
      hasCategory: bangXml.includes('I. CỬA SỔ'),
      hasEmptySpecKey: bangXml.includes('Song Nhôm Bảo Vệ') && !/Song Nhôm Bảo Vệ:\s*</.test(bangXml),
      leftoverTokens: [...bangXml.matchAll(/\{[a-zA-Z0-9_./%-]+\}/g)].map((m) => m[0]),
      tableCount: [...bangXml.matchAll(/<w:tbl\b/g)].length,
    },
    baoGia: {
      path: 'bao-gia-current.docx',
      hasCustomer: baoXml.includes('Anh Tú'),
      noBlankEmailToken: !baoXml.includes('{email}'),
      leftoverTokens: [...baoXml.matchAll(/\{[a-zA-Z0-9_./%-]+\}/g)].map((m) => m[0]),
      orphanX: />\s*x\s*</.test(baoXml),
    },
  };
  writeFileSync(resolve(outDir, 'structure-check.json'), JSON.stringify(notes, null, 2));
  console.log(JSON.stringify(notes, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
