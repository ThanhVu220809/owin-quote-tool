import { useEffect, useState } from 'react';

/**
 * Bật/tắt phân trang cho từng tab. Tắt thì danh sách hiển thị hết trong một
 * trang và thanh phân trang ẩn đi. Lưu theo thiết bị trong localStorage.
 *
 * Mặc định TẮT cả 4 tab: mở lên là thấy trọn danh sách, ai cần chia trang thì
 * tự bật trong Cài đặt.
 */

export type PaginatedFeature = 'products' | 'quotes' | 'catalogue' | 'aluminum';

export const PAGINATED_FEATURES: Array<{ key: PaginatedFeature; label: string }> = [
  { key: 'products', label: 'Sản phẩm' },
  { key: 'quotes', label: 'Báo giá' },
  { key: 'catalogue', label: 'Bảng giá' },
  { key: 'aluminum', label: 'Tính nhôm' },
];

export type PaginationSettings = Record<PaginatedFeature, boolean>;

const STORAGE_KEY = 'owin-pagination';
const DEFAULTS: PaginationSettings = {
  products: false,
  quotes: false,
  catalogue: false,
  aluminum: false,
};

const listeners = new Set<(value: PaginationSettings) => void>();
let current: PaginationSettings = readPaginationSettings();

export function readPaginationSettings(): PaginationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<PaginatedFeature, unknown>>;
    const next = { ...DEFAULTS };
    for (const { key } of PAGINATED_FEATURES) {
      if (typeof parsed?.[key] === 'boolean') next[key] = parsed[key];
    }
    return next;
  } catch { /* Dữ liệu hỏng hoặc không đọc được storage thì dùng mặc định. */ }
  return { ...DEFAULTS };
}

export function setPaginationEnabled(feature: PaginatedFeature, enabled: boolean) {
  current = { ...current, [feature]: enabled };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); }
  catch { /* Lựa chọn vẫn có hiệu lực trong phiên hiện tại. */ }
  listeners.forEach((listener) => listener(current));
}

function subscribe(listener: (value: PaginationSettings) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Toàn bộ lựa chọn — dùng cho hộp thoại Cài đặt. */
export function usePaginationSettings(): PaginationSettings {
  const [value, setValue] = useState(current);
  useEffect(() => subscribe(setValue), []);
  return value;
}

/** Một tab có đang bật phân trang hay không. */
export function usePaginationEnabled(feature: PaginatedFeature): boolean {
  return usePaginationSettings()[feature];
}
