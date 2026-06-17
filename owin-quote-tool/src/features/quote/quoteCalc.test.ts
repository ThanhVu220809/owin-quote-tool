import { describe, it, expect } from 'vitest';
import type { Product, QuoteLine } from '@/types/models';
import {
  tinhDong,
  tinhTongBaoGia,
  tinhTongLamTron,
  lamTronXuong,
  tinhTienPhuKienDong,
  createLineFromProduct,
} from '@/features/quote/quoteCalc';

function lineS1(): QuoteLine {
  return {
    id: '1', updatedAt: '', productId: 'S1', dvt: 'm²', ten: 'S1', ma: 'S1',
    rong: 1.196, cao: 1.796, sl: 1, donGia: 2000000,
    accessories: [
      { id: 'a1', ten: 'Tay nắm', donGia: 500000, sl: 2, enabled: true },
      { id: 'a2', ten: 'Bản lề tắt', donGia: 999999, sl: 1, enabled: false },
    ],
  };
}

describe('TEST 4.2 — engine real-time + tổng dòng (BR-1)', () => {
  it('S1 1.196×1.796×1 @2.000.000 + PK 2×500.000 → cửa 4.296.000, PK 1.000.000, tổng 5.296.000', () => {
    const r = tinhDong(lineS1());
    expect(r.tienChinh).toBe(4296000);
    expect(r.tienPhuKien).toBe(1000000); // chỉ tính PK enabled
    expect(r.tongDong).toBe(5296000);
  });

  it('phụ kiện tắt (enabled:false) KHÔNG được cộng', () => {
    expect(tinhTienPhuKienDong(lineS1().accessories)).toBe(1000000);
  });

  it('hệ Bộ: rộng/cao bỏ qua, tiền = sl×đơn giá', () => {
    const bo: QuoteLine = {
      id: '2', updatedAt: '', productId: 'S6', dvt: 'Bộ', ten: 'S6', ma: 'S6',
      sl: 3, donGia: 2000000, accessories: [],
    };
    expect(tinhDong(bo).tienChinh).toBe(6000000);
  });

  it('tổng báo giá nhiều dòng', () => {
    const l1 = lineS1();
    const l2 = { ...lineS1(), id: '9', accessories: [] };
    expect(tinhTongBaoGia([l1, l2])).toBe(5296000 + 4296000);
  });
});

describe('BR-1b — tổng làm tròn xuống bội số 100.000 (quy tắc app mới)', () => {
  it('lamTronXuong floor về 100.000: 5.296.000 → 5.200.000', () => {
    expect(lamTronXuong(5296000)).toBe(5200000);
    expect(lamTronXuong(43375322)).toBe(43300000);
    expect(lamTronXuong(0)).toBe(0);
  });
  it('tinhTongLamTron: 1 dòng S1 (tổng 5.296.000) → 5.200.000', () => {
    expect(tinhTongLamTron([lineS1()])).toBe(5200000);
  });
});

describe('BR-6 — override không phá gốc: createLineFromProduct là snapshot', () => {
  it('sửa giá/phụ kiện trên dòng KHÔNG đổi product gốc', () => {
    const p: Product = {
      id: 'S1', updatedAt: '', dvt: 'm²', ten: 'S1', ma: 'S1', donGiaGoc: 2000000,
      rongMacDinh: 1.196, caoMacDinh: 1.796,
      accessories: [{ id: 'a1', ten: 'Tay nắm', donGia: 500000, sl: 1, enabled: true }],
    };
    const line = createLineFromProduct(p);
    // override dòng
    line.donGia = 1900000;
    line.accessories[0].donGia = 123;
    line.accessories[0].enabled = false;
    // product gốc KHÔNG đổi
    expect(p.donGiaGoc).toBe(2000000);
    expect(p.accessories[0].donGia).toBe(500000);
    expect(p.accessories[0].enabled).toBe(true);
    // dòng pre-fill kích thước mặc định
    expect(line.rong).toBe(1.196);
    expect(line.cao).toBe(1.796);
    expect(line.sl).toBe(1);
  });

  it('hệ Bộ: line không nhận rộng/cao', () => {
    const p: Product = {
      id: 'S6', updatedAt: '', dvt: 'Bộ', ten: 'S6', ma: 'S6', donGiaGoc: 2000000,
      rongMacDinh: 9, caoMacDinh: 9, accessories: [],
    };
    const line = createLineFromProduct(p);
    expect(line.rong).toBeUndefined();
    expect(line.cao).toBeUndefined();
  });
});
