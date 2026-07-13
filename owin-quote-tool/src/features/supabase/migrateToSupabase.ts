/**
 * MIGRATE 1 LẦN: dữ liệu cũ (IndexedDB) → Supabase. Chạy lại nhiều lần vẫn an toàn
 * (upsert theo id, KHÔNG xoá gì ở local).
 *
 * Nguyên tắc (theo yêu cầu tối ưu DB):
 *  - KHÔNG bỏ sản phẩm nào (kể cả trùng metadata — chúng có ảnh chi tiết khác nhau).
 *  - Mã chứa "COPY" → regen mã sạch (id giữ nguyên nên vẫn upsert đúng dòng).
 *  - Ảnh lưu 1 LẦN theo nội dung (hash) rồi trỏ chung → tiết kiệm, dùng ở list/bảng giá/chi tiết.
 *  - Backfill cover: nếu cover rỗng nhưng có ảnh trong gallery → lấy làm cover (list hết logo).
 */
import type { ProductRecord } from '@/types/models';
import { getAllProductsRaw } from '@/features/products/productStore';
import { getAllQuotesRaw } from '@/features/quote/quoteStore';
import { getImage } from '@/utils/imageStorage';
import { imageStoreKeyFromPath } from '@/utils/imagePaths';
import { generateProductCode } from '@/lib/products/productCode';
import { upsertProductsBatch } from './productsRepo';
import { upsertQuotesBatch } from './quotesRepo';
import { uploadImageDedup } from './imagesRepo';

export interface MigrateReport {
  products: number;
  regeneratedCodes: number;
  images: number;
  imageErrors: number;
  quotes: number;
}

/** Mã mới sạch cho sp có "COPY" — cùng timestamp + số thứ tự để không đụng nhau. */
function regenCode(index: number): string {
  return `${generateProductCode()}${String(index).padStart(4, '0')}`;
}

/**
 * Trả về path ảnh dùng cho cover:
 *  - path tĩnh/URL (imported-assets, http…) → dùng nguyên (đã hiển thị được).
 *  - path blob trong IndexedDB → upload dedup → URL CDN.
 * Ưu tiên cover, nếu không có ảnh thì thử lần lượt gallery (backfill).
 */
async function resolveCover(
  p: ProductRecord,
  seen: Set<string>,
  report: MigrateReport,
): Promise<string | null> {
  const candidates = [p.coverImagePath, ...(Array.isArray(p.gallery) ? p.gallery : [])].filter(Boolean) as string[];
  for (const path of candidates) {
    const key = imageStoreKeyFromPath(path);
    if (!key) return path; // ảnh tĩnh/URL → hiển thị được ở mọi nơi
    try {
      const blob = await getImage(key);
      if (blob) { report.images += 1; return await uploadImageDedup(blob, seen); }
    } catch { report.imageErrors += 1; }
  }
  return p.coverImagePath ?? null; // không có ảnh → giữ nguyên (có thể null → logo, chấp nhận)
}

/** Upload các ảnh gallery (blob) lên dạng dedup; ảnh tĩnh/URL giữ nguyên. */
async function resolveGallery(p: ProductRecord, seen: Set<string>, report: MigrateReport): Promise<string[]> {
  const out: string[] = [];
  for (const path of Array.isArray(p.gallery) ? p.gallery : []) {
    if (!path) continue;
    const key = imageStoreKeyFromPath(path);
    if (!key) { out.push(path); continue; }
    try {
      const blob = await getImage(key);
      if (blob) { report.images += 1; out.push(await uploadImageDedup(blob, seen)); }
    } catch { report.imageErrors += 1; }
  }
  return out;
}

export async function migrateToSupabase(
  opts: { onProgress?: (msg: string) => void } = {},
): Promise<MigrateReport> {
  const report: MigrateReport = { products: 0, regeneratedCodes: 0, images: 0, imageErrors: 0, quotes: 0 };
  const seen = new Set<string>(); // hash ảnh đã upload trong phiên này

  const all = (await getAllProductsRaw()).filter((p) => !p.deletedAt);
  const migrated: ProductRecord[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const p = all[i];
    opts.onProgress?.(`Ảnh & sản phẩm ${i + 1}/${all.length}`);
    const cover = await resolveCover(p, seen, report);
    const gallery = await resolveGallery(p, seen, report);
    let code = p.code;
    if (/copy/i.test(code)) { code = regenCode(i); report.regeneratedCodes += 1; }
    migrated.push({ ...p, code, coverImagePath: cover, gallery });
  }
  await upsertProductsBatch(migrated);
  report.products = migrated.length;

  const quotes = (await getAllQuotesRaw()).filter((q) => !q.deletedAt);
  opts.onProgress?.(`Báo giá ${quotes.length}`);
  await upsertQuotesBatch(quotes);
  report.quotes = quotes.length;

  return report;
}
