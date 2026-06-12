/**
 * Định dạng hiển thị — tiền tệ VN.
 * Chuẩn đã chọn (khớp file mẫu Owin): dấu chấm phân cách nghìn + hậu tố "đ".
 * Ví dụ: 4296032 → "4.296.032đ".
 */

/** Chỉ phần số có dấu chấm phân cách nghìn (không kèm "đ"). */
export function formatSoVND(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  // Chèn dấu chấm mỗi 3 chữ số từ phải sang.
  const s = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + s;
}

/** Tiền VN đầy đủ kèm "đ". Ví dụ formatVND(4296032) → "4.296.032đ". */
export function formatVND(n: number): string {
  return formatSoVND(n) + 'đ';
}
