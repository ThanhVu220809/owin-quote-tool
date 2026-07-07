/**
 * ORCHESTRATOR SYNC (TASK 5.3/5.4) — buộc các mảnh lại:
 *   ensureToken → tải remote DB → merge (LWW+tombstone+conflict) → nếu conflict thì
 *   trả cho UI hiện dialog (KHÔNG tự nuốt) → nếu sạch thì ghi local + đẩy lên Drive + lưu base.
 *
 * Local-first: nếu offline hoặc chưa cấu hình Google → bỏ qua êm, thay đổi vẫn nằm IndexedDB
 * + hàng đợi. Không chặn việc dùng app.
 */

import type { OwinDB, ProductRecord, QuoteRecord, SuggestionRecord } from '@/types/models';
import { getAllProductsRaw, bulkPut, normalizeProductRecord } from '@/features/products/productStore';
import { getAllQuotesRaw, bulkPutQuotes } from '@/features/quote/quoteStore';
import { bulkPutSuggestions, getAllSuggestionRecords } from '@/lib/suggestions';
import { mergeEntities, type Conflict } from './merge';
import { downloadDB, uploadDB } from './driveSync';
import { isConfigured } from './googleAuth';
import { clearQueue } from './syncQueue';
import { notifyProductsChanged } from '@/features/products/productEvents';
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

export type SyncStatus =
  | { state: 'skipped'; reason: 'offline' | 'not-configured' }
  | { state: 'need-relogin' }
  | { state: 'conflict'; conflicts: Conflict<ProductRecord>[]; merged: ProductRecord[] }
  | { state: 'done'; pushed: number };

/**
 * Chạy 1 vòng đồng bộ. KHÔNG tự giải quyết conflict — trả về để UI hỏi người.
 * @param resolvedMerged nếu UI đã giải quyết conflict xong, truyền mảng đã chốt để đẩy thẳng.
 */
export async function syncNow(resolvedMerged?: ProductRecord[]): Promise<SyncStatus> {
  if (!isConfigured()) return { state: 'skipped', reason: 'not-configured' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'skipped', reason: 'offline' };
  }

  try {
    let finalProducts: ProductRecord[];
    let finalQuotes = await getAllQuotesRaw();
    let finalSuggestions = await getAllSuggestionRecords();

    if (resolvedMerged) {
      finalProducts = resolvedMerged;
    } else {
      const local = await getAllProductsRaw();
      const localQuotes = finalQuotes;
      const localSuggestions = finalSuggestions;
      const remoteDB = await downloadDB();
      const remote = (remoteDB?.products ?? []).map((product, index) =>
        normalizeProductRecord(product, index + 1),
      );
      const remoteQuotes = remoteDB?.quotes ?? [];
      const remoteSuggestions = remoteDB?.suggestions ?? [];
      const base = await loadBaseProducts();
      const { merged, conflicts } = mergeEntities(local, remote, base);
      if (conflicts.length > 0) {
        return { state: 'conflict', conflicts, merged };
      }
      finalProducts = merged;

      const quoteBase = await loadBaseQuotes();
      finalQuotes = mergeEntities(localQuotes, remoteQuotes, quoteBase).merged;
      const suggestionBase = await loadBaseSuggestions();
      finalSuggestions = mergeEntities(localSuggestions, remoteSuggestions, suggestionBase).merged;
    }

    // Ghi kết quả về local + đẩy lên Drive (chỉ metadata — BR-9, ảnh đẩy riêng).
    await bulkPut(finalProducts);
    await bulkPutQuotes(finalQuotes);
    await bulkPutSuggestions(finalSuggestions);
    notifyProductsChanged();
    const db: OwinDB = {
      schemaVersion: SCHEMA_VERSION,
      systems: [],
      products: finalProducts,
      quotes: finalQuotes,
      suggestions: finalSuggestions,
    };
    await uploadDB(db);
    await saveBaseProducts(finalProducts);
    await saveBaseQuotes(finalQuotes);
    await saveBaseSuggestions(finalSuggestions);
    await clearQueue();
    return { state: 'done', pushed: finalProducts.length + finalQuotes.length + finalSuggestions.length };
  } catch (e) {
    if (e instanceof Error && e.message === 'NEED_RELOGIN') {
      return { state: 'need-relogin' };
    }
    throw e;
  }
}

export { loadBaseProducts, saveBaseProducts, loadBaseQuotes, saveBaseQuotes, loadBaseSuggestions, saveBaseSuggestions };
