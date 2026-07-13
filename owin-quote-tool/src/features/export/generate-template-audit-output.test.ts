/**
 * Generate current-tool Bảng giá / Báo giá DOCX into template-audit folder.
 * Run: npx vitest run scripts/generate-template-audit-output.mts
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import type { ProductRecord } from '@/types/models';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import { renderBangGiaDocumentXml, renderQuoteDocumentXml } from '@/features/export/wordExport';

const ROOT = resolve(__dirname, '../../..');
const OUT = mkdtempSync(resolve(tmpdir(), 'owin-template-audit-'));
const TPL = resolve(ROOT, 'src/assets/templates');

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe('generate template audit outputs', () => {
  it('writes bang-gia and bao-gia docx from current tool pipeline', async () => {
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
      customerName: 'KHÁCH HÀNG KIỂM THỬ',
      customerPhone: '0000000000',
      customerEmail: '',
      customerAddress: 'DỮ LIỆU MẪU - KHÔNG PHẢI KHÁCH THẬT',
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

    const bangZip = new PizZip(readFileSync(resolve(TPL, 'Template_Bang_Gia.docx')));
    const bangXml = await renderBangGiaDocumentXml(bangZip, [product]);
    bangZip.file('word/document.xml', bangXml);
    writeFileSync(resolve(OUT, 'bang-gia-current.docx'), bangZip.generate({ type: 'nodebuffer' }));

    const baoZip = new PizZip(readFileSync(resolve(TPL, 'Template_Bao_Gia.docx')));
    const baoXml = await renderQuoteDocumentXml(baoZip, quote);
    baoZip.file('word/document.xml', baoXml);
    writeFileSync(resolve(OUT, 'bao-gia-current.docx'), baoZip.generate({ type: 'nodebuffer' }));

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
        hasCustomer: baoXml.includes('KHÁCH HÀNG KIỂM THỬ'),
        noBlankEmailToken: !baoXml.includes('{email}'),
        leftoverTokens: [...baoXml.matchAll(/\{[a-zA-Z0-9_./%-]+\}/g)].map((m) => m[0]),
        orphanX: />\s*x\s*</.test(baoXml),
      },
    };
    writeFileSync(resolve(OUT, 'structure-check.json'), JSON.stringify(notes, null, 2));

    expect(notes.bangGia.hasCategory).toBe(true);
    expect(notes.bangGia.hasEmptySpecKey).toBe(true);
    expect(notes.bangGia.leftoverTokens).toEqual([]);
    expect(notes.baoGia.hasCustomer).toBe(true);
    expect(notes.baoGia.noBlankEmailToken).toBe(true);
    expect(notes.baoGia.orphanX).toBe(false);
    expect(notes.baoGia.leftoverTokens).toEqual([]);
  });
});
