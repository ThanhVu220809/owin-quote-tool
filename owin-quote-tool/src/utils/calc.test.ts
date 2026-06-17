import { describe, it, expect } from 'vitest';
import {
  tinhKhoiLuong,
  tinhThanhTien,
  tinhTienPhuKien,
  formatHienThiKhoiLuong,
} from '@/utils/calc';
import { formatVND, formatSoVND } from '@/utils/format';

/* ───────────────── TEST 1.1 — Khối lượng theo 3 hệ ĐVT (BR-3) ───────────────── */
describe('TEST 1.1 — tinhKhoiLuong (BR-3)', () => {
  it('m²: 1.196 × 1.796 × 1 = 2.148016 (full precision)', () => {
    expect(tinhKhoiLuong('m²', 1.196, 1.796, 1)).toBeCloseTo(2.148016, 10);
  });
  it('md: (1.2 + 2.4) × 2 = 7.2', () => {
    expect(tinhKhoiLuong('md', 1.2, 2.4, 2)).toBeCloseTo(7.2, 10);
  });
  it('Bộ: sl = 2 → 2 (bỏ qua rộng/cao)', () => {
    expect(tinhKhoiLuong('Bộ', 0, 0, 2)).toBe(2);
    expect(tinhKhoiLuong('Bộ', 999, 999, 2)).toBe(2); // rộng/cao không ảnh hưởng
  });
});

/* ──────── TEST 1.2 — Thành tiền (BR-1 quy tắc app mới: làm tròn KL 3 số lẻ rồi nhân) ──────── */
describe('TEST 1.2 — tinhThanhTien (BR-1) — quy tắc app mới', () => {
  it('S1: round3(1.196 × 1.796 × 1)=2.148 × 2.000.000 = 4296000', () => {
    expect(tinhThanhTien('m²', 1.196, 1.796, 1, 2000000)).toBe(4296000);
  });
  it('S2: round3(1.194 × 1.794 × 1)=2.142 × 2.000.000 = 4284000', () => {
    expect(tinhThanhTien('m²', 1.194, 1.794, 1, 2000000)).toBe(4284000);
  });
  it('Hệ Bộ S6: sl=1 × 2.000.000 = 2000000 (không dính rộng/cao)', () => {
    expect(tinhThanhTien('Bộ', 0, 0, 1, 2000000)).toBe(2000000);
  });
  it('Phụ kiện: sl=2 × 500.000 = 1000000', () => {
    expect(tinhTienPhuKien(2, 500000)).toBe(1000000);
  });
});

/* ───────── BR-2 — Khối lượng hiển thị (3 số lẻ) = đúng số đem nhân ở BR-1 ───────── */
describe('BR-2 — formatHienThiKhoiLuong = số dùng để nhân (quy tắc app mới)', () => {
  it('2.148016 → 2.148', () => {
    expect(formatHienThiKhoiLuong(2.148016)).toBe(2.148);
  });
  it('số hiển thị ĐƯỢC dùng để nhân: 2.148 × 2.000.000 = 4296000 = thành tiền', () => {
    const klHienThi = formatHienThiKhoiLuong(tinhKhoiLuong('m²', 1.196, 1.796, 1));
    expect(Math.round(klHienThi * 2000000)).toBe(4296000);
    expect(tinhThanhTien('m²', 1.196, 1.796, 1, 2000000)).toBe(4296000);
  });
});

/* ───────────────────────── TEST 1.3 — formatVND ───────────────────────── */
describe('TEST 1.3 — formatVND', () => {
  it('4296032 → "4.296.032đ"', () => {
    expect(formatVND(4296032)).toBe('4.296.032đ');
    expect(formatSoVND(4296032)).toBe('4.296.032');
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
