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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,      // admin đăng nhập 1 lần, nhớ phiên
    autoRefreshToken: true,
    storageKey: 'owin-supabase-auth',
  },
});
