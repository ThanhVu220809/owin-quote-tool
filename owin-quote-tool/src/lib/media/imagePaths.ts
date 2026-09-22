import {
  downloadImageBlob,
  privateQuoteImageReference,
  privateQuoteImagePath,
  publicUrl as storagePublicUrl,
  storagePathFromPublicUrl,
} from '@/services/supabase/imagesRepo';
import { getImage, getQuoteImage, imageBlobCacheActive } from '@/lib/media/imageStorage';

export const DEFAULT_LOGO_PATH = 'owin-user-assets/logo/logo.webp';
const STATIC_PUBLIC_PREFIXES = ['owin-user-assets/'];

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
  if (privateQuoteImagePath(normalized)) return normalized;
  const storagePath = storagePathFromPublicUrl(normalized);
  if (/^https?:/i.test(normalized)) return storagePath;
  if (/^(data:|blob:)/i.test(normalized)) return null;
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

/**
 * URL bản thumbnail (list) của 1 ảnh master trên Supabase Storage.
 *
 * Quy ước: master ở `.../product-images/<store>/img/<hash>`, thumb ở
 * `.../product-images/<store>/thumb/<hash>`. Ảnh tạo trước khi có đa cửa hàng
 * nằm phẳng ở gốc bucket (`.../product-images/img/<hash>`) và không được dời
 * đi, nên đoạn cửa hàng phải là tuỳ chọn — giống hệt `variantPathFor`.
 *
 * Bỏ sót đoạn đó thì hàm trả `null` cho mọi ảnh mới, và cả danh sách sản phẩm
 * lẫn trình xuất file lặng lẽ rơi về ảnh master 3840px thay vì bản 640px.
 *
 * Trả null nếu URL không phải ảnh master Supabase (không có thumb tương ứng).
 * Lightbox / export / form luôn dùng master (URL gốc), không dùng thumb.
 */
export function thumbUrlFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /\/product-images\/((?:[^/]+\/)?)img\//.exec(url);
  if (!match) return null;
  return url.replace(match[0], `/product-images/${match[1]}thumb/`);
}

export function quoteItemImagePath(quoteId: string, itemCode: string, extension = 'webp'): string {
  const safeQuote = quoteId.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'draft';
  const safeItem = itemCode.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'item';
  const safeExt = extension.replace(/^\./, '').replace(/[^a-zA-Z0-9]+/g, '') || 'webp';
  return privateQuoteImageReference(`quotes/${safeQuote}/items/${safeItem}/cover.${safeExt}`);
}

/**
 * Bản đồng bộ của `resolveImageUrl`: ảnh công khai (sản phẩm, bảng giá, asset
 * tĩnh) chỉ là phép ghép chuỗi nên dựng được ngay trong lúc render.
 *
 * Trả `null` khi buộc phải tải blob — chỉ ảnh báo giá riêng tư — để phía gọi
 * biết là phải đi đường async. Nhờ đó danh sách vài trăm ảnh không còn tốn mỗi
 * ảnh một effect + một lần commit riêng của React.
 */
export function resolveImageUrlSync(path: string | null | undefined): string | null {
  const normalized = normalizeImagePath(path);
  if (!normalized) return withBasePath(DEFAULT_LOGO_PATH);
  if (/^(https?:|data:|blob:)/i.test(normalized) || normalized.startsWith(appBase())) {
    return normalized;
  }
  if (privateQuoteImagePath(normalized)) return null;

  const key = imageStoreKeyFromPath(normalized);
  if (!key) return withBasePath(DEFAULT_LOGO_PATH);
  return storagePublicUrl(key);
}

export async function resolveImageUrl(path: string | null | undefined): Promise<{
  url: string;
  revoke: boolean;
}> {
  const direct = resolveImageUrlSync(path);
  if (direct !== null) return { url: direct, revoke: false };

  // Chỉ còn đúng một nhánh cần async: ảnh báo giá riêng tư phải tải blob.
  const blob = await downloadImageBlob(normalizeImagePath(path) as string);
  return blob
    ? { url: URL.createObjectURL(blob), revoke: true }
    : { url: withBasePath(DEFAULT_LOGO_PATH), revoke: false };
}

