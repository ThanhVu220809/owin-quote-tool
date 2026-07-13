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

// Placeholder hợp lệ khi CHƯA cấu hình để createClient KHÔNG ném lỗi lúc import
// (nếu không, biến env rỗng sẽ làm trắng cả app). Khi chưa cấu hình, SupabaseGate
// render app cũ và không đụng tới client này.
const safeUrl = url || 'https://placeholder.supabase.co';
const safeKey = anonKey || 'placeholder-anon-key';

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,      // admin đăng nhập 1 lần, nhớ phiên
    autoRefreshToken: true,
    storageKey: 'owin-supabase-auth',
  },
});
