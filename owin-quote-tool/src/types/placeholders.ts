/**
 * NGUỒN CHÂN LÝ DUY NHẤT cho TÊN PLACEHOLDER trong 2 file Word.
 * CẤM gõ tay tên placeholder ở bất kỳ nơi nào khác — luôn import từ đây.
 *
 * Hai FORMAT TÁCH RIÊNG (TASK 0.4 / 4.4):
 *  - FORMAT 1 — Template_Bao_Gia.docx (Báo giá công trình):
 *      kích thước tách 3 ô rời {rong} {cao} {sl}.
 *  - FORMAT 2 — Template_Bang_Gia.docx (Bảng giá hoàn thiện):
 *      kích thước gộp 1 ô {kich_thuoc}; CÓ cột ảnh {%image} trong loop.
 *
 * Quy ước docxtemplater:
 *  - Vòng lặp: {#items} ... {/items}  (tên loop = ITEMS_LOOP).
 *  - Ảnh: thẻ {%image} (image-module, đặt TRONG loop ở Format 2).
 *  - Cờ dòng sản phẩm / phụ kiện: is_sp / is_pk (để style khác nhau).
 */

/** Tên file template tương ứng (đặt trong src/assets/templates/). */
export const TEMPLATE_FILES = {
  format1: 'Template_Bao_Gia.docx',
  format2: 'Template_Bang_Gia.docx',
} as const;

/** Tên vòng lặp dòng hàng — chung cho cả 2 format. */
export const ITEMS_LOOP = 'items' as const;

/* ───────────────────────── FORMAT 1 — Báo giá công trình ───────────────────────── */

/** Placeholder cấp ngoài loop (khách hàng + tổng tiền). */
export const FORMAT1_TOP = [
  'ten_kh',   // tên khách hàng
  'dia_chi',  // địa chỉ
  'sdt',      // số điện thoại
  'email',    // email
  'tong_tien', // tổng cộng
  'tam_ung',   // tạm ứng
  'con_lai',   // còn lại
] as const;

/** Placeholder mỗi phần tử TRONG {#items} của Format 1. */
export const FORMAT1_ITEM = [
  'stt',        // số thứ tự (rỗng ở dòng phụ kiện)
  'ma',         // mã SP (rỗng ở dòng phụ kiện)
  'mo_ta',      // mô tả nhiều dòng (\n, linebreaks:true)
  'dvt',        // đơn vị tính
  'rong',       // rộng  ── FORMAT 1 tách rời
  'cao',        // cao   ── FORMAT 1 tách rời
  'sl',         // số lượng
  'khoi_luong', // khối lượng hiển thị (đã làm tròn 3 số lẻ — BR-2)
  'don_gia',    // đơn giá
  'thanh_tien', // thành tiền (FULL PRECISION — BR-1)
  'is_sp',      // cờ: dòng sản phẩm
  'is_pk',      // cờ: dòng phụ kiện
] as const;

/* ──────────────────────── FORMAT 2 — Bảng giá hoàn thiện ───────────────────────── */

/** Placeholder cấp ngoài loop của Format 2 (giống Format 1). */
export const FORMAT2_TOP = [
  'ten_kh',
  'dia_chi',
  'sdt',
  'email',
  'tong_tien',
  'tam_ung',
  'con_lai',
] as const;

/** Placeholder mỗi phần tử TRONG {#items} của Format 2. */
export const FORMAT2_ITEM = [
  'stt',
  'ma',
  'mo_ta',
  'kich_thuoc', // ── FORMAT 2 gộp rộng×cao×sl thành 1 chuỗi
  'dvt',
  'sl',
  'khoi_luong',
  'don_gia',
  'thanh_tien',
  'image',      // thẻ {%image} — image-module, trong loop
  'is_sp',
  'is_pk',
] as const;

/* ─────────────────────────── Kiểu suy ra từ danh sách ──────────────────────────── */

export type Format1TopKey = (typeof FORMAT1_TOP)[number];
export type Format1ItemKey = (typeof FORMAT1_ITEM)[number];
export type Format2TopKey = (typeof FORMAT2_TOP)[number];
export type Format2ItemKey = (typeof FORMAT2_ITEM)[number];

/** Shape dữ liệu render cho 1 dòng (giá trị placeholder là string/number/boolean). */
export type Format1Item = Record<Format1ItemKey, string | number | boolean>;
export type Format2Item = Record<Format2ItemKey, string | number | boolean>;

/** Shape data toàn file. */
export type Format1Data = Record<Format1TopKey, string | number> & {
  [ITEMS_LOOP]: Format1Item[];
};
export type Format2Data = Record<Format2TopKey, string | number> & {
  [ITEMS_LOOP]: Format2Item[];
};
