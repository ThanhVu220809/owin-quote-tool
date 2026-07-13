/**
 * Image compression + Supabase Storage persistence.
 *
 * Images are compressed in the browser (including EXIF orientation handling),
 * then uploaded directly to the public `product-images` bucket. Only the CDN
 * URL is persisted in product/quote records. The small Maps below are transient
 * runtime caches and are never written to IndexedDB/localStorage.
 */
import imageCompression from 'browser-image-compression';
import {
  deleteImageObject,
  downloadImageBlob,
  publicUrl,
  storagePathFromPublicUrl,
  uploadImageBlob,
  uploadImageDedupResult,
} from '@/features/supabase/imagesRepo';
import { isSupabaseConfigured } from '@/features/supabase/supabaseClient';

/** Compression target: roughly 800px / 100KB while baking EXIF orientation. */
export const COMPRESS_OPTIONS = {
  maxSizeMB: 0.1,
  maxWidthOrHeight: 800,
  initialQuality: 0.7,
  useWebWorker: true,
} as const;

export type ImageErrorCode = 'NOT_IMAGE' | 'COMPRESS_FAILED' | 'STORE_FAILED';

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(message: string, code: ImageErrorCode) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
  }
}

export function isImageFile(file: File): boolean {
  return typeof file.type === 'string' && file.type.startsWith('image/');
}

export async function compressImage(
  file: File,
  options: Partial<typeof COMPRESS_OPTIONS> = {},
): Promise<Blob> {
  if (!isImageFile(file)) {
    throw new ImageError(
      `File "${file.name}" không phải ảnh (type=${file.type || 'unknown'})`,
      'NOT_IMAGE',
    );
  }
  try {
    return await imageCompression(file, { ...COMPRESS_OPTIONS, ...options });
  } catch (error) {
    throw new ImageError(
      `Nén ảnh thất bại: ${error instanceof Error ? error.message : String(error)}`,
      'COMPRESS_FAILED',
    );
  }
}

const productCache = new Map<string, Blob>();
const quoteCache = new Map<string, Blob>();
const legacyCache = new Map<string, Blob>();

function remotePersistenceEnabled(): boolean {
  // Unit tests exercise the compatibility API without mutating a real project.
  return isSupabaseConfigured && import.meta.env.MODE !== 'test';
}

function aliases(source: string): string[] {
  const raw = String(source || '').trim();
  const path = storagePathFromPublicUrl(raw);
  return [...new Set([raw, path || ''].filter(Boolean))];
}

function remember(cache: Map<string, Blob>, source: string, blob: Blob): void {
  for (const key of aliases(source)) cache.set(key, blob);
}

function recalled(cache: Map<string, Blob>, source: string): Blob | null {
  for (const key of aliases(source)) {
    const found = cache.get(key);
    if (found) return found;
  }
  return null;
}

/**
 * Compress and upload immediately. The returned URL is safe to persist in
 * `coverImagePath`, `image`, and `imageOverridePath`.
 */
export async function compressAndUpload(
  file: File,
  path?: string,
  options: Partial<typeof COMPRESS_OPTIONS> = {},
): Promise<{ id: string; path: string; url: string; blob: Blob }> {
  const blob = await compressImage(file, options);
  try {
    if (remotePersistenceEnabled()) {
      const uploaded = path
        ? { path: storagePathFromPublicUrl(path) || path, url: await uploadImageBlob(path, blob) }
        : await uploadImageDedupResult(blob);
      remember(productCache, uploaded.path, blob);
      remember(productCache, uploaded.url, blob);
      return { id: uploaded.url, ...uploaded, blob };
    }

    // Test/unconfigured compatibility: RAM only, never browser persistence.
    const memoryPath = path || `memory-images/${crypto.randomUUID()}`;
    remember(productCache, memoryPath, blob);
    return { id: memoryPath, path: memoryPath, url: memoryPath, blob };
  } catch (error) {
    throw new ImageError(
      `Tải ảnh lên Supabase thất bại: ${error instanceof Error ? error.message : String(error)}`,
      'STORE_FAILED',
    );
  }
}

/**
 * Backward-compatible name. It now uploads to Supabase and returns a CDN URL
 * as `id`; callers should persist that value directly instead of prefixing it.
 */
