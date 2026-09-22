import { describe, it, expect } from 'vitest';
import type { FixedAccessoryPackageLike } from './engineTypes';
import {
  enrichFixedAccessoryPackageValue,
  suggestFixedAccessories,
} from './fixedAccessoryRules';

const names = (packageName: string) => suggestFixedAccessories(packageName).map((item) => item.name);
const parse = (value: string | null): FixedAccessoryPackageLike =>
  JSON.parse(value ?? '{}') as FixedAccessoryPackageLike;

describe('suggestFixedAccessories — gợi ý phụ kiện theo tên bộ', () => {
  it('Cửa Thủy Lực', () => {
    expect(suggestFixedAccessories('Cửa Thủy Lực')).toEqual([
      { name: 'Bản Lề Sàn Alder', quantity: 2 },
      { name: 'Ngỗng Trên Dưới', quantity: 0 },
      { name: 'Tay Nắm KOLN', quantity: 2 },
      { name: 'Khóa Bi Ngang', quantity: 0 },
      { name: 'Chốt Cánh Phụ', quantity: 0 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ]);
  });

  it('không phân biệt dấu và hoa-thường', () => {
    expect(suggestFixedAccessories('cua thuy luc')).toEqual(suggestFixedAccessories('Cửa Thủy Lực'));
    expect(suggestFixedAccessories('CỬA THỦY LỰC')).toEqual(suggestFixedAccessories('Cửa Thủy Lực'));
  });

  it('Kinlong mở quay 1 cánh → 3 bản lề', () => {
    const items = suggestFixedAccessories('Bộ phụ kiện Kinlong Mở Quay 1 Cánh');
    expect(items).toEqual([
      { name: 'Khóa Đơn Điểm', quantity: 0 },
      { name: 'Bản Lề', quantity: 3 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ]);
  });

  it('Kinlong mở quay 2 cánh → 6 bản lề', () => {
    const hinge = suggestFixedAccessories('Kinlong Mở Quay 2 Cánh').find((i) => i.name === 'Bản Lề');
    expect(hinge?.quantity).toBe(6);
  });

  it('Lùa Vip 4 Cánh → 8 bánh xe, 4 chốt sập', () => {
    expect(suggestFixedAccessories('Lùa Vip 4 Cánh')).toEqual([
      { name: 'Bánh Xe', quantity: 8 },
      { name: 'Chốt Sập', quantity: 4 },
      { name: 'Khóa', quantity: 0 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ]);
  });

  it('Cửa sổ mở quay/hất', () => {
    expect(names('Cửa Sổ Mở Quay/Hất')).toEqual([
      'Tay Đa Điểm',
      'Thanh Chuyển Động Đa Điểm',
      'Bản Lề Chữ A',
      'Vật Tư Phụ',
    ]);
    // Khớp cả khi tên chỉ có "Cửa Sổ" + "Mở Quay" rời nhau.
    expect(names('Cửa Sổ nhôm Mở Quay')).toEqual(names('Cửa Sổ Mở Quay/Hất'));
  });

  it('mã SW-* → bộ tay đơn điểm', () => {
    expect(names('SW-100')).toEqual(['Tay Đơn Điểm', 'Bản Lề Chữ A', 'Vật Tư Phụ']);
    expect(names('Tay Đơn Điểm')).toEqual(['Tay Đơn Điểm', 'Bản Lề Chữ A', 'Vật Tư Phụ']);
  });

  it('tên rỗng hoặc không khớp luật nào → không gợi ý gì', () => {
    expect(suggestFixedAccessories(null)).toEqual([]);
    expect(suggestFixedAccessories(undefined)).toEqual([]);
    expect(suggestFixedAccessories('')).toEqual([]);
    expect(suggestFixedAccessories('Bộ phụ kiện lạ chưa có luật')).toEqual([]);
  });
});

describe('enrichFixedAccessoryPackageValue — auto SL bộ theo số lượng cửa', () => {
  it('SL bộ = SL gốc mỗi cửa × tổng SL cửa; total tính lại theo đó', () => {
    const result = parse(
      enrichFixedAccessoryPackageValue(
        JSON.stringify({ name: 'Bộ lạ', packageQuantityPerUnit: 2, unitPrice: 500_000 }),
        3,
      ),
    );
    expect(result.packageQuantity).toBe(6);
    expect(result.quantity).toBe(6);
    expect(result.total).toBe(3_000_000);
    expect(result.totalVnd).toBe(3_000_000);
  });

  it('thiếu packageQuantityPerUnit → coi như 1 bộ mỗi cửa', () => {
    const result = parse(
      enrichFixedAccessoryPackageValue(JSON.stringify({ name: 'Bộ lạ', unitPrice: 100 }), 4),
    );
    expect(result.packageQuantityPerUnit).toBe(1);
    expect(result.packageQuantity).toBe(4);
  });

  it('user sửa tay SL bộ (manual) → KHÔNG bị auto ghi đè', () => {
    const result = parse(
      enrichFixedAccessoryPackageValue(
        JSON.stringify({ name: 'Bộ lạ', packageQuantityManual: true, packageQuantity: 5, unitPrice: 100 }),
        3,
      ),
    );
    expect(result.packageQuantity).toBe(5);
    expect(result.packageQuantityManual).toBe(true);
  });

  it('tổng SL cửa 0 hoặc âm → kẹp về 1 bộ', () => {
    expect(parse(enrichFixedAccessoryPackageValue(JSON.stringify({ name: 'X' }), 0)).packageQuantity).toBe(1);
    expect(parse(enrichFixedAccessoryPackageValue(JSON.stringify({ name: 'X' }), -5)).packageQuantity).toBe(1);
  });

  it('đơn vị mặc định là BO', () => {
    expect(parse(enrichFixedAccessoryPackageValue(JSON.stringify({ name: 'X' }), 1)).unit).toBe('BO');
    expect(parse(enrichFixedAccessoryPackageValue(JSON.stringify({ name: 'X', unit: 'M2' }), 1)).unit).toBe('M2');
  });

  it('chưa có items thì tự điền theo luật gợi ý', () => {
    const result = parse(
      enrichFixedAccessoryPackageValue(JSON.stringify({ name: 'Kinlong Mở Quay 2 Cánh' }), 1),
    );
    expect(result.items?.find((i) => i.name === 'Bản Lề')?.quantity).toBe(6);
  });

  it('đã có items do user nhập → giữ nguyên, không ghi đè bằng luật', () => {
    const manual = [{ name: 'Phụ kiện tôi tự nhập', quantity: 9 }];
    const result = parse(
      enrichFixedAccessoryPackageValue(
        JSON.stringify({ name: 'Kinlong Mở Quay 2 Cánh', items: manual }),
        1,
      ),
    );
    expect(result.items).toEqual(manual);
  });

  it('nhận cả object, không chỉ chuỗi JSON', () => {
    const result = parse(enrichFixedAccessoryPackageValue({ name: 'X', unitPrice: 250 }, 2));
    expect(result.packageQuantity).toBe(2);
    expect(result.total).toBe(500);
  });

  it('giá trị rỗng → null', () => {
    expect(enrichFixedAccessoryPackageValue(null, 1)).toBeNull();
    expect(enrichFixedAccessoryPackageValue(undefined, 1)).toBeNull();
    expect(enrichFixedAccessoryPackageValue('', 1)).toBeNull();
  });

  it('JSON hỏng → trả lại nguyên chuỗi, không làm crash báo giá', () => {
    expect(enrichFixedAccessoryPackageValue('{ hỏng', 1)).toBe('{ hỏng');
  });
});
