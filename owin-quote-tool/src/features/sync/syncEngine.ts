/**
 * ORCHESTRATOR SYNC (TASK 5.3/5.4) — buộc các mảnh lại:
 *   ensureToken → tải remote DB → merge (LWW+tombstone+conflict) → nếu conflict thì
 *   trả cho UI hiện dialog (KHÔNG tự nuốt) → nếu sạch thì ghi local + đẩy lên Drive + lưu base.
 *
 * Local-first: nếu offline hoặc chưa cấu hình Google → bỏ qua êm, thay đổi vẫn nằm IndexedDB
 * + hàng đợi. Không chặn việc dùng app.
 */

import type {
  AluminumCalculationRecord,
  OwinDB,
  ProductRecord,
  QuoteRecord,
  SuggestionRecord,
} from '@/types/models';
import { getAllProductsRaw, bulkPut, normalizeProductRecord } from '@/features/products/productStore';
import { getAllQuotesRaw, bulkPutQuotes } from '@/features/quote/quoteStore';
import { bulkPutSuggestions, getAllSuggestionRecords } from '@/lib/suggestions';
import {
  bulkPutAluminumCalculations,
  getAllAluminumCalculationsRaw,
  normalizeAluminumCalculationRecord,
} from '@/features/aluminum/aluminumEstimatorStorage';
import { mergeEntities, type Conflict } from './merge';
import { downloadDB, getDBMetadata, uploadDB } from './driveSync';
import { isConfigured } from './googleAuth';
import { clearQueue } from './syncQueue';
import { notifyProductsChanged } from '@/features/products/productEvents';
import { syncReferencedImages } from './imageSync';
import { backfillQuoteImageReferences } from '@/lib/media/imageMigration';
import localforage from 'localforage';

const SCHEMA_VERSION = 2;

const metaStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'sync-meta',
  driver: localforage.INDEXEDDB,
});
const BASE_PRODUCTS_KEY = 'lastSyncProducts';
const BASE_QUOTES_KEY = 'lastSyncQuotes';
const BASE_SUGGESTIONS_KEY = 'lastSyncSuggestions';
const BASE_ALUMINUM_KEY = 'lastSyncAluminumCalculations';
const REMOTE_SIGNATURE_KEY = 'lastSyncRemoteSignature';

async function loadBaseProducts(): Promise<ProductRecord[]> {
  return (await metaStore.getItem<ProductRecord[]>(BASE_PRODUCTS_KEY)) ?? [];
}
async function saveBaseProducts(products: ProductRecord[]): Promise<void> {
  await metaStore.setItem(BASE_PRODUCTS_KEY, products);
}
async function loadBaseQuotes(): Promise<QuoteRecord[]> {
  return (await metaStore.getItem<QuoteRecord[]>(BASE_QUOTES_KEY)) ?? [];
}
async function saveBaseQuotes(quotes: QuoteRecord[]): Promise<void> {
  await metaStore.setItem(BASE_QUOTES_KEY, quotes);
}
async function loadBaseSuggestions(): Promise<SuggestionRecord[]> {
  return (await metaStore.getItem<SuggestionRecord[]>(BASE_SUGGESTIONS_KEY)) ?? [];
}
async function saveBaseSuggestions(suggestions: SuggestionRecord[]): Promise<void> {
  await metaStore.setItem(BASE_SUGGESTIONS_KEY, suggestions);
}
async function loadBaseAluminumCalculations(): Promise<AluminumCalculationRecord[]> {
  return (await metaStore.getItem<AluminumCalculationRecord[]>(BASE_ALUMINUM_KEY)) ?? [];
}
async function saveBaseAluminumCalculations(records: AluminumCalculationRecord[]): Promise<void> {
  await metaStore.setItem(BASE_ALUMINUM_KEY, records);
}

function normalizeRemoteAluminum(records: unknown): AluminumCalculationRecord[] {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => normalizeAluminumCalculationRecord(record))
    .filter((record): record is AluminumCalculationRecord => record !== null);
}

export type SyncStatus =
  | { state: 'skipped'; reason: 'offline' | 'not-configured' }
  | { state: 'unchanged' }
  | { state: 'need-relogin' }
  | {
      state: 'conflict';
      conflicts: Conflict<ProductRecord>[];
      quoteConflicts: Conflict<QuoteRecord>[];
      merged: ProductRecord[];
      mergedQuotes: QuoteRecord[];
    }
  | { state: 'error'; message: string; imageErrors?: number }
  | { state: 'done'; pushed: number; images?: number; imageErrors?: number };

