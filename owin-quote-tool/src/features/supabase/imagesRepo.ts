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
