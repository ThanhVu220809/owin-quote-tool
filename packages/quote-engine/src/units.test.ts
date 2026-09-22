import { describe, it, expect } from 'vitest';
import { isAreaUnit, isMeterUnit, isSetUnit, normalizeUnit } from './units';

/**
 * BR-3 — chuẩn hoá đơn vị về 3 hệ ProductUnit: M2 | METER | BO.
 * Nhãn hiển thị cũ ('m²', 'md', 'Bộ') và biến thể có dấu đều phải map đúng.
 */
describe('normalizeUnit — nhận diện 3 hệ ĐVT', () => {
  it('map hệ BO từ mọi biến thể', () => {
    expect(normalizeUnit('BO')).toBe('BO');
    expect(normalizeUnit('bo')).toBe('BO');
    expect(normalizeUnit('Bộ')).toBe('BO');
    expect(normalizeUnit('Bộ 2 cánh')).toBe('BO');
  });

  it('map hệ M2 từ mọi biến thể', () => {
    expect(normalizeUnit('M2')).toBe('M2');
    expect(normalizeUnit('m2')).toBe('M2');
    expect(normalizeUnit('m²')).toBe('M2');
    expect(normalizeUnit('mét vuông')).toBe('M2');
  });

  it('map hệ METER từ mọi biến thể', () => {
    expect(normalizeUnit('METER')).toBe('METER');
    expect(normalizeUnit('md')).toBe('METER');
    expect(normalizeUnit('mét dài')).toBe('METER');
  });

  it('rỗng / null / không nhận ra → M2 (mặc định an toàn)', () => {
    expect(normalizeUnit(null)).toBe('M2');
    expect(normalizeUnit(undefined)).toBe('M2');
    expect(normalizeUnit('')).toBe('M2');
    expect(normalizeUnit('cái')).toBe('M2');
  });

  it('bỏ qua hoa-thường và khoảng trắng thừa', () => {
    expect(normalizeUnit('  MD  ')).toBe('METER');
    expect(normalizeUnit('  bộ ')).toBe('BO');
  });
});

describe('isAreaUnit / isMeterUnit / isSetUnit — loại trừ lẫn nhau', () => {
  it('mỗi đơn vị chỉ khớp đúng một predicate', () => {
    expect([isAreaUnit('m²'), isMeterUnit('m²'), isSetUnit('m²')]).toEqual([true, false, false]);
    expect([isAreaUnit('md'), isMeterUnit('md'), isSetUnit('md')]).toEqual([false, true, false]);
    expect([isAreaUnit('Bộ'), isMeterUnit('Bộ'), isSetUnit('Bộ')]).toEqual([false, false, true]);
  });
});