export interface SyncOptions {
  /** Auto-save metadata có thể hoãn ảnh sang nhịp idle dài hơn để không làm chậm UI. */
  includeImages?: boolean;
  /** Bắt buộc xác nhận rõ ràng trước thao tác ghi đè toàn bộ. */
  confirmed?: boolean;
}

export interface ResolvedSync {
  products: ProductRecord[];
  quotes?: QuoteRecord[];
}

export async function loadRemoteSignature(): Promise<string | null> {
  return (await metaStore.getItem<string>(REMOTE_SIGNATURE_KEY)) ?? null;
}

export async function saveRemoteSignature(signature: string | null): Promise<void> {
  if (signature) await metaStore.setItem(REMOTE_SIGNATURE_KEY, signature);
  else await metaStore.removeItem(REMOTE_SIGNATURE_KEY);
}

function remoteSignature(metadata: { id: string; modifiedTime?: string; version?: string }): string {
  return [metadata.id, metadata.modifiedTime ?? '', metadata.version ?? ''].join(':');
}

/** Chỉ đọc metadata Drive; không tải JSON hay ảnh khi file chưa đổi. */
export async function checkRemoteChanges(): Promise<
  | { state: 'skipped'; reason: 'offline' | 'not-configured' }
  | { state: 'unchanged' }
  | { state: 'changed'; signature: string }
> {
  if (!isConfigured()) return { state: 'skipped', reason: 'not-configured' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'skipped', reason: 'offline' };
  }
  const metadata = await getDBMetadata();
  const signature = metadata ? remoteSignature(metadata) : 'missing';
  if (signature === (await loadRemoteSignature())) return { state: 'unchanged' };
  return { state: 'changed', signature };
}

/**
 * Chạy 1 vòng đồng bộ. KHÔNG tự giải quyết conflict — trả về để UI hỏi người.
 * @param resolvedMerged nếu UI đã giải quyết conflict xong, truyền mảng đã chốt để đẩy thẳng.
 */
export async function syncNow(
  resolvedMerged?: ProductRecord[] | ResolvedSync,
  options: SyncOptions = {},
): Promise<SyncStatus> {
  if (!isConfigured()) return { state: 'skipped', reason: 'not-configured' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'skipped', reason: 'offline' };
  }

  try {
    const local = await getAllProductsRaw();
    const localQuotes = await getAllQuotesRaw();
    const localSuggestions = await getAllSuggestionRecords();
    const localAluminum = await getAllAluminumCalculationsRaw();
    const remoteDB = await downloadDB();
    const remote = (remoteDB?.products ?? []).map((product, index) =>
      normalizeProductRecord(product, index + 1),
    );
    const remoteQuotes = remoteDB?.quotes ?? [];
    const remoteSuggestions = remoteDB?.suggestions ?? [];
    const remoteAluminum = normalizeRemoteAluminum(remoteDB?.aluminumCalculations);

    let productConflicts: Conflict<ProductRecord>[] = [];
    let finalProducts: ProductRecord[];
    if (resolvedMerged && !Array.isArray(resolvedMerged)) {
      finalProducts = resolvedMerged.products;
    } else if (Array.isArray(resolvedMerged)) {
      finalProducts = resolvedMerged;
    } else {
      const base = await loadBaseProducts();
      const { merged, conflicts } = mergeEntities(local, remote, base);
      productConflicts = conflicts;
      finalProducts = merged;
    }

    const quoteBase = await loadBaseQuotes();
    const quoteMerge = mergeEntities(localQuotes, remoteQuotes, quoteBase);
    let finalQuotes = resolvedMerged && !Array.isArray(resolvedMerged) && resolvedMerged.quotes
      ? resolvedMerged.quotes
      : quoteMerge.merged;
    finalQuotes = backfillQuoteImageReferences(finalQuotes, finalProducts).quotes;
    const suggestionBase = await loadBaseSuggestions();
    const finalSuggestions = mergeEntities(localSuggestions, remoteSuggestions, suggestionBase).merged;
    const aluminumBase = await loadBaseAluminumCalculations();
    const finalAluminum = mergeEntities(localAluminum, remoteAluminum, aluminumBase).merged;

    if (productConflicts.length > 0 || quoteMerge.conflicts.length > 0) {
      return {
        state: 'conflict',
        conflicts: productConflicts,
        quoteConflicts: quoteMerge.conflicts,
        merged: finalProducts,
        mergedQuotes: finalQuotes,
      };
    }

    // Ghi kết quả về local + đẩy lên Drive (chỉ metadata — BR-9, ảnh đẩy riêng).
    await bulkPut(finalProducts);
    await bulkPutQuotes(finalQuotes);
    await bulkPutSuggestions(finalSuggestions);
    await bulkPutAluminumCalculations(finalAluminum);
    notifyProductsChanged();
    const imageResult = options.includeImages === false
      ? { count: 0, errors: 0 }
      : await syncReferencedImages(finalProducts, finalQuotes);
    if (imageResult.errors > 0) {
      return { state: 'error', message: 'Đồng bộ ảnh thất bại; dữ liệu chưa được báo là đã đồng bộ.', imageErrors: imageResult.errors };
    }
    const db: OwinDB = {
      schemaVersion: SCHEMA_VERSION,
      systems: [],
      products: finalProducts,
      quotes: finalQuotes,
      suggestions: finalSuggestions,
      aluminumCalculations: finalAluminum,
    };
    await uploadDB(db);
    await saveBaseProducts(finalProducts);
    await saveBaseQuotes(finalQuotes);
    await saveBaseSuggestions(finalSuggestions);
    await saveBaseAluminumCalculations(finalAluminum);
    const uploadedMetadata = await getDBMetadata();
    await saveRemoteSignature(uploadedMetadata ? remoteSignature(uploadedMetadata) : null);
    await clearQueue();
    return {
      state: 'done',
      pushed: finalProducts.length + finalQuotes.length + finalSuggestions.length + finalAluminum.length,
      images: imageResult.count,
      imageErrors: imageResult.errors,
    };
  } catch (e) {
    if (e instanceof Error && e.message === 'NEED_RELOGIN') {
      return { state: 'need-relogin' };
    }
    return { state: 'error', message: e instanceof Error ? e.message : 'Lỗi đồng bộ' };
  }
}

