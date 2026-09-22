import { useEffect, useState } from 'react';

/**
 * Tuỳ chọn giao diện (Sáng / Tối / Theo máy) dùng chung cho cả app.
 *
 * Cùng một khoá `owin-appearance` mà màn đăng nhập vẫn đang dùng, nên lựa chọn
 * đặt trong hộp thoại Cài đặt và lựa chọn đặt ở màn đăng nhập là một.
 */

export type Appearance = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'owin-appearance';
const listeners = new Set<(value: Appearance) => void>();

export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Không đọc được storage thì theo hệ thống. */ }
  return 'system';
}

/** Ghi `data-appearance` lên <html> để CSS và color-scheme của trình duyệt theo cùng. */
function applyToDocument(value: Appearance) {
  const root = document.documentElement;
  if (value === 'system') {
    delete root.dataset.appearance;
    root.style.removeProperty('color-scheme');
  } else {
    root.dataset.appearance = value;
    root.style.setProperty('color-scheme', value);
  }
}

export function setAppearance(value: Appearance) {
  try { localStorage.setItem(STORAGE_KEY, value); }
  catch { /* Lựa chọn vẫn có hiệu lực trong phiên hiện tại. */ }
  applyToDocument(value);
  listeners.forEach((listener) => listener(value));
}

export function subscribeAppearance(listener: (value: Appearance) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Gọi một lần khi app khởi động để khôi phục lựa chọn đã lưu. */
export function initAppearance() {
  applyToDocument(readAppearance());
}

/** Đọc lựa chọn hiện tại và tự cập nhật khi nơi khác đổi. */
export function useAppearance(): [Appearance, (value: Appearance) => void] {
  const [value, setValue] = useState<Appearance>(readAppearance);
  useEffect(() => subscribeAppearance(setValue), []);
  return [value, setAppearance];
}
