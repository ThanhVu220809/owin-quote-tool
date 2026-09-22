import { describe, it, expect } from 'vitest';
import {
  accessoryPricingBasis,
  calculateAccessorySubtotal,
  calculateExtraAccessoryLineTotal,
  calculateLegacyAccessoryLineTotal,
  isWeightBasedAccessoryUnit,
} from './accessoryPricing';

describe('isWeightBasedAccessoryUnit — m²/md tính theo KL, Bộ tính theo SL', () => {
  it('m² và md là hệ tính theo khối lượng', () => {
    expect(isWeightBasedAccessoryUnit('M2')).toBe(true);
    expect(isWeightBasedAccessoryUnit('METER')).toBe(true);
  });

  it('Bộ KHÔNG tính theo khối lượng', () => {
    expect(isWeightBasedAccessoryUnit('BO')).toBe(false);
  });
});

describe('accessoryPricingBasis — chọn cơ sở nhân đơn giá', () => {
  it('hệ Bộ: luôn dùng SL, bỏ qua KL', () => {
    expect(accessoryPricingBasis({ unit: 'BO', quantity: 2, weight: 5 })).toBe(2);
  });

  it('hệ m²/md: ưu tiên KL khi KL > 0', () => {
    expect(accessoryPricingBasis({ unit: 'M2', quantity: 2, weight: 5 })).toBe(5);
    expect(accessoryPricingBasis({ unit: 'METER', quantity: 2, weight: 3.5 })).toBe(3.5);
  });

  it('hệ m²/md: KL = 0 thì fallback về SL — tránh thành tiền = 0 khi user chỉ nhập SL', () => {
    expect(accessoryPricingBasis({ unit: 'M2', quantity: 2, weight: 0 })).toBe(2);
    expect(accessoryPricingBasis({ unit: 'M2', quantity: 2, weight: null })).toBe(2);
  });

  it('giá trị âm bị kẹp về 0', () => {
    expect(accessoryPricingBasis({ unit: 'BO', quantity: -3 })).toBe(0);
    expect(accessoryPricingBasis({ unit: 'M2', quantity: 0, weight: -5 })).toBe(0);
  });

  it('KL được làm tròn 3 số lẻ trước khi dùng', () => {
    expect(accessoryPricingBasis({ unit: 'M2', quantity: 0, weight: 2.148016 })).toBe(2.148);
  });
});

describe('calculateExtraAccessoryLineTotal — phụ kiện phát sinh', () => {
  it('Bộ: SL × đơn giá', () => {
    expect(calculateExtraAccessoryLineTotal({ unit: 'BO', quantity: 2, unitPriceVnd: 500_000 })).toBe(1_000_000);
  });

  it('m²: KL × đơn giá', () => {
    expect(calculateExtraAccessoryLineTotal({ unit: 'M2', quantity: 1, weight: 2.148, unitPriceVnd: 2_000_000 })).toBe(4_296_000);
  });

  it('thiếu unitPriceVnd thì lấy unitPrice', () => {
    expect(calculateExtraAccessoryLineTotal({ unit: 'BO', quantity: 2, unitPrice: 500_000 })).toBe(1_000_000);
  });

  it('unitPriceVnd = null KHÔNG fallback sang unitPrice → thành tiền 0 (ghi nhận hành vi hiện tại)', () => {
    expect(
      calculateExtraAccessoryLineTotal({ unit: 'BO', quantity: 2, unitPriceVnd: null, unitPrice: 500_000 }),
    ).toBe(0);
  });

  it('thành tiền làm tròn về đồng', () => {
    expect(calculateExtraAccessoryLineTotal({ unit: 'BO', quantity: 3, unitPriceVnd: 1_000.5 })).toBe(3_002);
  });
});

describe('calculateLegacyAccessoryLineTotal — phụ kiện theo bộ của sản phẩm', () => {
  it('tiền = SL mỗi bộ × tổng số bộ × đơn giá', () => {
    expect(calculateLegacyAccessoryLineTotal({ quantityPerSet: 2, unitPriceVnd: 500_000 }, 1)).toBe(1_000_000);
    expect(calculateLegacyAccessoryLineTotal({ quantityPerSet: 2, unitPriceVnd: 500_000 }, 3)).toBe(3_000_000);
  });

  it('phụ kiện TẮT (isEnabled: false) không được cộng', () => {
    expect(
      calculateLegacyAccessoryLineTotal({ quantityPerSet: 2, unitPriceVnd: 999_999, isEnabled: false }, 1),
    ).toBe(0);
  });

  it('không khai isEnabled → coi như đang BẬT', () => {
    expect(calculateLegacyAccessoryLineTotal({ quantityPerSet: 1, unitPriceVnd: 500_000 }, 1)).toBe(500_000);
    expect(
      calculateLegacyAccessoryLineTotal({ quantityPerSet: 1, unitPriceVnd: 500_000, isEnabled: true }, 1),
    ).toBe(500_000);
  });

  it('tổng số bộ = 0 → không phát sinh tiền', () => {
    expect(calculateLegacyAccessoryLineTotal({ quantityPerSet: 2, unitPriceVnd: 500_000 }, 0)).toBe(0);
  });
});

describe('calculateAccessorySubtotal', () => {
  it('cộng dồn tiền phụ kiện', () => {
    expect(calculateAccessorySubtotal([{ lineTotalVnd: 1_000_000 }, { lineTotalVnd: 500_000 }])).toBe(1_500_000);
    expect(calculateAccessorySubtotal([])).toBe(0);
  });
});
