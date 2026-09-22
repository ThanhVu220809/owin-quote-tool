import { describe, expect, it } from 'vitest';
import type { QuoteItemInput } from '@/types/models';
import {
  packageShareForLine,
  rankingAmountForQuoteItem,
  sortQuoteItemsByMaxLineAmount,
  sumItemDimensionQuantity,
} from '@/features/quote/quoteItemOrder';
import { enrichFixedAccessoryPackageValue } from '@/lib/quoteEngine/fixedAccessoryRules';

function item(
  partial: Partial<QuoteItemInput> & Pick<QuoteItemInput, 'productCode' | 'itemName' | 'dimensions'>,
): QuoteItemInput {
  return {
    sourceType: 'CUSTOM',
    productId: null,
    quoteItemCode: partial.productCode,
    unit: 'M2',
    unitPriceVnd: 1_000_000,
    accessories: [],
    category: 'Cửa Chính',
    ...partial,
  };
}

function fixedPkg(quantity: number, unitPrice: number): string {
  return JSON.stringify({
    name: 'Bộ PK',
    items: [{ name: 'Khóa', quantity: 1 }],
    packageQuantity: quantity,
    unitPrice,
    total: quantity * unitPrice,
  });
}

describe('sumItemDimensionQuantity', () => {
  it('sums SL across lines', () => {
    expect(
      sumItemDimensionQuantity(
        item({
          productCode: 'A',
          itemName: 'A',
          dimensions: [
            { unit: 'M2', widthM: 1, heightM: 1, quantity: 2 },
            { unit: 'M2', widthM: 1, heightM: 1, quantity: 3 },
          ],
        }),
      ),
    ).toBe(5);
  });
});

describe('packageShareForLine', () => {
  it('allocates PK money by line SL / total SL', () => {
    // PK 2tr, tổng SL 4, dòng SL 2 → 1tr
    expect(packageShareForLine(2, 4, 2_000_000)).toBe(1_000_000);
    expect(packageShareForLine(1, 4, 2_000_000)).toBe(500_000);
  });
});

describe('rankingAmountForQuoteItem', () => {
  it('single line = SP line + full PK (giá tổng hạng mục)', () => {
    const one = item({
      productCode: 'one',
      itemName: 'one',
      unitPriceVnd: 2_000_000,
      dimensions: [{ unit: 'M2', widthM: 1, heightM: 1, quantity: 1 }], // 2tr
      fixedAccessoryPackage: fixedPkg(1, 500_000),
    });
    // 2tr + 0.5tr = 2.5tr
    expect(rankingAmountForQuoteItem(one)).toBe(2_500_000);
  });

  it('multi line: max(SP_dòng + PK_dòng), not sum of all lines', () => {
    // total SL = 1+1 = 2; PK total = 2 × 500k = 1tr → 500k per line
    const multi = item({
      productCode: 'multi',
      itemName: 'multi',
      unitPriceVnd: 1_000_000,
      dimensions: [
        { unit: 'M2', widthM: 1, heightM: 1, quantity: 1 }, // SP 1tr + PK 0.5tr = 1.5tr
        { unit: 'M2', widthM: 2, heightM: 2, quantity: 1 }, // SP 4tr + PK 0.5tr = 4.5tr ← max
      ],
      fixedAccessoryPackage: fixedPkg(2, 500_000),
    });
    expect(rankingAmountForQuoteItem(multi)).toBe(4_500_000);
  });
});

describe('sortQuoteItemsByMaxLineAmount', () => {
  it('orders by ranking score high→low (SP+PK share)', () => {
    const cheap = item({
      productCode: 'cheap',
      itemName: 'cheap',
      unitPriceVnd: 1_000_000,
      dimensions: [{ unit: 'M2', widthM: 1, heightM: 1, quantity: 1 }], // 1tr
    });
    const multi = item({
      productCode: 'multi',
      itemName: 'multi',
      unitPriceVnd: 1_000_000,
      dimensions: [
        { unit: 'M2', widthM: 1, heightM: 1, quantity: 1 },
        { unit: 'M2', widthM: 2, heightM: 2, quantity: 1 }, // 4tr + PK share
      ],
      fixedAccessoryPackage: fixedPkg(2, 500_000), // max = 4.5tr
    });
    const mid = item({
      productCode: 'mid',
      itemName: 'mid',
      unitPriceVnd: 2_000_000,
      dimensions: [{ unit: 'M2', widthM: 1, heightM: 1, quantity: 1 }], // 2tr
      fixedAccessoryPackage: fixedPkg(1, 800_000), // 2.8tr
    });

    expect(sortQuoteItemsByMaxLineAmount([cheap, multi, mid]).map((i) => i.productCode)).toEqual([
      'multi', // 4.5tr
      'mid', // 2.8tr
      'cheap', // 1tr
    ]);
  });
});

describe('fixed package auto quantity', () => {
  it('uses perUnit × total SL when not manual (legacy perUnit=1)', () => {
    const raw = JSON.stringify({
      name: 'Bộ PK',
      items: [{ name: 'Khóa', quantity: 1 }],
      packageQuantity: 1,
      unitPrice: 100_000,
    });
    const enriched = JSON.parse(enrichFixedAccessoryPackageValue(raw, 7) || '{}');
    expect(enriched.packageQuantity).toBe(7);
  });

  it('uses product base × total SL (3 × 2 = 6)', () => {
    const raw = JSON.stringify({
      name: 'Bộ PK 3 cánh',
      items: [{ name: 'Bản lề', quantity: 3 }],
      packageQuantity: 3,
      packageQuantityPerUnit: 3,
      unitPrice: 100_000,
    });
    const enriched = JSON.parse(enrichFixedAccessoryPackageValue(raw, 2) || '{}');
    expect(enriched.packageQuantity).toBe(6);
    expect(enriched.packageQuantityPerUnit).toBe(3);
  });

  it('keeps manual package quantity', () => {
    const raw = JSON.stringify({
      name: 'Bộ PK',
      items: [{ name: 'Khóa', quantity: 1 }],
      packageQuantity: 2,
      packageQuantityManual: true,
      packageQuantityPerUnit: 3,
      unitPrice: 100_000,
    });
    const enriched = JSON.parse(enrichFixedAccessoryPackageValue(raw, 7) || '{}');
    expect(enriched.packageQuantity).toBe(2);
  });
});
