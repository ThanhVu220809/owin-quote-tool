/**
 * NGUỒN CHÂN LÝ KIỂU DỮ LIỆU — Owin Quote Tool
 * Mọi nơi khác import type từ đây, không định nghĩa lại.
 *
 * Tham chiếu HẰNG SỐ NGHIỆP VỤ:
 *  - BR-3: 3 hệ ĐVT (m² / md / Bộ).
 *  - BR-6: override trên dòng báo giá KHÔNG đụng sản phẩm gốc.
 *  - BR-8: SyncEntity có id/updatedAt/deleted (tombstone, LWW per-entity).
 *  - BR-9: ảnh tách khỏi file sync — ở model ta chỉ giữ id ảnh (imageId), bytes nằm IndexedDB.
 */

/** Hệ đơn vị tính. Ký tự đúng như file mẫu Owin. */
export type DVT = 'm²' | 'md' | 'Bộ';

/** Mọi entity tham gia sync mang 3 trường này (BR-8). */
export interface SyncEntity {
  id: string;
  /** ISO timestamp lần sửa cuối — dùng cho LWW. */
  updatedAt: string;
  /** Tombstone: true = đã xoá (không xoá cứng để sync không hồi sinh). */
  deleted?: boolean;
}

/** Phụ kiện gắn theo sản phẩm gốc hoặc theo dòng báo giá. */
export interface Accessory {
  id: string;
  ten: string;
  donGia: number;
  /** Số lượng phụ kiện (mặc định 1). */
  sl: number;
  /** Có được chọn/bật cho dòng này không (Switch toggle ở UI). */
  enabled: boolean;
}

/** Sản phẩm gốc trong kho (catalog). */
export interface Product extends SyncEntity {
  dvt: DVT;
  ten: string;
  /** Mã sản phẩm, luôn UPPERCASE. */
  ma: string;
  /** Đơn giá gốc trên 1 đơn vị tính. */
  donGiaGoc: number;
  /** Kích thước mặc định (tuỳ chọn) — pre-fill khi nạp vào báo giá. Ẩn khi dvt='Bộ'. */
  rongMacDinh?: number;
  caoMacDinh?: number;
  /** Khoá ảnh trong IndexedDB (BR-9: bytes ảnh không nằm trong record sync). */
  imageId?: string;
  /** 5 trường auto-suggest. */
  mau?: string;
  heNhom?: string;
  khungBao?: string;
  banCanh?: string;
  kinh?: string;
  /** Phụ kiện mặc định kèm sản phẩm. */
  accessories: Accessory[];
}

/**
 * Một dòng trên bảng báo giá. Snapshot dữ liệu từ Product khi chọn,
 * cho phép override mà KHÔNG đụng Product gốc (BR-6).
 */
export interface QuoteLine extends SyncEntity {
  /** id sản phẩm gốc đã nạp vào (chỉ để truy vết, override không ghi ngược). */
  productId: string;
  dvt: DVT;
  ten: string;
  ma: string;
  /** Kích thước nhập trên dòng. Với hệ Bộ thì rong/cao bỏ trống. */
  rong?: number;
  cao?: number;
  sl: number;
  /** Đơn giá áp dụng cho dòng (đã có thể override khác donGiaGoc). */
  donGia: number;
  /** Phụ kiện áp dụng cho dòng (bản copy, override độc lập). */
  accessories: Accessory[];
  imageId?: string;
  /** Mô tả tự do (Hệ nhôm, kính... gộp nhiều dòng, dùng \n). */
  moTa?: string;
}

/** Thông tin khách hàng đầu báo giá. */
export interface Customer {
  ten: string;
  sdt: string;
  diaChi: string;
  email: string;
}

/** Một hệ sản phẩm (nhóm catalog), ví dụ "Hệ Xingfa Owin". */
export interface ProductSystem extends SyncEntity {
  ten: string;
  /** id các sản phẩm thuộc hệ (hoặc lọc theo trường khác — tuỳ UI). */
  productIds?: string[];
}

/** Toàn bộ DB local/sync (phần metadata, KHÔNG chứa bytes ảnh — BR-9). */
export interface OwinDB {
  systems: ProductSystem[];
  products: Product[];
  /** version schema để migrate sau này. */
  schemaVersion: number;
}