export async function compressAndStore(
  file: File,
  id?: string,
  options: Partial<typeof COMPRESS_OPTIONS> = {},
): Promise<{ id: string; blob: Blob }> {
  const uploaded = await compressAndUpload(file, id, options);
  return { id: uploaded.url, blob: uploaded.blob };
}

/** Compatibility API: upload a blob to Storage under a known object path. */
export async function saveImage(id: string, blob: Blob): Promise<void> {
  try {
    if (remotePersistenceEnabled()) {
      const url = await uploadImageBlob(id, blob);
      remember(productCache, url, blob);
    }
    remember(productCache, id, blob);
  } catch (error) {
    throw new ImageError(
      `Lưu ảnh "${id}" thất bại: ${error instanceof Error ? error.message : String(error)}`,
      'STORE_FAILED',
    );
  }
}

/** Fetch a Storage/public image as a Blob; useful for binary exports. */
export async function getImage(id: string): Promise<Blob | null> {
  const cached = recalled(productCache, id) || recalled(legacyCache, id);
  if (cached) return cached;
  if (!remotePersistenceEnabled() && !/^(https?:|blob:|data:)/i.test(id)) return null;
  const blob = await downloadImageBlob(id);
  if (blob) remember(productCache, id, blob);
  return blob;
}

export async function getImageUrl(id: string): Promise<string | null> {
  if (/^(https?:|data:|blob:)/i.test(id)) return id;
  if (remotePersistenceEnabled()) return publicUrl(storagePathFromPublicUrl(id) || id);
  const blob = await getImage(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function getImageDataUrl(id: string): Promise<string | null> {
  const blob = await getImage(id);
  return blob ? blobToDataUrl(blob) : null;
}

export async function deleteImage(id: string): Promise<void> {
  for (const key of aliases(id)) {
    productCache.delete(key);
    legacyCache.delete(key);
  }
  if (remotePersistenceEnabled()) await deleteImageObject(id);
}

/** Runtime-cache keys only; persistent listing belongs to Supabase Storage. */
export async function listImageIds(): Promise<string[]> {
  return [...new Set([...productCache.keys(), ...legacyCache.keys()])];
}

export async function countImages(): Promise<number> {
  return (await listImageIds()).length;
}

export async function saveQuoteImage(path: string, blob: Blob): Promise<void> {
  try {
    if (remotePersistenceEnabled()) await uploadImageBlob(path, blob);
    remember(quoteCache, path, blob);
  } catch (error) {
    throw new ImageError(
      `Lưu ảnh báo giá thất bại: ${error instanceof Error ? error.message : String(error)}`,
      'STORE_FAILED',
    );
  }
}

export async function getQuoteImage(path: string): Promise<Blob | null> {
  const cached = recalled(quoteCache, path);
  if (cached) return cached;
  if (!remotePersistenceEnabled() && !/^(https?:|blob:|data:)/i.test(path)) return null;
  const blob = await downloadImageBlob(path);
  if (blob) remember(quoteCache, path, blob);
  return blob;
}

export async function deleteQuoteImage(path: string): Promise<void> {
  for (const key of aliases(path)) quoteCache.delete(key);
  if (remotePersistenceEnabled()) await deleteImageObject(path);
}

type TransientStore = {
  clear: () => Promise<void>;
  keys: () => Promise<string[]>;
  getItem: <T>(key: string) => Promise<T | null>;
  setItem: <T>(key: string, value: T) => Promise<T>;
  removeItem: (key: string) => Promise<void>;
};

function transientStore(cache: Map<string, Blob>): TransientStore {
  return {
    clear: async () => cache.clear(),
    keys: async () => [...cache.keys()],
    getItem: async <T,>(key: string) => (cache.get(key) as T | undefined) ?? null,
    setItem: async <T,>(key: string, value: T) => {
      if (value instanceof Blob) cache.set(key, value);
      return value;
    },
    removeItem: async (key: string) => { cache.delete(key); },
  };
}

/** Deprecated localforage-shaped exports retained for older tests/importers. */
const productImageStore = transientStore(productCache);
const quoteImageStore = transientStore(quoteCache);
const legacyImageStore = transientStore(legacyCache);
const imageStore = productImageStore;

export { imageStore, productImageStore, quoteImageStore, legacyImageStore };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
