/**
 * One-time rescue import for browsers that still contain the pre-Supabase
 * LocalForage database. Normal application reads/writes never use these stores.
 */
import localforage from 'localforage';
import type { ProductRecord, QuoteRecord, SuggestionRecord } from '@/types/models';
import { normalizeProductRecord } from '@/features/products/productStore';
import { normalizeQuoteRecord } from '@/features/quote/quoteStore';
import { normalizeAluminumCalculationRecord } from '@/features/aluminum/aluminumEstimatorStorage';
import { imageStoreKeyFromPath } from '@/utils/imagePaths';
import { generateProductCode } from '@/lib/products/productCode';
import { upsertProductsBatch } from './productsRepo';
import { upsertQuotesBatch } from './quotesRepo';
import { uploadImageBlob, uploadImageDedup } from './imagesRepo';
import { upsertHostedAppData, upsertHostedSuggestions } from './sharedDataRepo';

const DB_NAME = 'owin-quote-tool';
const legacyProducts = localforage.createInstance({ name: DB_NAME, storeName: 'products' });
const legacyQuotes = localforage.createInstance({ name: DB_NAME, storeName: 'quotes' });
const legacySuggestions = localforage.createInstance({ name: DB_NAME, storeName: 'suggestions' });
const legacyAppMeta = localforage.createInstance({ name: DB_NAME, storeName: 'app_meta' });
const legacyAluminum = localforage.createInstance({ name: DB_NAME, storeName: 'aluminum_calculations' });
const legacyProductImages = localforage.createInstance({ name: DB_NAME, storeName: 'product_images' });
const legacyImages = localforage.createInstance({ name: DB_NAME, storeName: 'images' });
const legacyQuoteImages = localforage.createInstance({ name: DB_NAME, storeName: 'quote_images' });

export interface MigrateReport {
  products: number;
  regeneratedCodes: number;
  images: number;
  imageErrors: number;
  quotes: number;
  suggestions: number;
}

async function valuesFromStore<T>(store: LocalForage): Promise<T[]> {
  const values: T[] = [];
  await store.iterate<T, void>((value, key) => {
    if (!key.startsWith('__') && value && typeof value !== 'boolean') values.push(value);
  });
  return values;
}

async function getLegacyImage(key: string): Promise<Blob | null> {
  return (await legacyProductImages.getItem<Blob>(key)) ?? legacyImages.getItem<Blob>(key);
}

async function migrateImagePath(
  path: string,
  seen: Set<string>,
  report: MigrateReport,
): Promise<string> {
  const key = imageStoreKeyFromPath(path);
  if (!key) return path;
  try {
    const blob = await getLegacyImage(key);
    if (!blob) return path;
    const url = await uploadImageDedup(blob, seen);
    report.images += 1;
    return url;
  } catch {
    report.imageErrors += 1;
    return path;
  }
}

async function migrateProductImages(
  product: ProductRecord,
  seen: Set<string>,
  report: MigrateReport,
): Promise<ProductRecord> {
  const gallery: string[] = [];
  for (const path of product.gallery ?? []) gallery.push(await migrateImagePath(path, seen, report));
  let coverImagePath = product.coverImagePath
    ? await migrateImagePath(product.coverImagePath, seen, report)
    : null;
  if (!coverImagePath && gallery.length > 0) coverImagePath = gallery[0];
  return { ...product, coverImagePath, gallery };
}

export async function countLegacyData(): Promise<{ products: number; quotes: number }> {
  const [products, quotes] = await Promise.all([
    valuesFromStore<Record<string, unknown>>(legacyProducts),
    valuesFromStore<Record<string, unknown>>(legacyQuotes),
  ]);
  return {
    products: products.filter((product) => product.deleted !== true && !product.deletedAt).length,
    quotes: quotes.filter((quote) => quote.deleted !== true && !quote.deletedAt).length,
  };
}

export async function migrateToSupabase(
  opts: { onProgress?: (message: string) => void } = {},
): Promise<MigrateReport> {
  const report: MigrateReport = {
    products: 0,
    regeneratedCodes: 0,
    images: 0,
    imageErrors: 0,
    quotes: 0,
    suggestions: 0,
  };
  const rawProducts = (await valuesFromStore<Record<string, unknown>>(legacyProducts))
    .filter((product) => product.deleted !== true && !product.deletedAt);
  const seen = new Set<string>();
  const products: ProductRecord[] = [];

  for (let index = 0; index < rawProducts.length; index += 1) {
    opts.onProgress?.(`Khôi phục sản phẩm ${index + 1}/${rawProducts.length}`);
    let product = normalizeProductRecord(rawProducts[index], index + 1);
    if (/copy/i.test(product.code)) {
      product = { ...product, code: `${generateProductCode()}${String(index).padStart(4, '0')}` };
      report.regeneratedCodes += 1;
    }
    products.push(await migrateProductImages(product, seen, report));
  }
  await upsertProductsBatch(products);
  report.products = products.length;

  const rawQuotes = (await valuesFromStore<Partial<QuoteRecord>>(legacyQuotes))
    .filter((quote) => quote.deleted !== true && !quote.deletedAt);
  const quotes = rawQuotes.map((quote) => normalizeQuoteRecord(quote));
  opts.onProgress?.(`Khôi phục ${quotes.length} báo giá`);
  await upsertQuotesBatch(quotes);
  report.quotes = quotes.length;

  const quoteImages: Array<[string, Blob]> = [];
  await legacyQuoteImages.iterate<Blob, void>((blob, path) => {
    if (blob instanceof Blob && path) quoteImages.push([path, blob]);
  });
  for (const [path, blob] of quoteImages) {
    try {
      await uploadImageBlob(path, blob);
      report.images += 1;
    } catch {
      report.imageErrors += 1;
    }
  }

  const suggestions = (await valuesFromStore<SuggestionRecord>(legacySuggestions))
    .filter((record) => record.id && record.type && record.value && !record.deleted && !record.deletedAt);
  await upsertHostedSuggestions(suggestions, { ignoreExisting: true });
  report.suggestions = suggestions.length;

  const appMeta = await legacyAppMeta.getItem<unknown>('app');
  if (appMeta) await upsertHostedAppData('app', appMeta);
  const aluminum = normalizeAluminumCalculationRecord(
    await legacyAluminum.getItem('owin_aluminum_estimator_v2'),
  );
  if (aluminum) await upsertHostedAppData(aluminum.id, aluminum);

  return report;
}
