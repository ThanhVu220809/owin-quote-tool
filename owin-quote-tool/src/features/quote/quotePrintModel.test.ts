import { describe, expect, it } from 'vitest';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import {
  accessoryItemText,
  buildQuotePrintAccessoryRows,
  compactNumber,
} from '@/features/quote/quotePrintModel';

/**
 * Khoá số của đường in / PDF. Bảng in tự tính lại tiền phụ kiện, độc lập với
 * quoteCalculator — lệch ở đây là bảng in và file Word/Excel nói hai con số khác nhau.
 */

type PrintItem = ReturnType<typeof calculateQuote>['items'][number];

function makeCalculatedItem(patch: Partial<PrintItem> = {}): PrintItem {
  return {
    fixedAccessoryPackage: null,
    extraAccessories: null,
    accessories: [],
    ...patch,
  } as unknown as PrintItem;
}

describe('số rút gọn trên bảng in', () => {
  it('bỏ đuôi 0, số 0 và số không hợp lệ thành chuỗi rỗng', () => {
    expect(compactNumber(3)).toBe('3');
    expect(compactNumber(2.5)).toBe('2.5');
    expect(compactNumber(1.23456)).toBe('1.235');
    expect(compactNumber(0)).toBe('');
    expect(compactNumber(null)).toBe('');
    expect(compactNumber('abc')).toBe('');
  });
});

describe('dòng mô tả phụ kiện trong bộ', () => {
  it('chỉ thêm "xN" khi số lượng lớn hơn 1', () => {
    expect(accessoryItemText('Bản lề', 4)).toBe('Bản lề x4');
    expect(accessoryItemText('Khoá', 1)).toBe('Khoá');
    expect(accessoryItemText('  ', 4)).toBe('');
  });
});

describe('bộ phụ kiện cố định', () => {
  it('ra đúng 1 dòng "Bộ", thành tiền = làm tròn(SL × đơn giá)', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({
        fixedAccessoryPackage: JSON.stringify({
          name: 'Bộ phụ kiện cửa đi',
          packageQuantity: 3,
          unitPrice: 550_555.5,
          items: [
            { name: 'Bản lề', quantity: 4 },
            { name: 'Khoá', quantity: 1 },
            { name: '', quantity: 2 },
          ],
        }),
      } as unknown as Partial<PrintItem>),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unit).toBe('Bộ');
    expect(rows[0].quantity).toBe('3');
    expect(rows[0].weight).toBe('3');
    expect(rows[0].unitPriceVnd).toBe(550_555.5);
    expect(rows[0].amountVnd).toBe(Math.round(3 * 550_555.5));
    expect(rows[0].descriptionLines).toEqual(['Bộ phụ kiện cửa đi:', '- Bản lề x4', '- Khoá']);
  });

  it('thiếu tên / SL thì rơi về nhãn và SL mặc định', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({
        fixedAccessoryPackage: JSON.stringify({ unitPriceVnd: 100_000, items: [] }),
      } as unknown as Partial<PrintItem>),
    );
    expect(rows[0].descriptionLines).toEqual(['Bộ phụ kiện đi kèm:']);
    expect(rows[0].quantity).toBe('1');
    expect(rows[0].amountVnd).toBe(100_000);
  });
});

describe('phụ kiện phát sinh', () => {
  it('md/m² lấy KL làm cơ sở tính tiền, BO lấy SL', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({
        extraAccessories: JSON.stringify([
          { name: 'Nẹp nhôm', unit: 'METER', quantity: 2, weight: 6.5, unitPrice: 100_000 },
          { name: 'Ke góc', unit: 'BO', quantity: 3, weight: 9, unitPrice: 50_000 },
          { name: 'Kính dán', unit: 'M2', quantity: 4, weight: 0, unitPrice: 200_000 },
        ]),
      } as unknown as Partial<PrintItem>),
    );
    expect(rows.map((row) => [row.unit, row.quantity, row.weight, row.amountVnd])).toEqual([
      ['md', '2', '6.5', 650_000],
      ['Bộ', '3', '', 150_000],
      ['m²', '4', '4', 800_000],
    ]);
  });

  it('bỏ dòng không tên và quy ĐVT lạ về Bộ', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({
        extraAccessories: JSON.stringify([
          { name: '   ', unit: 'BO', quantity: 1, unitPrice: 10_000 },
          { name: 'Phụ kiện lạ', unit: 'CAI', quantity: 2, weight: 5, unitPrice: 30_000 },
        ]),
      } as unknown as Partial<PrintItem>),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unit).toBe('Bộ');
    expect(rows[0].amountVnd).toBe(60_000);
  });

  it('bộ PK cố định đứng trước phụ kiện phát sinh', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({
        fixedAccessoryPackage: JSON.stringify({ name: 'Bộ A', packageQuantity: 1, unitPrice: 1_000, items: [] }),
        extraAccessories: JSON.stringify([{ name: 'Nẹp', unit: 'BO', quantity: 1, unitPrice: 2_000 }]),
      } as unknown as Partial<PrintItem>),
    );
    expect(rows.map((row) => row.descriptionLines[0])).toEqual(['Bộ A:', 'Nẹp']);
  });
});

describe('rơi về phụ kiện kiểu cũ', () => {
  const legacy = [
    { name: 'Khoá', note: 'Inox', enabled: true, quantityPerSet: 1, totalSet: 2, unitPriceVnd: 50_000, lineTotalVnd: 100_000 },
    { name: 'Tắt', note: null, enabled: false, quantityPerSet: 1, totalSet: 1, unitPriceVnd: 10_000, lineTotalVnd: 10_000 },
    { name: 'Không tiền', note: null, enabled: true, quantityPerSet: 1, totalSet: 1, unitPriceVnd: 0, lineTotalVnd: 0 },
  ];

  it('chỉ khi không có gói nào, và chỉ dòng bật + có tiền', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({ accessories: legacy } as unknown as Partial<PrintItem>),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].descriptionLines).toEqual(['Khoá', 'Inox']);
    expect(rows[0].unit).toBe('Bộ');
    expect(rows[0].quantity).toBe('1');
    expect(rows[0].weight).toBe('2');
    expect(rows[0].amountVnd).toBe(100_000);
  });

  it('có gói phát sinh thì bỏ qua phụ kiện kiểu cũ', () => {
    const rows = buildQuotePrintAccessoryRows(
      makeCalculatedItem({
        accessories: legacy,
        extraAccessories: JSON.stringify([{ name: 'Nẹp', unit: 'BO', quantity: 1, unitPrice: 2_000 }]),
      } as unknown as Partial<PrintItem>),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].descriptionLines).toEqual(['Nẹp']);
  });
});
