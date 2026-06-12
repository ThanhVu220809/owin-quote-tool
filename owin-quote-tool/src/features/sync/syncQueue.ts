/**
 * HÀNG ĐỢI SYNC OFFLINE (TASK 5.4).
 * Khi offline, thay đổi (sản phẩm đổi/xoá, ảnh mới) được xếp hàng vào IndexedDB.
 * Khi online lại: ensureToken → tải remote → merge → (dialog nếu conflict) → đẩy lên,
 * rồi clear queue. Debounce để không spam Drive.
 *
 * App vốn LOCAL-FIRST: nhập kích thước/tính tiền/xuất Word KHÔNG cần mạng (IndexedDB).
 * Drive chỉ là lớp đồng bộ thêm. Queue đảm bảo thay đổi không mất khi offline.
 */

import localforage from 'localforage';

export interface SyncChange {
  /** loại thay đổi để lúc flush biết phải đẩy gì. */
  kind: 'product-upsert' | 'product-delete' | 'image-upsert';
  entityId: string;
  /** thời điểm xếp hàng. */
  queuedAt: string;
}

const queueStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'sync-queue',
  driver: localforage.INDEXEDDB,
  description: 'Hàng đợi thay đổi chờ đẩy lên Drive (offline)',
});

/** Xếp 1 thay đổi vào hàng đợi (gộp theo entityId+kind để không phình). */
export async function enqueue(change: Omit<SyncChange, 'queuedAt'>): Promise<void> {
  const key = `${change.kind}:${change.entityId}`;
  await queueStore.setItem(key, { ...change, queuedAt: new Date().toISOString() });
}

/** Toàn bộ thay đổi đang chờ. */
export async function getQueue(): Promise<SyncChange[]> {
  const out: SyncChange[] = [];
  await queueStore.iterate<SyncChange, void>((v) => {
    if (v) out.push(v);
  });
  return out.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function queueLength(): Promise<number> {
  return queueStore.length();
}

/** Xoá toàn bộ hàng đợi (sau khi flush thành công). */
export async function clearQueue(): Promise<void> {
  await queueStore.clear();
}

/** Xoá 1 mục cụ thể khỏi hàng đợi. */
export async function dequeue(kind: SyncChange['kind'], entityId: string): Promise<void> {
  await queueStore.removeItem(`${kind}:${entityId}`);
}

export { queueStore };