/**
 * Ảnh tĩnh dùng chung (logo dự phòng) chỉ đọc một lần cho cả phiên: mỗi dòng
 * thiếu ảnh trước đây lại tải và mã hoá lại đúng file logo đó.
 */
const publicBlobCache = new Map<string, Promise<Blob | null>>();

function fetchPublicBlob(publicPath: string): Promise<Blob | null> {
  const cached = publicBlobCache.get(publicPath);
  if (cached) return cached;
  const request = (async () => {
    try {
      const response = await fetch(withBasePath(publicPath.replace(/^\/+/, '')));
      return response.ok ? await response.blob() : null;
    } catch {
      return null;
    }
  })();
  publicBlobCache.set(publicPath, request);
  void request.then((value) => {
    if (value === null) publicBlobCache.delete(publicPath);
  });
  return request;
}

/**
 * Đi qua bộ nhớ đệm blob của `imageStorage` trước, để lần xuất file thứ hai (và
 * các dòng trùng ảnh trong cùng một lần xuất) không phải tải lại từ Storage.
 */
async function fetchBlob(source: string, remember = true): Promise<Blob | null> {
  if (remember && imageBlobCacheActive()) {
    const isQuotePrivate = source.startsWith('quotes/') || Boolean(privateQuoteImagePath(source));
    return isQuotePrivate ? getQuoteImage(source) : getImage(source);
  }
  return downloadImageBlob(source);
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(dataUrl);
  if (!match) return null;
  const [, type = 'application/octet-stream', base64, payload = ''] = match;
  try {
    if (!base64) return new Blob([decodeURIComponent(payload)], { type });
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

/**
 * Bytes của một ảnh, theo bất kỳ dạng đường dẫn nào app đang dùng.
 *
 * Trình xuất file cần blob chứ không cần data URL: từ blob mới giải mã
 * (`createImageBitmap`) và hạ kích thước được, mà không phải dựng chuỗi base64
 * dài vài MB cho mỗi tấm ảnh.
 */
export async function getImageBlobByPath(
  path: string | null | undefined,
  options?: { fallbackLogo?: boolean; remember?: boolean },
): Promise<Blob | null> {
  const useFallback = options?.fallbackLogo !== false;
  // `remember: false` cho trình xuất file: ảnh master vài MB không đáng nằm lại
  // trong bộ nhớ đệm dùng chung suốt phiên, vì nó chỉ là bước trung gian để
  // dựng bản 480px.
  const remember = options?.remember !== false;
  const normalized = normalizeImagePath(path);

  const load = async (): Promise<Blob | null> => {
    if (!normalized) return null;
    if (normalized.startsWith('data:')) return dataUrlToBlob(normalized);
    if (/^(https?:|blob:)/i.test(normalized)) return fetchBlob(normalized, remember);
    if (normalized.startsWith(appBase())) {
      try {
        const response = await fetch(normalized);
        return response.ok ? await response.blob() : null;
      } catch {
        return null;
      }
    }
    const key = imageStoreKeyFromPath(normalized);
    if (!key) return null;
    return fetchBlob(key, remember);
  };

  const blob = await load();
  if (blob) return blob;
  if (!useFallback) return null;
  return fetchPublicBlob(DEFAULT_LOGO_PATH);
}

/**
 * Load image as data URL for DOCX embedding.
 * Falls back to OWIN logo when path is missing or unreadable.
 */
export async function getImageDataUrlByPath(
  path: string | null | undefined,
  options?: { fallbackLogo?: boolean },
): Promise<string | null> {
  // Ảnh đã là data URL thì trả thẳng — khỏi vòng Blob → FileReader.
  const normalized = normalizeImagePath(path);
  if (normalized?.startsWith('data:')) return normalized;
  const blob = await getImageBlobByPath(path, options);
  return blob ? blobToDataUrl(blob) : null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
