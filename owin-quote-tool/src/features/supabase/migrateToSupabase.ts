/**
 * MIGRATE 1 LẦN: dữ liệu cũ (IndexedDB) → Supabase.
 * - Upload ảnh sản phẩm (blob trong máy) lên Storage → đổi path thành URL CDN.
 * - Dedupe sản phẩm trùng y hệt (name+nhóm+ĐVT+giá+kích thước) → bỏ bản dư (rác -COPY-).
 * - Upsert products + quotes. KHÔNG xoá gì ở local — chạy lại nhiều lần vẫn an toàn.
 */
import type { ProductRecord } from '@/types/models';
import { getAllProductsRaw } from '@/features/products/productStore';
import { getAllQuotesRaw } from '@/features/quote/quoteStore';
import { getImage } from '@/utils/imageStorage';
import { imageStoreKeyFromPath } from '@/utils/imagePaths';
import { upsertProductsBatch } from './productsRepo';
import { upsertQuotesBatch } from './quotesRepo';
import { uploadImageBlob, storagePathFor } from './imagesRepo';

export interface MigrateReport {
  products: number;
  skippedDuplicates: number;
  images: number;
  imageErrors: number;
  quotes: number;
}

function dupSignature(p: ProductRecord): string {
  return [
    (p.name ?? '').trim().toLowerCase(),
    p.category ?? '',
    p.unit ?? '',
    Math.round(Number(p.unitPriceVnd ?? 0)),
    p.rawSizeText ?? '',
  ].join('|');
}

async function migrateImage(
  productCode: string,
  path: string | null | undefined,
  filename: string,
  report: MigrateReport,
): Promise<string | null | undefined> {
  if (!path) return path;
  const key = imageStoreKeyFromPath(path);
  if (!key) return path; // ảnh tĩnh (imported-assets) hoặc đã là URL → giữ nguyên
  try {
    const blob = await getImage(key);
    if (!blob) return path;
    const url = await uploadImageBlob(storagePathFor(productCode, filename), blob);
    report.images += 1;
    return url;
  } catch {
    report.imageErrors += 1;
    return path;
  }
}

async function migrateProduct(p: ProductRecord, report: MigrateReport): Promise<ProductRecord> {
  const cover = await migrateImage(p.code, p.coverImagePath, 'cover.webp', report);
  const gallery: string[] = [];
  const src = Array.isArray(p.gallery) ? p.gallery : [];
  for (let i = 0; i < src.length; i += 1) {
    const g = await migrateImage(p.code, src[i], `g${i}.webp`, report);
    if (g) gallery.push(g);
  }
  return { ...p, coverImagePath: cover ?? null, gallery };
}

export async function migrateToSupabase(
  opts: { dedupe?: boolean; onProgress?: (msg: string) => void } = {},
): Promise<MigrateReport> {
  const dedupe = opts.dedupe !== false;
  const report: MigrateReport = { products: 0, skippedDuplicates: 0, images: 0, imageErrors: 0, quotes: 0 };

  const all = (await getAllProductsRaw()).filter((p) => !p.deletedAt);
  const sorted = [...all].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const seen = new Set<string>();
  const keep: ProductRecord[] = [];
  for (const p of sorted) {
    if (dedupe) {
      const sig = dupSignature(p);
      if (seen.has(sig)) { report.skippedDuplicates += 1; continue; }
      seen.add(sig);
    }
    keep.push(p);
  }

  const migrated: ProductRecord[] = [];
  for (let i = 0; i < keep.length; i += 1) {
    opts.onProgress?.(`Ảnh & sản phẩm ${i + 1}/${keep.length}`);
    migrated.push(await migrateProduct(keep[i], report));
  }
  await upsertProductsBatch(migrated);
  report.products = migrated.length;

  const quotes = (await getAllQuotesRaw()).filter((q) => !q.deletedAt);
  opts.onProgress?.(`Báo giá ${quotes.length}`);
  await upsertQuotesBatch(quotes);
  report.quotes = quotes.length;

  return report;
}
