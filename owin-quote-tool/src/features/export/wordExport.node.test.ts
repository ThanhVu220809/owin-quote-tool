import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import type { ProductRecord } from '@/types/models';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import { renderBangGiaDocumentXml, renderQuoteDocumentXml } from '@/features/export/wordExport';

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
    expect(xml).not.toMatch(/\{(?:stt|ma_sp|anh_sp|mo_ta|bo_pk_ten|pk_ten|ps_ten|tong_tien)\}/);
    // Product block rows should prefer staying together across page breaks.
    expect(xml).toContain('w:cantSplit');
    expect(xml).toContain('w:keepNext');
  });
});

describe('reference Word catalogue template renderer', () => {
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
      coverImagePath: null,
      gallery: [],
      rawSizeText: '1.196 x 1.796',
      rawPriceText: null,
      specs: [
        { key: 'Loại Kính', value: 'Kính cường lực 8mm', sortOrder: 0 },
        { key: 'Song Nhôm Bảo Vệ', value: '', sortOrder: 1 },
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
    // Empty-value specs keep the key only (no trailing colon).
    expect(xml).toContain('Song Nhôm Bảo Vệ');
    expect(xml).not.toMatch(/Song Nhôm Bảo Vệ:\s*</);
    expect(xml).toContain('Bộ phụ kiện Kinlong');
    expect(xml).toContain('Nẹp Phát Sinh');
    expect(xml).toContain('4.200.000');
    expect(xml).toContain('5.400.000');
    expect(xml).not.toMatch(/\{(?:category|product_info_block|accessory_block|tong_tien)\}/);
    // Category + product + accessory block keep-together markers.
    expect(xml).toContain('w:cantSplit');
    expect(xml).toContain('w:keepNext');
  });
});
