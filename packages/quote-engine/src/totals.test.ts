import { describe, it, expect } from 'vitest';
import {
  calculateBalance,
  calculateProductSubtotal,
  calculateQuoteTotals,
  calculateRoundedTotal,
} from './totals';

describe('calculateProductSubtotal — cộng dồn tiền dòng', () => {
  it('cộng lineTotalVnd của mọi dòng', () => {
    expect(calculateProductSubtotal([{ lineTotalVnd: 4_296_000 }, { lineTotalVnd: 4_284_000 }])).toBe(8_580_000);
  });

  it('danh sách rỗng → 0', () => {
    expect(calculateProductSubtotal([])).toBe(0);
  });
});

describe('BR-1b — calculateRoundedTotal', () => {
  it('tổng làm tròn xuống bội số 100.000', () => {
    expect(calculateRoundedTotal(5_296_000)).toBe(5_200_000);
  });
});

describe('calculateBalance — còn lại sau tạm ứng', () => {
  it('còn lại = tổng đã làm tròn − tạm ứng', () => {
    expect(calculateBalance(5_200_000, 1_000_000)).toBe(4_200_000);
  });

  it('không tạm ứng → còn lại = tổng', () => {
    expect(calculateBalance(5_200_000, null)).toBe(5_200_000);
    expect(calculateBalance(5_200_000, undefined)).toBe(5_200_000);
  });

  it('tạm ứng vượt tổng → còn lại kẹp về 0, không âm', () => {
    expect(calculateBalance(1_000_000, 5_000_000)).toBe(0);
  });

  it('tạm ứng âm bị kẹp về 0 (không tự cộng thêm tiền)', () => {
    expect(calculateBalance(5_200_000, -1_000_000)).toBe(5_200_000);
  });
});

describe('calculateQuoteTotals — tổng hợp cả báo giá', () => {
  it('tổng = SP + phụ kiện; làm tròn xuống 100.000; còn lại tính trên số ĐÃ làm tròn', () => {
    const totals = calculateQuoteTotals({
      subtotalProductVnd: 4_296_000,
      subtotalAccessoryVnd: 1_000_000,
      depositVnd: 2_000_000,
    });

    expect(totals).toEqual({
      subtotalProductVnd: 4_296_000,
      subtotalAccessoryVnd: 1_000_000,
      totalVnd: 5_296_000,
      roundedTotalVnd: 5_200_000,
      depositVnd: 2_000_000,
      balanceVnd: 3_200_000,
    });
  });

  it('còn lại dựa trên roundedTotal, KHÔNG dựa trên total gốc', () => {
    const totals = calculateQuoteTotals({
      subtotalProductVnd: 5_296_000,
      subtotalAccessoryVnd: 0,
      depositVnd: 0,
    });
    // 5.296.000 − 0 = 5.296.000 nếu dùng total gốc; đúng luật phải là 5.200.000.
    expect(totals.balanceVnd).toBe(5_200_000);
  });

  it('thiếu tạm ứng → coi như 0', () => {
    const totals = calculateQuoteTotals({ subtotalProductVnd: 1_000_000, subtotalAccessoryVnd: 0 });
    expect(totals.depositVnd).toBe(0);
    expect(totals.balanceVnd).toBe(1_000_000);
  });

  it('báo giá rỗng → mọi số bằng 0', () => {
    expect(calculateQuoteTotals({ subtotalProductVnd: 0, subtotalAccessoryVnd: 0 })).toEqual({
      subtotalProductVnd: 0,
      subtotalAccessoryVnd: 0,
      totalVnd: 0,
      roundedTotalVnd: 0,
      depositVnd: 0,
      balanceVnd: 0,
    });
  });
});
