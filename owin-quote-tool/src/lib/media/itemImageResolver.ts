import type { ProductRecord } from '@/types/models';
import { getImage, getQuoteImage } from '@/utils/imageStorage';
import { imageStoreKeyFromPath, normalizeImagePath } from '@/utils/imagePaths';

export type ImageItem = {
  productId?: string | null;
  sourceProductId?: string | null;
  productCode?: string | null;
  itemName?: string | null;
  slug?: string | null;
  imagePath?: string | null;
  image?: string | null;
  coverImagePath?: string | null;
  imageReference?: string | null;
  imageOverridePath?: string | null;
};

export type ResolvedItemImage = {
  url: string | null;
  blob: Blob | null;
  path: string | null;
  source: 'override' | 'snapshot' | 'source-product' | 'product' | 'legacy' | 'static' | 'missing';
  revoke: boolean;
};

const EMPTY: ResolvedItemImage = { url: null, blob: null, path: null, source: 'missing', revoke: false };

function candidates(item: ImageItem, products: ProductRecord[]): Array<{ path: string; source: ResolvedItemImage['source'] }> {
  const sourceId = item.sourceProductId || item.productId || null;
  const source = sourceId ? products.find((p) => p.id === sourceId) : undefined;
  const code = String(item.productCode || '').trim().toLowerCase();
  const name = String(item.itemName || '').trim().toLowerCase();
  const codeMatch = code ? products.filter((p) => p.code.toLowerCase() === code) : [];
  const slugMatch = name ? products.filter((p) => p.slug.toLowerCase() === name) : [];
  const product = source || (codeMatch.length === 1 ? codeMatch[0] : undefined) || (slugMatch.length === 1 ? slugMatch[0] : undefined);
  const out: Array<{ path: string; source: ResolvedItemImage['source'] }> = [];
  const add = (path: string | null | undefined, imageSource: ResolvedItemImage['source']) => {
    const normalized = normalizeImagePath(path);
    if (normalized && !out.some((entry) => entry.path === normalized)) out.push({ path: normalized, source: imageSource });
  };
  add(item.imageOverridePath, 'override');
  const legacy = item.imagePath || item.image;
  if (legacy && legacy !== item.imageReference && legacy !== item.imageOverridePath) add(legacy, 'legacy');
  add(item.imageReference, 'snapshot');
  add(source?.coverImagePath, 'source-product');
  add(product?.coverImagePath, product ? (source ? 'source-product' : 'product') : 'legacy');
  add(item.coverImagePath, 'legacy');
  add(item.image, 'legacy');
  return out;
}

async function blobForPath(path: string): Promise<Blob | null> {
  const normalized = normalizeImagePath(path);
  if (!normalized || /^(https?:|data:|blob:)/i.test(normalized)) return null;
  const key = imageStoreKeyFromPath(normalized);
  if (!key) return null;
  return normalized.startsWith('quotes/') ? getQuoteImage(key) : getImage(key);
}

/** Single image lookup used by quote/catalogue UI and all binary exporters. */
export async function resolveItemImage(item: ImageItem, products: ProductRecord[] = []): Promise<ResolvedItemImage> {
  for (const candidate of candidates(item, products)) {
    const normalized = normalizeImagePath(candidate.path);
    if (!normalized) continue;
    if (/^data:/i.test(normalized)) return { url: normalized, blob: null, path: normalized, source: candidate.source, revoke: false };
    if (/^(https?:|blob:)/i.test(normalized) || normalized.startsWith((import.meta.env.BASE_URL || '/').replace(/\/$/, '/'))) {
      return { url: normalized, blob: null, path: normalized, source: 'static', revoke: false };
    }
    const blob = await blobForPath(normalized);
    if (blob) return { url: URL.createObjectURL(blob), blob, path: normalized, source: candidate.source, revoke: true };
  }
  return EMPTY;
}

export function imageReferenceForProduct(product: ProductRecord): string | null {
  return normalizeImagePath(product.coverImagePath);
}
