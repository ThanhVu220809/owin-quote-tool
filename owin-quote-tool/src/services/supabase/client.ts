/**
 * Supabase client — nguồn kết nối DUY NHẤT tới Postgres + Storage + Auth.
 * URL/anon key lấy từ import.meta.env (public, nhúng bundle là bình thường).
 * KHÔNG bao giờ đưa service_role key xuống client.
 */
import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Bucket ảnh sản phẩm (public). */
export const PRODUCT_IMAGE_BUCKET = 'product-images';
/** Ảnh chụp/ghi đè riêng trong báo giá (private, cần đăng nhập để đọc). */
export const QUOTE_IMAGE_BUCKET = 'quote-images';

// Placeholder hợp lệ khi CHƯA cấu hình để createClient KHÔNG ném lỗi lúc import
// (nếu không, biến env rỗng sẽ làm trắng cả app). Khi chưa cấu hình, AuthGate
// hiển thị lỗi cấu hình rõ ràng và không đụng tới client này.
const safeUrl = url || 'https://placeholder.supabase.co';
const safeKey = anonKey || 'placeholder-anon-key';

const REMEMBER_SIGN_IN_KEY = 'owin-auth-remember';

/** Mặc định là ghi nhớ; chỉ khi người dùng bỏ tick mới lưu theo tab. */
export function getRememberSignIn(): boolean {
  try {
    return localStorage.getItem(REMEMBER_SIGN_IN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setRememberSignIn(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_SIGN_IN_KEY, remember ? 'true' : 'false');
  } catch {
    // Cửa sổ ẩn danh chặn storage: cứ coi như ghi nhớ, phiên sẽ mất khi đóng tab.
  }
}

/**
 * Chọn nơi lưu phiên theo ô "Ghi nhớ đăng nhập".
 *
 * localStorage sống qua lần đóng trình duyệt, sessionStorage chết theo tab —
 * đó chính là khác biệt giữa tick và không tick. Đọc thì tra cả hai, còn ghi
 * thì xoá bên kia đi để một phiên không tồn tại ở hai nơi với hai trạng thái.
 */
const sessionStorageAdapter = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (getRememberSignIn()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      // Không lưu được thì phiên chỉ sống trong bộ nhớ của tab hiện tại.
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Không xoá được cũng không chặn được việc đăng xuất.
    }
  },
};

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'owin-supabase-auth',
    storage: sessionStorageAdapter,
  },
});
