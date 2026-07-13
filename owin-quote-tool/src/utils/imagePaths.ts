import {
  downloadImageBlob,
  publicUrl as storagePublicUrl,
  storagePathFromPublicUrl,
} from '@/features/supabase/imagesRepo';

export const DEFAULT_LOGO_PATH = 'owin-user-assets/logo/logo.webp';
const STATIC_PUBLIC_PREFIXES = ['owin-user-assets/', 'imported-assets/'];

function appBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function withBasePath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${appBase()}${clean}`;
}

export function normalizeImagePath(path: string | null | undefined): string | null {
  const raw = String(path || '').trim();
  if (!raw) return null;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const normalized = raw
    .replace(/^\/api\/images\/+/, '')
    .replace(/^api\/images\/+/, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (STATIC_PUBLIC_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return withBasePath(normalized);
  return normalized;
}

export function imageStoreKeyFromPath(path: string | null | undefined): string | null {
  const normalized = normalizeImagePath(path);
  if (!normalized) return null;
  const storagePath = storagePathFromPublicUrl(normalized);
  if (/^https?:/i.test(normalized)) return storagePath;
  if (/^(data:|blob:)/i.test(normalized)) return null;
  const legacyPrefix = 'legacy-images/';
  if (normalized.startsWith(legacyPrefix)) return normalized.slice(legacyPrefix.length);
  if (normalized.startsWith(appBase())) return null;
  return storagePath || normalized;
}

export function productCoverPath(code: string, name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeCode = code.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'product';
  return `products/${safeCode}-${slug || 'item'}/images/cover.webp`;
}

export function quoteItemImagePath(quoteId: string, itemCode: string, extension = 'webp'): string {
  const safeQuote = quoteId.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'draft';
  const safeItem = itemCode.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'item';
  const safeExt = extension.replace(/^\./, '').replace(/[^a-zA-Z0-9]+/g, '') || 'webp';
  return `quotes/${safeQuote}/items/${safeItem}/cover.${safeExt}`;
}

export async function resolveImageUrl(path: string | null | undefined): Promise<{
  url: string;
  revoke: boolean;
}> {
  const normalized = normalizeImagePath(path);
  if (!normalized) return { url: withBasePath(DEFAULT_LOGO_PATH), revoke: false };
  if (/^(https?:|data:|blob:)/i.test(normalized) || normalized.startsWith(appBase())) {
    return { url: normalized, revoke: false };
  }

  const key = imageStoreKeyFromPath(normalized);
  if (!key) return { url: withBasePath(DEFAULT_LOGO_PATH), revoke: false };
  return { url: storagePublicUrl(key), revoke: false };
}

async function fetchPublicDataUrl(publicPath: string): Promise<string | null> {
  try {
    const response = await fetch(withBasePath(publicPath.replace(/^\/+/, '')));
    if (!response.ok) return null;
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

async function fetchDataUrl(source: string): Promise<string | null> {
  const blob = await downloadImageBlob(source);
  return blob ? blobToDataUrl(blob) : null;
}

/**
 * Load image as data URL for DOCX embedding.
 * Falls back to OWIN logo when path is missing or unreadable.
 */
export async function getImageDataUrlByPath(
  path: string | null | undefined,
  options?: { fallbackLogo?: boolean },
): Promise<string | null> {
  const useFallback = options?.fallbackLogo !== false;
  const normalized = normalizeImagePath(path);

  const load = async (): Promise<string | null> => {
    if (!normalized) return null;
    if (normalized.startsWith('data:')) return normalized;
    if (/^(https?:|blob:)/i.test(normalized)) return fetchDataUrl(normalized);
    if (normalized.startsWith(appBase())) {
      try {
        const response = await fetch(normalized);
        if (!response.ok) return null;
        return blobToDataUrl(await response.blob());
      } catch {
        return null;
      }
    }
    const key = imageStoreKeyFromPath(normalized);
    if (!key) return null;
    return fetchDataUrl(key);
  };

  const dataUrl = await load();
  if (dataUrl) return dataUrl;
  if (!useFallback) return null;
  return fetchPublicDataUrl(DEFAULT_LOGO_PATH);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
