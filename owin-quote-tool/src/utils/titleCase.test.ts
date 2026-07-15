import { describe, expect, it } from 'vitest';
import { titleCaseVi } from './titleCase';
import { normalizeCategoryName } from '@/config/categoryOrder';

describe('titleCaseVi', () => {
  it('capitalizes each Vietnamese word', () => {
    expect(titleCaseVi('cửa chính')).toBe('Cửa Chính');
    expect(titleCaseVi('cửa phụ')).toBe('Cửa Phụ');
    expect(titleCaseVi('cửa sổ mở quay')).toBe('Cửa Sổ Mở Quay');
    expect(titleCaseVi('vân gỗ trắc')).toBe('Vân Gỗ Trắc');
  });

  it('uppercases known acronyms', () => {
    expect(titleCaseVi('wc')).toBe('WC');
    expect(titleCaseVi('cửa phụ wc')).toBe('Cửa Phụ WC');
    expect(titleCaseVi('owin vip')).toBe('OWIN VIP');
  });
});

describe('normalizeCategoryName title case', () => {
  it('maps door categories to Title Case', () => {
    expect(normalizeCategoryName('cửa chính')).toBe('Cửa Chính');
    expect(normalizeCategoryName('Cửa chính')).toBe('Cửa Chính');
    expect(normalizeCategoryName('cửa phụ')).toBe('Cửa Phụ');
    expect(normalizeCategoryName('Wc')).toBe('WC');
    expect(normalizeCategoryName('cửa sổ')).toBe('Cửa Sổ');
    expect(normalizeCategoryName('phụ kiện')).toBe('Phụ Kiện');
  });
});
