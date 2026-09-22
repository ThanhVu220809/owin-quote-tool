import { describe, it, expect } from 'vitest';
import {
  roundDownToNearestMultiple,
  roundMoneyDownToHundredThousands,
  roundMoneyDownToHundreds,
} from './rounding';

/**
 * BR-1b — TỔNG báo giá làm tròn XUỐNG bội số 100.000.
 * Dùng floor để dòng "LÀM TRÒN" không bao giờ làm TĂNG số khách phải trả.
 */
describe('BR-1b — floor về bội số 100.000', () => {
  it('luôn làm tròn XUỐNG, không bao giờ lên', () => {
    expect(roundMoneyDownToHundredThousands(5_296_000)).toBe(5_200_000);
    expect(roundMoneyDownToHundredThousands(43_375_322)).toBe(43_300_000);
    // 99.999 → 0: floor không "cứu" số gần tròn lên trên.
    expect(roundMoneyDownToHundredThousands(99_999)).toBe(0);
  });

  it('số đã tròn bội số thì giữ nguyên', () => {
    expect(roundMoneyDownToHundredThousands(5_200_000)).toBe(5_200_000);
    expect(roundMoneyDownToHundredThousands(0)).toBe(0);
  });
});

describe('roundDownToNearestMultiple — hàm nền', () => {
  it('mặc định bội số 100', () => {
    expect(roundDownToNearestMultiple(1_234)).toBe(1_200);
  });

  it('nhận bội số tuỳ ý', () => {
    expect(roundDownToNearestMultiple(1_234, 1_000)).toBe(1_000);
    expect(roundDownToNearestMultiple(1_234, 10)).toBe(1_230);
  });

  it('rỗng / null / không phải số → 0', () => {
    expect(roundDownToNearestMultiple(null)).toBe(0);
    expect(roundDownToNearestMultiple(undefined)).toBe(0);
    expect(roundDownToNearestMultiple('')).toBe(0);
    expect(roundDownToNearestMultiple('abc')).toBe(0);
    expect(roundDownToNearestMultiple(Infinity)).toBe(0);
  });

  it('bội số 0 hoặc âm được kẹp về >= 1 (không chia cho 0)', () => {
    expect(roundDownToNearestMultiple(1_234.7, 0)).toBe(1_234);
    expect(roundDownToNearestMultiple(1_234, -100)).toBe(1_200);
  });

  it('số âm: floor đi xa khỏi 0 (ghi nhận hành vi hiện tại)', () => {
    expect(roundDownToNearestMultiple(-150, 100)).toBe(-200);
  });

  it('nhận chuỗi số', () => {
    expect(roundDownToNearestMultiple('5296000', 100_000)).toBe(5_200_000);
  });
});

describe('roundMoneyDownToHundreds — alias @deprecated', () => {
  it('vẫn là floor 100.000 (KHÔNG phải 100) — giữ tương thích tên cũ gây hiểu nhầm', () => {
    expect(roundMoneyDownToHundreds(5_296_000)).toBe(5_200_000);
    expect(roundMoneyDownToHundreds(5_296_000)).toBe(roundMoneyDownToHundredThousands(5_296_000));
  });
});
