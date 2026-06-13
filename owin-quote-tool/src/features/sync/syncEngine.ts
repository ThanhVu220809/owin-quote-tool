/**
 * ORCHESTRATOR SYNC (TASK 5.3/5.4) — buộc các mảnh lại:
 *   ensureToken → tải remote DB → merge (LWW+tombstone+conflict) → nếu conflict thì
 *   trả cho UI hiện dialog (KHÔNG tự nuốt) → nếu sạch thì ghi local + đẩy lên Drive + lưu base.
 *
 * Local-first: nếu offline hoặc chưa cấu hình Google → bỏ qua êm, thay đổi vẫn nằm IndexedDB
 * + hàng đợi. Không chặn việc dùng app.
 */

import type { OwinDB, Product } from '@/types/models';
import { getAllProductsRaw, bulkPut } from '@/features/products/productStore';
import { mergeEntities, type Conflict } from './merge';
import { downloadDB, uploadDB } from './driveSync';
import { isConfigured } from './googleAuth';
import { clearQueue } from './syncQueue';
import { notifyProductsChanged } from '@/features/products/productEvents';
import localforage from 'localforage';

const SCHEMA_VERSION = 1;

const metaStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'sync-meta',
  driver: localforage.INDEXEDDB,
});
const BASE_KEY = 'lastSyncProducts';

async function loadBase(): Promise<Product[]> {
  return (await metaStore.getItem<Product[]>(BASE_KEY)) ?? [];
}
async function saveBase(products: Product[]): Promise<void> {
  await metaStore.setItem(BASE_KEY, products);
}

export type SyncStatus =
  | { state: 'skipped'; reason: 'offline' | 'not-configured' }
  | { state: 'need-relogin' }
  | { state: 'conflict'; conflicts: Conflict<Product>[]; merged: Product[] }
  | { state: 'done'; pushed: number };

/**
 * Chạy 1 vòng đồng bộ. KHÔNG tự giải quyết conflict — trả về để UI hỏi người.
 * @param resolvedMerged nếu UI đã giải quyết conflict xong, truyền mảng đã chốt để đẩy thẳng.
 */
export async function syncNow(resolvedMerged?: Product[]): Promise<SyncStatus> {
  if (!isConfigured()) return { state: 'skipped', reason: 'not-configured' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'skipped', reason: 'offline' };
  }

  try {
    let finalProducts: Product[];

    if (resolvedMerged) {
      finalProducts = resolvedMerged;
    } else {
      const local = await getAllProductsRaw();
      const remoteDB = await downloadDB();
      const remote = remoteDB?.products ?? [];
      const base = await loadBase();
      const { merged, conflicts } = mergeEntities(local, remote, base);
      if (conflicts.length > 0) {
        return { state: 'conflict', conflicts, merged };
      }
      finalProducts = merged;
    }

    // Ghi kết quả về local + đẩy lên Drive (chỉ metadata — BR-9, ảnh đẩy riêng).
    await bulkPut(finalProducts);
    notifyProductsChanged();
    const db: OwinDB = { schemaVersion: SCHEMA_VERSION, systems: [], products: finalProducts };
    await uploadDB(db);
    await saveBase(finalProducts);
    await clearQueue();
    return { state: 'done', pushed: finalProducts.length };
  } catch (e) {
    if (e instanceof Error && e.message === 'NEED_RELOGIN') {
      return { state: 'need-relogin' };
    }
    throw e;
  }
}

export { loadBase, saveBase };
