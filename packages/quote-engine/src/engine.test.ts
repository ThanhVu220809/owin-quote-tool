import { describe, it, expect } from 'vitest';
import {
  calculateDimensionQuantity,
  calculateLegacyAccessoryLineTotal,
  calculateProductSubtotal,
  calculateQuoteTotals,
  roundMoneyToVnd,
} from './engine';

/**
 * Chạy trọn chuỗi BR-3 → BR-1 → BR-1b như QuoteView/wordExport ghép lại,
 * để bắt lỗi khi từng hàm vẫn đúng nhưng thứ tự làm tròn bị ghép sai.
 */
function priceLine(input: {
  unit: 'M2' | 'METER' | 'BO';
  widthM?: number;
  heightM?: number;
  quantity: number;
  unitPriceVnd: number;
  accessories?: Array<{ quantityPerSet: number; unitPriceVnd: number; isEnabled?: boolean }>;
}) {
  const calculatedQty = calculateDimensionQuantity(input);
  const productVnd = roundMoneyToVnd(calculatedQty * input.unitPriceVnd);
  const accessoryVnd = (input.accessories ?? []).reduce(
    (sum, accessory) => sum + calculateLegacyAccessoryLineTotal(accessory, input.quantity),
    0,
  );
  return { calculatedQty, productVnd, accessoryVnd, lineTotalVnd: productVnd + accessoryVnd };
}

describe('quoteEngine — chuỗi tính một báo giá đầy đủ', () => {
  it('S1 m² + phụ kiện bật/tắt → tổng dòng 5.296.000đ', () => {
    const line = priceLine({
      unit: 'M2',
      widthM: 1.196,
      heightM: 1.796,
      quantity: 1,
      unitPriceVnd: 2_000_000,
      accessories: [
        { quantityPerSet: 2, unitPriceVnd: 500_000 },
        { quantityPerSet: 1, unitPriceVnd: 999_999, isEnabled: false },
      ],
    });

    expect(line.calculatedQty).toBe(2.148);
    expect(line.productVnd).toBe(4_296_000);
    expect(line.accessoryVnd).toBe(1_000_000); // phụ kiện tắt bị loại
    expect(line.lineTotalVnd).toBe(5_296_000);
  });

  it('báo giá nhiều dòng: tổng → làm tròn xuống 100.000 → trừ tạm ứng', () => {
    const s1 = priceLine({
      unit: 'M2', widthM: 1.196, heightM: 1.796, quantity: 1, unitPriceVnd: 2_000_000,
      accessories: [{ quantityPerSet: 2, unitPriceVnd: 500_000 }],
    });
    const s2 = priceLine({ unit: 'M2', widthM: 1.194, heightM: 1.794, quantity: 1, unitPriceVnd: 2_000_000 });
    const s6 = priceLine({ unit: 'BO', widthM: 9, heightM: 9, quantity: 3, unitPriceVnd: 2_000_000 });

    expect(s2.productVnd).toBe(4_284_000);
    expect(s6.productVnd).toBe(6_000_000); // hệ Bộ bỏ qua rộng/cao

    const totals = calculateQuoteTotals({
      subtotalProductVnd: calculateProductSubtotal([
        { lineTotalVnd: s1.productVnd },
        { lineTotalVnd: s2.productVnd },
        { lineTotalVnd: s6.productVnd },
      ]),
      subtotalAccessoryVnd: s1.accessoryVnd + s2.accessoryVnd + s6.accessoryVnd,
      depositVnd: 5_000_000,
    });

    expect(totals.subtotalProductVnd).toBe(14_580_000);
    expect(totals.subtotalAccessoryVnd).toBe(1_000_000);
    expect(totals.totalVnd).toBe(15_580_000);
    expect(totals.roundedTotalVnd).toBe(15_500_000);
    expect(totals.balanceVnd).toBe(10_500_000);
  });

  it('dòng md: KL = (rộng + cao) × sl', () => {
    const line = priceLine({ unit: 'METER', widthM: 1.2, heightM: 2.4, quantity: 2, unitPriceVnd: 150_000 });
    expect(line.calculatedQty).toBe(7.2);
    expect(line.productVnd).toBe(1_080_000);
  });

  it('làm tròn tiền MỘT LẦN mỗi dòng, không làm tròn lại ở tổng', () => {
    // 3 dòng lẻ 0,5đ: nếu làm tròn từng dòng thì mỗi dòng lên 1đ → tổng 3đ.
    const lines = [1, 2, 3].map(() =>
      priceLine({ unit: 'BO', quantity: 1, unitPriceVnd: 0.5 }),
    );
    expect(lines.map((l) => l.productVnd)).toEqual([1, 1, 1]);
    expect(calculateProductSubtotal(lines.map((l) => ({ lineTotalVnd: l.lineTotalVnd })))).toBe(3);
  });
});
