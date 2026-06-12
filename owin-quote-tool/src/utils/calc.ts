/**
 * ENGINE TOÁN HỌC — trái tim của Owin Quote Tool.
 *
 * HẰNG SỐ NGHIỆP VỤ (BẤT BIẾN):
 *  - BR-1: thành tiền = FULL PRECISION. Nhân từ khối lượng ĐẦY ĐỦ, chỉ Math.round()
 *          MỘT LẦN ở kết quả cuối thành số nguyên đồng. KHÔNG làm tròn KL trước khi nhân.
 *          Chuẩn: S1 1.196×1.796×1×2.000.000 = 4.296.032đ (KHÔNG phải 4.296.000).
 *  - BR-2: khối lượng HIỂN THỊ làm tròn 3 số lẻ — chỉ để hiện UI, KHÔNG đem nhân.
 *  - BR-3: 3 hệ ĐVT:
 *          m²  : KL = rộng × cao × sl
 *          md  : KL = (rộng + cao) × sl
 *          Bộ  : KL = sl   (bỏ qua rộng/cao); thành tiền = sl × đơn giá.
 */

import type { DVT } from '@/types/models';

/**
 * Khối lượng FULL PRECISION theo hệ ĐVT (BR-3). KHÔNG làm tròn ở đây (BR-1/BR-2).
 * Với hệ 'Bộ', rong/cao bị bỏ qua hoàn toàn.
 */
export function tinhKhoiLuong(
  dvt: DVT,
  rong: number,
  cao: number,
  sl: number,
): number {
  switch (dvt) {
    case 'm²':
      return rong * cao * sl;
    case 'md':
      return (rong + cao) * sl;
    case 'Bộ':
      return sl;
    default: {
      // Ép TS báo nếu thêm DVT mới mà quên xử lý.
      const _exhaustive: never = dvt;
      return _exhaustive;
    }
  }
}

/**
 * Thành tiền FULL PRECISION (BR-1). Nhân từ khối lượng đầy đủ rồi Math.round()
 * MỘT LẦN duy nhất ở cuối. Hệ 'Bộ': KL = sl nên thành tiền = sl × đơn giá tự nhiên.
 */
export function tinhThanhTien(
  dvt: DVT,
  rong: number,
  cao: number,
  sl: number,
  donGia: number,
): number {
  const kl = tinhKhoiLuong(dvt, rong, cao, sl);
  return Math.round(kl * donGia);
}

/**
 * Thành tiền của 1 phụ kiện = round(sl × đơn giá). Phụ kiện không dính rộng/cao.
 */
export function tinhTienPhuKien(sl: number, donGia: number): number {
  return Math.round(sl * donGia);
}

/**
 * Khối lượng để HIỂN THỊ (BR-2): làm tròn 3 số lẻ. CHỈ dùng để hiện UI/Word,
 * KHÔNG bao giờ đem giá trị này đi nhân tiền.
 * Ví dụ: 2.148016 → 2.148.
 */
export function formatHienThiKhoiLuong(kl: number): number {
  return Math.round(kl * 1000) / 1000;
}