/**
 * FORCE PUSH chỉ dành cho thao tác thủ công đã xác nhận rõ ràng; không được gọi bởi auto-sync.
 */
export async function forcePushToDrive(options: SyncOptions = {}): Promise<SyncStatus> {
  if (!options.confirmed) return { state: 'error', message: 'Cần xác nhận ghi đè toàn bộ dữ liệu Google Drive.' };
  if (!isConfigured()) return { state: 'skipped', reason: 'not-configured' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'skipped', reason: 'offline' };
  }

  try {
    const products = await getAllProductsRaw();
    const quotes = await getAllQuotesRaw();
    const suggestions = await getAllSuggestionRecords();
    const aluminum = await getAllAluminumCalculationsRaw();

    const imageResult =
      options.includeImages === false ? { count: 0, errors: 0 } : await syncReferencedImages(products, quotes);
    if (imageResult.errors > 0) {
      return { state: 'error', message: 'Ghi đè thất bại vì ảnh chưa đồng bộ.', imageErrors: imageResult.errors };
    }

    const db: OwinDB = {
      schemaVersion: SCHEMA_VERSION,
      systems: [],
      products,
      quotes,
      suggestions,
      aluminumCalculations: aluminum,
    };
    await uploadDB(db);

    // Base = local ⇒ Drive/local/base trùng nhau ⇒ merge thủ công sau này không sinh xung đột ảo.
    await saveBaseProducts(products);
    await saveBaseQuotes(quotes);
    await saveBaseSuggestions(suggestions);
    await saveBaseAluminumCalculations(aluminum);
    await clearQueue();

    return {
      state: 'done',
      pushed: products.length + quotes.length + suggestions.length + aluminum.length,
      images: imageResult.count,
      imageErrors: imageResult.errors,
    };
  } catch (e) {
    if (e instanceof Error && e.message === 'NEED_RELOGIN') {
      return { state: 'need-relogin' };
    }
    throw e;
  }
}

export {
  loadBaseProducts,
  saveBaseProducts,
  loadBaseQuotes,
  saveBaseQuotes,
  loadBaseSuggestions,
  saveBaseSuggestions,
  loadBaseAluminumCalculations,
  saveBaseAluminumCalculations,
};
