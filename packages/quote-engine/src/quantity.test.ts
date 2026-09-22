import { describe, it, expect } from 'vitest';
import {
  calculateBoQuantity,
  calculateDimensionQuantity,
  calculateM2Quantity,
  calculateMeterQuantity,
  roundMoneyToVnd,
  roundQuantity3,
} from './quantity';

/* ────────────── BR-3 — Khối lượng theo 3 hệ ĐVT ────────────── */
describe('BR-3 — khối lượng theo hệ ĐVT', () => {
  it('m²: KL = rộng × cao × sl', () => {
    // 1.196 × 1.796 × 1 = 2.148016 → làm tròn 3 số lẻ → 2.148
    expect(calculateM2Quantity(1.196, 1.796, 1)).toBe(2.148);
    expect(calculateM2Quantity(1.194, 1.794, 1)).toBe(2.142);
  });

  it('md: KL = (rộng + cao) × sl', () => {
    expect(calculateMeterQuantity(1.2, 2.4, 2)).toBe(7.2);
  });

  it('md không có kích thước → dùng thẳng SL', () => {
    expect(calculateMeterQuantity(0, 0, 5)).toBe(5);
    expect(calculateMeterQuantity(null, null, 5)).toBe(5);
  });

  it('Bộ: KL = sl, rộng/cao bị bỏ qua hoàn toàn', () => {
    expect(calculateBoQuantity(2)).toBe(2);
    expect(calculateDimensionQuantity({ unit: 'BO', widthM: 999, heightM: 999, quantity: 2 })).toBe(2);
  });

  it('calculateDimensionQuantity phân nhánh đúng theo đơn vị', () => {
    const dims = { widthM: 1.196, heightM: 1.796, quantity: 1 };
    expect(calculateDimensionQuantity({ ...dims, unit: 'M2' })).toBe(2.148);
    expect(calculateDimensionQuantity({ ...dims, unit: 'METER' })).toBe(2.992); // 1.196 + 1.796
    expect(calculateDimensionQuantity({ ...dims, unit: 'BO' })).toBe(1);
  });

  it('đơn vị rỗng → coi như m² (mặc định)', () => {
    expect(calculateDimensionQuantity({ unit: null, widthM: 2, heightM: 3, quantity: 1 })).toBe(6);
  });
});

/* ────────────── BR-2 — Khối lượng hiển thị = số đem nhân ────────────── */
describe('BR-2 — roundQuantity3: KL hiển thị đúng bằng số đem nhân', () => {
  it('2.148016 → 2.148', () => {
    expect(roundQuantity3(2.148016)).toBe(2.148);
  });

  it('làm tròn HALF_UP ở số lẻ thứ 4', () => {
    expect(roundQuantity3(1.0005)).toBe(1.001);
    expect(roundQuantity3(1.0004)).toBe(1.0);
  });

  it('nhận chuỗi số và giá trị rỗng', () => {
    expect(roundQuantity3('2.148016')).toBe(2.148);
    expect(roundQuantity3(null)).toBe(0);
    expect(roundQuantity3(undefined)).toBe(0);
    expect(roundQuantity3('không phải số')).toBe(0);
  });

  it('số hiển thị CHÍNH LÀ số dùng để nhân tiền', () => {
    const displayed = calculateM2Quantity(1.196, 1.796, 1);
    expect(displayed).toBe(2.148);
    expect(roundMoneyToVnd(displayed * 2_000_000)).toBe(4_296_000);
  });
});

/* ────────────── BR-1 — Thành tiền: round3 KL rồi nhân, round tiền 1 lần ────────────── */
describe('BR-1 — thành tiền = round3(KL) × đơn giá, làm tròn tiền một lần cuối', () => {
  const amountVnd = (w: number, h: number, sl: number, price: number) =>
    roundMoneyToVnd(calculateM2Quantity(w, h, sl) * price);

  it('S1: 1.196×1.796×1 @2.000.000 → 4.296.000đ', () => {
    expect(amountVnd(1.196, 1.796, 1, 2_000_000)).toBe(4_296_000);
  });

  it('S2: 1.194×1.794×1 @2.000.000 → 4.284.000đ', () => {
    expect(amountVnd(1.194, 1.794, 1, 2_000_000)).toBe(4_284_000);
  });

  it('làm tròn KL TRƯỚC khi nhân — không dùng KL full precision', () => {
    const rawArea = 1.196 * 1.796; // 2.148016
    // Nhân trực tiếp KL chưa làm tròn cho ra số khác → BR-1 phải chọn số đã round3.
    expect(Math.round(rawArea * 2_000_000)).toBe(4_296_032);
    expect(amountVnd(1.196, 1.796, 1, 2_000_000)).toBe(4_296_000);
  });

  it('hệ Bộ: thành tiền = sl × đơn giá, không dính rộng/cao', () => {
    const setQty = calculateDimensionQuantity({ unit: 'BO', widthM: 9, heightM: 9, quantity: 3 });
    expect(roundMoneyToVnd(setQty * 2_000_000)).toBe(6_000_000);
  });
});

describe('roundMoneyToVnd — tiền luôn là số nguyên đồng', () => {
  it('làm tròn về đồng', () => {
    expect(roundMoneyToVnd(1000.4)).toBe(1000);
    expect(roundMoneyToVnd(1000.5)).toBe(1001);
  });

  it('rỗng / không phải số → 0', () => {
    expect(roundMoneyToVnd(null)).toBe(0);
    expect(roundMoneyToVnd('abc')).toBe(0);
  });
});
