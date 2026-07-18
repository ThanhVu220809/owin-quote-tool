import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import type { ProductRecord } from '@/types/models';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import {
  applyCatalogueReadOnlyProtection,
  CATALOGUE_WORD_EDIT_PASSWORD,
  computeWordProtectionHash,
  fitImageDimensionsToEmuBox,
  renderBangGiaDocumentXml,
  renderQuoteDocumentXml,
} from '@/features/export/wordExport';

const DIR = resolve(__dirname, '../../assets/templates');

function fixedPackage() {
  return JSON.stringify({
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
}

function extraAccessories() {
  return JSON.stringify([
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
}

describe('reference Word quote template renderer', () => {
  it('clones product/fixed/extra rows and replaces quote placeholders', async () => {
    const quote = calculateQuote({
      customerName: 'Anh Tú',
      customerPhone: '0909123456',
      customerEmail: 'tu@owin.vn',
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
          specs: [{ key: 'Loại Kính', value: 'Kính cường lực 8mm' }],
          dimensions: [{ widthM: 1.196, heightM: 1.796, quantity: 1 }],
          accessories: [],
          fixedAccessoryPackage: fixedPackage(),
          extraAccessories: extraAccessories(),
        },
      ],
    });

    const zip = new PizZip(readFileSync(resolve(DIR, 'Template_Bao_Gia.docx')));
    const xml = await renderQuoteDocumentXml(zip, quote);

    expect(xml).toContain('Anh Tú');
    expect(xml).toContain('S1');
    expect(xml).toContain('Cửa sổ mở quay 1 cánh');
    expect(xml).toContain('4.296.000');
    expect(xml).toContain('Bộ phụ kiện Kinlong');
    expect(xml).toContain('Tay nắm');
    expect(xml).toContain('Keo silicone');
    expect(xml).not.toContain('Keo silicone x');
    expect(xml).toContain('Nẹp phát sinh');
    expect(xml).toContain('5.496.000');
    expect(xml).toContain('5.400.000');
    expect(xml).toContain('4.400.000');
    // Unified product-row pipeline: no leftover marker shells / orphan x.
    expect(xml).not.toMatch(/\{(?:stt|ma_sp|anh_sp|mo_ta|bo_pk_ten|pk_ten|ps_ten|tong_tien)\}/);
    expect(xml).not.toMatch(/>\s*x\s*</);
    expect(xml).not.toContain('{pk_sl_item}');
    // Product block rows should prefer staying together across page breaks.
    expect(xml).toContain('w:cantSplit');
    expect(xml).toContain('w:keepNext');
    // Identity merge present for multi-row item blocks.
    expect(xml).toContain('w:vMerge');
  });

  it('vMerges the description column across an item with multiple size lines', async () => {
    const quote = calculateQuote({
      customerName: 'Chị Oanh',
      customerPhone: '0900000000',
      customerAddress: 'Hà Tĩnh',
      depositVnd: 0,
      items: [
        {
          productCode: 'S3',
          quoteItemCode: 'S3',
          itemName: 'Cửa sổ lùa VIP',
          category: 'Cửa Sổ',
          groupName: 'Cửa Sổ',
          unit: 'M2',
          unitPriceVnd: 2500000,
          coverImagePath: null,
          specs: [{ key: 'Loại Kính', value: 'Kính dán an toàn 6.38mm' }],
          dimensions: [
            { widthM: 1.25, heightM: 1.25, quantity: 1 },
            { widthM: 1.25, heightM: 1.26, quantity: 1 },
            { widthM: 1.25, heightM: 1.3, quantity: 2 },
          ],
          accessories: [],
          fixedAccessoryPackage: fixedPackage(),
          extraAccessories: null,
        },
      ],
    });

    const zip = new PizZip(readFileSync(resolve(DIR, 'Template_Bao_Gia.docx')));
    const xml = await renderQuoteDocumentXml(zip, quote);

    // First data row restarts 4 vMerge columns: STT, Mã SP, Ảnh, and now Mô tả.
    const restarts = xml.match(/w:vMerge w:val="restart"/g) ?? [];
    expect(restarts.length).toBe(4);
    // The product description appears once (merged), not repeated per size line.
    expect(xml.match(/Cửa sổ lùa VIP/g)?.length).toBe(1);
  });
});

describe('reference Word catalogue template renderer', () => {
  it('contain-fits at 95% until either width or height reaches the cell limit', () => {
    expect(fitImageDimensionsToEmuBox(1600, 900, 1000, 1000)).toEqual({ cx: 1000, cy: 563 });
    expect(fitImageDimensionsToEmuBox(800, 1600, 1000, 1000)).toEqual({ cx: 500, cy: 1000 });
  });

  it('clones category/product/accessory rows from catalogue template', async () => {
    const product: ProductRecord = {
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
      coverImagePath: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      gallery: [],
      rawSizeText: '1.196 x 1.796',
      rawPriceText: null,
      specs: [
        { key: 'Loại Kính', value: 'Kính cường lực 8mm', sortOrder: 0 },
        { key: 'Độ Dày', value: '2 mm', sortOrder: 1 },
        { key: 'Song Nhôm Bảo Vệ', value: '', sortOrder: 2 },
      ],
      accessories: [],
      fixedAccessoryPackage: fixedPackage(),
      extraAccessories: extraAccessories(),
      isFeatured: false,
      isPublic: true,
      folderPath: null,
      createdAt: '2026-07-08T00:00:00.000Z',
    };

    const zip = new PizZip(readFileSync(resolve(DIR, 'Template_Bang_Gia.docx')));
    const xml = await renderBangGiaDocumentXml(zip, [product]);

    expect(xml).toContain('I. CỬA SỔ');
    expect(xml).toContain('Cửa Sổ Mở Quay 1 Cánh');
    expect(xml).toContain('Kính Cường Lực 8mm');
    expect(xml).toContain('Độ Dày: 2 mm');
    expect(xml).not.toContain('Độ Dày: 2 Mm');
    // Empty-value specs keep the key only (no trailing colon).
    expect(xml).toContain('Song Nhôm Bảo Vệ');
    expect(xml).not.toMatch(/Song Nhôm Bảo Vệ:\s*</);
    expect(xml).toContain('Bộ phụ kiện Kinlong');
    expect(xml).toContain('Nẹp Phát Sinh');
    // Line money = round(đồng), not floor 100k: 1.196×1.796×2.000.000 → 4.296.032
    expect(xml).toContain('4.296.032');
    // product + fixed(2×500k) + extra(200k) = 5.496.032
    expect(xml).toContain('5.496.032');
    expect(xml).not.toMatch(/\{(?:category|product_info_block|accessory_block|tong_tien)\}/);
    // Category + product + accessory block keep-together markers.
    expect(xml).toContain('w:cantSplit');
    expect(xml).toContain('w:keepNext');
    // Catalogue product images use rect geometry and are sized only after all content rows.
    // The test item is 1530 + 1530 + 451 twips; after the merged-cell margins the test
    // image fills the exact 95% width/height box used by the renderer.
    expect(xml).toContain('prst="rect"');
    const extents = [...xml.matchAll(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/g)].map((m) => ({
      cx: Number(m[1]),
      cy: Number(m[2]),
    }));
    // Wider image column (~5.6/26 share) → larger max cx than the old 1.68M box.
    const catalogueMaxCx = 1_921_459;
    for (const e of extents) {
      expect(e.cx).toBeLessThanOrEqual(catalogueMaxCx);
      expect(e.cy).toBeLessThanOrEqual(150 * 36_000); // page-safe height cap
    }
    // At least one product photo fills the wider cell (contain-fit hits width or height).
    expect(extents.some((e) => e.cx >= 1_800_000 || e.cy >= 1_800_000)).toBe(true);
    expect(xml).toContain('<w:trHeight w:val="1530" w:hRule="atLeast"/>');
    expect(xml).toContain('<w:trHeight w:val="340" w:hRule="atLeast"/>');
    // Logo/title/column template must appear once only; no Word repeat-header marker remains.
    expect(xml).not.toContain('<w:tblHeader');

    // Real Web exporter geometry: one header table plus one detail table,
    // both using the same full-width fixed 10-column grid.
    const tables = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map((match) => match[0]);
    expect(tables).toHaveLength(2);
    tables.forEach((table) => {
      expect(table).toContain('<w:tblW w:w="14515" w:type="dxa"/>');
      expect(table).toContain('<w:tblLayout w:type="fixed"/>');
      const grid = [...table.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"[^>]*\/>/g)].map((match) => Number(match[1]));
      expect(grid).toHaveLength(10);
      expect(grid.reduce((sum, width) => sum + width, 0)).toBe(14515);
    });

    // Merged continuation cells need explicit borders, otherwise Word shows
    // broken STT/image/total outlines below the product row.
    const continuationCells = [...tables[1].matchAll(/<w:tc\b(?:(?!<\/w:tc>)[\s\S])*?<w:vMerge\s*\/>[\s\S]*?<\/w:tc>/g)];
    expect(continuationCells.length).toBeGreaterThan(0);
    continuationCells.forEach((match) => expect(match[0]).toContain('<w:tcBorders>'));
  });

  it('protects catalogue Word export as read-only with edit password 222333', async () => {
    expect(CATALOGUE_WORD_EDIT_PASSWORD).toBe('222333');

    const salt = new Uint8Array(16).fill(7);
    const hash = await computeWordProtectionHash(CATALOGUE_WORD_EDIT_PASSWORD, salt, 1);
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(hash.length).toBeGreaterThan(40);

    const zip = new PizZip(readFileSync(resolve(DIR, 'Template_Bang_Gia.docx')));
    await applyCatalogueReadOnlyProtection(zip, CATALOGUE_WORD_EDIT_PASSWORD);
    const settings = zip.file('word/settings.xml')?.asText() ?? '';

    expect(settings).toContain('w:documentProtection');
    expect(settings).toContain('w:edit="readOnly"');
    expect(settings).toContain('w:enforcement="1"');
    expect(settings).toContain('w:cryptAlgorithmSid="14"');
    expect(settings).toContain('w:cryptSpinCount="100000"');
    expect(settings).toMatch(/w:hashValue="[^"]+"/);
    expect(settings).toMatch(/w:saltValue="[^"]+"/);
    // Password itself must not appear in cleartext inside the package.
    expect(settings).not.toContain('222333');
  });
});
