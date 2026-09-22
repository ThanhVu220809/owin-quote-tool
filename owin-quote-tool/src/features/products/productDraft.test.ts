import { describe, expect, it } from 'vitest';
import {
  buildRawSizeText,
  calculateSampleQuantity,
  changedProductFields,
  formatSampleQuantity,
  parseDecimalText,
  parseRawSizeText,
  type SaveProductInput,
} from '@/features/products/productDraft';

/**
 * Khoá công thức của form sản phẩm sau khi tách ra khỏi component: số lượng mẫu,
 * kích thước mẫu và patch gửi lên Supabase phải giữ đúng như bản cũ.
 */
describe('kích thước mẫu', () => {
  it('đọc "1.80 x 2.20" thành rộng/cao', () => {
    expect(parseRawSizeText('1.80 x 2.20')).toEqual({ width: '1.80', height: '2.20' });
    expect(parseRawSizeText('1,5X2')).toEqual({ width: '1,5', height: '2' });
    expect(parseRawSizeText('2.4*1.2')).toEqual({ width: '2.4', height: '1.2' });
  });

  it('trả rỗng khi thiếu dữ liệu', () => {
    expect(parseRawSizeText(null)).toEqual({ width: '', height: '' });
    expect(parseRawSizeText('1.80')).toEqual({ width: '', height: '' });
  });

  it('nhận dấu phẩy thập phân', () => {
    expect(parseDecimalText('1,85')).toBe(1.85);
    expect(parseDecimalText('  2.5 m ')).toBe(2.5);
    expect(parseDecimalText('abc')).toBe(0);
  });

  it('ghi lại chuỗi kích thước với 2 số lẻ, bỏ khi thiếu chiều', () => {
    expect(buildRawSizeText('1,8', '2.2')).toBe('1.80 x 2.20');
    expect(buildRawSizeText('1.8', '0')).toBeNull();
    expect(buildRawSizeText('', '2.2')).toBeNull();
  });
});

describe('số lượng mẫu theo đơn vị', () => {
  it('m² = rộng × cao', () => {
    expect(calculateSampleQuantity('M2', '1.8', '2.2')).toBe(3.96);
  });

  it('md = rộng + cao', () => {
    expect(calculateSampleQuantity('METER', '1.8', '2.2')).toBe(4);
  });

  it('bộ luôn là 1', () => {
    expect(calculateSampleQuantity('BO', '1.8', '2.2')).toBe(1);
  });

  it('làm tròn 3 số lẻ', () => {
    expect(calculateSampleQuantity('M2', '1.234', '2.345')).toBe(2.894);
  });

  it('hiển thị bỏ đuôi 0', () => {
    expect(formatSampleQuantity(1)).toBe('1');
    expect(formatSampleQuantity(3.96)).toBe('3.96');
    expect(formatSampleQuantity(2.894)).toBe('2.894');
  });
});

describe('patch gửi lên Supabase', () => {
  const base = {
    id: 'p1',
    code: 'C1',
    name: 'Cửa đi',
    unitPriceVnd: 1_000,
    specs: [{ key: 'Màu', value: 'Trắc', sortOrder: 0 }],
  } as unknown as SaveProductInput;

  it('lần đầu gửi trọn bản nháp', () => {
    expect(changedProductFields(null, base)).toBe(base);
  });

  it('chỉ gửi field đã đổi, luôn kèm id + code', () => {
    const next = { ...base, unitPriceVnd: 1_200 } as SaveProductInput;
    expect(changedProductFields(base, next)).toEqual({ id: 'p1', code: 'C1', unitPriceVnd: 1_200 });
  });

  it('so sánh sâu nên mảng không đổi thì không gửi lại', () => {
    const next = { ...base, specs: [{ key: 'Màu', value: 'Trắc', sortOrder: 0 }] } as SaveProductInput;
    expect(changedProductFields(base, next)).toEqual({ id: 'p1', code: 'C1' });
  });

  it('gửi mảng khi nội dung bên trong đổi', () => {
    const next = { ...base, specs: [{ key: 'Màu', value: 'Lim', sortOrder: 0 }] } as SaveProductInput;
    expect(changedProductFields(base, next)).toEqual({
      id: 'p1',
      code: 'C1',
      specs: [{ key: 'Màu', value: 'Lim', sortOrder: 0 }],
    });
  });
});
