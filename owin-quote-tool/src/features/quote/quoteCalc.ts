/**
 * Engine tính 1 dòng báo giá + tổng — dùng lại calc.ts (BR-1 full precision).
 *  - Tiền chính (cửa/bộ) = tinhThanhTien(...).
 *  - Tiền phụ kiện = tổng các phụ kiện ĐANG BẬT (enabled), mỗi cái round(sl×đơn giá).
 *  - Tổng dòng = tiền chính + tiền phụ kiện.
 *  - Override (sửa giá/phụ kiện trên dòng) KHÔNG đụng sản phẩm gốc (BR-6) — vì QuoteLine
 *    là snapshot độc lập.
 */

import type { Product, QuoteLine, Accessory } from '@/types/models';
import { tinhThanhTien, tinhTienPhuKien, tinhKhoiLuong } from '@/utils/calc';

export interface DongTinhTien {
  tienChinh: number;
  tienPhuKien: number;
  tongDong: number;
}

/** Tiền phụ kiện của 1 dòng (chỉ tính cái enabled). */
export function tinhTienPhuKienDong(accessories: Accessory[]): number {
  return accessories
    .filter((a) => a.enabled)
    .reduce((sum, a) => sum + tinhTienPhuKien(a.sl, a.donGia), 0);
}

/** Tính tiền 1 dòng báo giá. */
export function tinhDong(line: QuoteLine): DongTinhTien {
  const tienChinh = tinhThanhTien(
    line.dvt,
    line.rong ?? 0,
    line.cao ?? 0,
    line.sl,
    line.donGia,
  );
  const tienPhuKien = tinhTienPhuKienDong(line.accessories);
  return { tienChinh, tienPhuKien, tongDong: tienChinh + tienPhuKien };
}

/** Khối lượng đầy đủ của dòng (để hiển thị/Word). */
export function khoiLuongDong(line: QuoteLine): number {
  return tinhKhoiLuong(line.dvt, line.rong ?? 0, line.cao ?? 0, line.sl);
}

/** Tổng toàn bộ báo giá. */
export function tinhTongBaoGia(lines: QuoteLine[]): number {
  return lines.reduce((sum, l) => sum + tinhDong(l).tongDong, 0);
}

/**
 * Tạo 1 dòng báo giá (snapshot độc lập) từ sản phẩm gốc.
 * Copy sâu phụ kiện để override không ghi ngược vào kho (BR-6).
 */
export function createLineFromProduct(p: Product): QuoteLine {
  const moTaParts = [p.heNhom, p.khungBao, p.banCanh, p.kinh, p.mau].filter(Boolean);
  return {
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    productId: p.id,
    dvt: p.dvt,
    ten: p.ten,
    ma: p.ma,
    rong: p.dvt === 'Bộ' ? undefined : p.rongMacDinh,
    cao: p.dvt === 'Bộ' ? undefined : p.caoMacDinh,
    sl: 1,
    donGia: p.donGiaGoc,
    accessories: p.accessories.map((a) => ({ ...a })),
    imageId: p.imageId,
    moTa: moTaParts.join('\n'),
  };
}
