/**
 * Supabase Storage repository for every persistent product/quote image.
 * Database records store the returned public URL; image bytes never need a
 * browser database.
 */
import imageCompression from 'browser-image-compression';
import { supabase, PRODUCT_IMAGE_BUCKET, QUOTE_IMAGE_BUCKET } from './supabaseClient';

/**
 * Thumbnail chỉ cho list/bảng giá (không phải ảnh lưu chính).
 * Master vẫn full quality; thumb chỉ thu nhỏ để cuộn list nhanh.
 */
async function makeThumbBlob(blob: Blob): Promise<Blob> {
  const file = blob instanceof File ? blob : new File([blob], 'image', { type: blob.type || 'image/webp' });
  return imageCompression(file, {
    maxWidthOrHeight: 640,
    initialQuality: 0.82,
    fileType: 'image/webp',
    maxSizeMB: 0.2,
    useWebWorker: true,
  });
}

export const PRIVATE_QUOTE_IMAGE_PREFIX = 'quote-private:';

export function privateQuoteImagePath(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw.startsWith(PRIVATE_QUOTE_IMAGE_PREFIX)) return null;
  const path = raw.slice(PRIVATE_QUOTE_IMAGE_PREFIX.length).replace(/^\/+/, '');
  return path || null;
}

export function privateQuoteImageReference(path: string): string {
  return `${PRIVATE_QUOTE_IMAGE_PREFIX}${path.replace(/^\/+/, '')}`;
}

function sanitize(part: string): string {
  return (part || 'x').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

/** Đường dẫn ảnh trong bucket, ổn định theo mã sản phẩm + tên file. */
export function storagePathFor(productCode: string, filename: string): string {
  return `products/${sanitize(productCode)}/${sanitize(filename)}`;
}

function cleanStoragePath(path: string): string {
  return path.replace(/^\/+/, '').replace(new RegExp(`^${PRODUCT_IMAGE_BUCKET}/+`), '');
}

/** Convert a bucket public URL back to its object path. */
export function storagePathFromPublicUrl(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return cleanStoragePath(raw);
  try {
    const url = new URL(raw);
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

/** URL CDN công khai của 1 path trong bucket. */
export function publicUrl(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(cleanStoragePath(path)).data.publicUrl;
}

/** Upload 1 blob (upsert) → trả URL công khai. */
export async function uploadImageBlob(path: string, blob: Blob): Promise<string> {
  const storagePath = storagePathFromPublicUrl(path);
  if (!storagePath) throw new Error('Duong dan anh Supabase Storage khong hop le.');
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(storagePath, blob, { upsert: true, contentType: blob.type || 'image/webp' });
  if (error) throw new Error(error.message);
  return publicUrl(storagePath);
}

/** SHA-256 hex của blob → định danh nội dung để lưu ảnh 1 lần. */
export async function blobHash(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extensionForBlob(blob: Blob): string {
  if (blob.type === 'image/jpeg') return 'jpg';
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'image/gif') return 'gif';
  if (blob.type === 'image/avif') return 'avif';
  return 'webp';
}

export type UploadedImage = { path: string; url: string };

/** Upload by content hash so cancelling/retrying a form does not create duplicates. */
export async function uploadImageDedupResult(blob: Blob, seen?: Set<string>): Promise<UploadedImage> {
  const hash = await blobHash(blob);
  const ext = extensionForBlob(blob);
  const path = `img/${hash}.${ext}`;
  if (!seen?.has(hash)) {
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' });
    if (error) throw new Error(error.message);
    // Best-effort: thumbnail cùng tên ở thumb/<hash> (UI tự fallback master nếu thiếu).
    try {
      const thumbBlob = await makeThumbBlob(blob);
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(`thumb/${hash}.${ext}`, thumbBlob, { upsert: true, contentType: 'image/webp' });
    } catch { /* thumb là tối ưu, thiếu không sao */ }
    seen?.add(hash);
  }
  return { path, url: publicUrl(path) };
}

/** Upload a quote-only image to a private bucket and return a stable DB reference. */
export async function uploadPrivateQuoteImage(blob: Blob): Promise<UploadedImage> {
  const hash = await blobHash(blob);
  const path = `img/${hash}.${extensionForBlob(blob)}`;
  const { error } = await supabase.storage
    .from(QUOTE_IMAGE_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' });
  if (error) throw new Error(error.message);
  return { path, url: privateQuoteImageReference(path) };
}

/** Upload a quote image under a caller-provided private object path. */
export async function uploadPrivateQuoteImageBlob(path: string, blob: Blob): Promise<UploadedImage> {
  const privatePath = privateQuoteImagePath(path)
    ?? path.trim().replace(/^\/+/, '').replace(new RegExp(`^${QUOTE_IMAGE_BUCKET}/+`), '');
  if (!privatePath) throw new Error('Duong dan anh bao gia khong hop le.');
  const { error } = await supabase.storage
    .from(QUOTE_IMAGE_BUCKET)
    .upload(privatePath, blob, { upsert: true, contentType: blob.type || 'image/webp' });
  if (error) throw new Error(error.message);
  return { path: privatePath, url: privateQuoteImageReference(privatePath) };
}

/**
 * Upload ảnh theo NỘI DUNG (content-addressed): cùng ảnh → cùng path `img/<hash>` →
 * chỉ lưu 1 lần, nhiều sản phẩm trỏ chung 1 URL. `seen` bỏ qua lần upload lặp trong 1 phiên.
 */
export async function uploadImageDedup(blob: Blob, seen?: Set<string>): Promise<string> {
  return (await uploadImageDedupResult(blob, seen)).url;
}

/** Download image bytes for DOCX/Excel embedding. */
export async function downloadImageBlob(source: string): Promise<Blob | null> {
  const raw = String(source || '').trim();
  if (!raw) return null;
  const privateQuotePath = privateQuoteImagePath(raw)
    ?? (!/^(https?:|blob:|data:)/i.test(raw) && raw.startsWith('quotes/') ? raw : null);
  if (privateQuotePath) {
    const { data, error } = await supabase.storage.from(QUOTE_IMAGE_BUCKET).download(privateQuotePath);
    return error ? null : data;
  }
  if (/^(https?:|blob:|data:)/i.test(raw)) {
    try {
      const response = await fetch(raw);
      return response.ok ? response.blob() : null;
    } catch {
      return null;
    }
  }
  const path = storagePathFromPublicUrl(raw);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).download(path);
  return error ? null : data;
}

/** Remove a Storage object. Database rows must be updated separately. */
export async function deleteImageObject(source: string): Promise<void> {
  const raw = String(source || '').trim();
  const privateQuotePath = privateQuoteImagePath(raw)
    ?? (!/^(https?:|blob:|data:)/i.test(raw) && raw.startsWith('quotes/') ? raw : null);
  if (privateQuotePath) {
    const { error } = await supabase.storage.from(QUOTE_IMAGE_BUCKET).remove([privateQuotePath]);
    if (error) throw new Error(error.message);
    return;
  }
  const path = storagePathFromPublicUrl(source);
  if (!path) return;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
