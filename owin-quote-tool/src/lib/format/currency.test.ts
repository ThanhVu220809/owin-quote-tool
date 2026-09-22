import { describe, it, expect } from 'vitest';
import { formatVND, formatVndNumber } from '@/lib/format/currency';

/* ───────────────────────── formatVND / formatVndNumber ───────────────────────── */
describe('formatVND', () => {
  it('4296032 → "4.296.032đ"', () => {
    expect(formatVND(4296032)).toBe('4.296.032đ');
    expect(formatVndNumber(4296032)).toBe('4.296.032');
  });
  it('0 → "0đ", không crash', () => {
    expect(formatVND(0)).toBe('0đ');
  });
  it('số âm không crash (-500000 → "-500.000đ")', () => {
    expect(formatVND(-500000)).toBe('-500.000đ');
  });
  it('số nhỏ < 1000 không thêm dấu chấm', () => {
    expect(formatVND(999)).toBe('999đ');
  });
});
