/**
 * Ảnh sản phẩm trên Supabase Storage (bucket public product-images).
 * Upload blob → trả URL CDN công khai để app dùng <img src=…> (không tải blob nặng).
 */
import { supabase, PRODUCT_IMAGE_BUCKET } from './supabaseClient';

function sanitize(part: string): string {
  return (part || 'x').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

/** Đường dẫn ảnh trong bucket, ổn định theo mã sản phẩm + tên file. */
export function storagePathFor(productCode: string, filename: string): string {
  return `products/${sanitize(productCode)}/${sanitize(filename)}`;
}

/** URL CDN công khai của 1 path trong bucket. */
export function publicUrl(path: string): string {
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Upload 1 blob (upsert) → trả URL công khai. */
export async function uploadImageBlob(path: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' });
  if (error) throw new Error(error.message);
  return publicUrl(path);
}

/** SHA-256 hex của blob → định danh nội dung để lưu ảnh 1 lần. */
async function blobHash(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload ảnh theo NỘI DUNG (content-addressed): cùng ảnh → cùng path `img/<hash>` →
 * chỉ lưu 1 lần, nhiều sản phẩm trỏ chung 1 URL. `seen` bỏ qua lần upload lặp trong 1 phiên.
 */
export async function uploadImageDedup(blob: Blob, seen?: Set<string>): Promise<string> {
  const hash = await blobHash(blob);
  const path = `img/${hash}.webp`;
  if (!seen?.has(hash)) {
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' });
    if (error) throw new Error(error.message);
    seen?.add(hash);
  }
  return publicUrl(path);
}
