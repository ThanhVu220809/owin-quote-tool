/**
 * ENGINE TOÁN HỌC — trái tim của Owin Quote Tool.
 *
 * HẰNG SỐ NGHIỆP VỤ (BẤT BIẾN):
 *  - BR-1 (quy tắc app mới): thành tiền = (KL đã LÀM TRÒN 3 SỐ LẺ) × đơn giá, rồi
 *          Math.round() MỘT LẦN ở cuối. Làm tròn KL 3 số lẻ TRƯỚC khi nhân (giống
 *          round3 trong app Next.js gốc).
 *          Chuẩn: S1 1.196×1.796×1 = 2.148016 → 2.148 × 2.000.000 = 4.296.000đ.
 *  - BR-2: khối lượng HIỂN THỊ làm tròn 3 số lẻ — bằng đúng số đem nhân ở BR-1.
 *  - BR-3: 3 hệ ĐVT:
 *          m²  : KL = rộng × cao × sl
 *          md  : KL = (rộng + cao) × sl
 *          Bộ  : KL = sl   (bỏ qua rộng/cao); thành tiền = sl × đơn giá.
 *  - BR-1b: TỔNG báo giá làm tròn XUỐNG bội số 100.000 (xem tinhTongLamTron ở quoteCalc).
 */

import type { DVT } from '@/types/models';
import {
  calculateDimensionQuantity,
  roundMoneyToVnd,
  roundQuantity3,
} from '@/lib/quote-engine';

/** Làm tròn 3 số lẻ (HALF_UP) — dùng cho KL trước khi nhân tiền & để hiển thị. */
export function round3(n: number): number {
  return roundQuantity3(n);
}

/**
 * Khối lượng theo hệ ĐVT (BR-3), làm tròn 3 số lẻ theo REFERENCE.
 * Với hệ 'Bộ', rong/cao bị bỏ qua hoàn toàn.
 */
export function tinhKhoiLuong(
  dvt: DVT,
  rong: number,
  cao: number,
  sl: number,
): number {
  return calculateDimensionQuantity({
    unit: dvt,
    widthM: rong,
    heightM: cao,
    quantity: sl,
  });
}

/**
 * Thành tiền (BR-1 — quy tắc app mới): làm tròn KL 3 số lẻ TRƯỚC khi nhân đơn giá,
 * rồi Math.round() một lần ở cuối. Hệ 'Bộ': KL = sl (round3 không đổi) → sl × đơn giá.
 */
export function tinhThanhTien(
  dvt: DVT,
  rong: number,
  cao: number,
  sl: number,
  donGia: number,
): number {
  const kl = tinhKhoiLuong(dvt, rong, cao, sl);
  return roundMoneyToVnd(kl * donGia);
}

/**
 * Thành tiền của 1 phụ kiện = round(sl × đơn giá). Phụ kiện không dính rộng/cao.
 */
export function tinhTienPhuKien(sl: number, donGia: number): number {
  return roundMoneyToVnd(sl * donGia);
}

/**
 * Khối lượng để HIỂN THỊ (BR-2): làm tròn 3 số lẻ — bằng đúng số dùng để nhân ở BR-1.
 * Ví dụ: 2.148016 → 2.148.
 */
export function formatHienThiKhoiLuong(kl: number): number {
  return round3(kl);
}
