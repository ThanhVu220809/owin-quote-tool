/**
 * TEST 5.4 (phần logic offline queue) — node + fake-indexeddb.
 * Phần "tắt/bật mạng thật + đẩy lên Drive + máy A↔B" cần Google → ⏸ HUMAN.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, getQueue, queueLength, clearQueue, dequeue, queueStore } from '@/features/sync/syncQueue';

beforeEach(async () => {
  await queueStore.clear();
});

describe('TEST 5.4 — hàng đợi sync offline', () => {
  it('xếp hàng thay đổi, đọc lại đúng thứ tự thời gian', async () => {
    await enqueue({ kind: 'product-upsert', entityId: 'S1' });
    await enqueue({ kind: 'product-delete', entityId: 'S2' });
    const q = await getQueue();
    expect(q.length).toBe(2);
    expect(q[0].entityId).toBe('S1');
  });

  it('gộp theo entityId+kind (không phình khi sửa cùng 1 sp nhiều lần)', async () => {
    await enqueue({ kind: 'product-upsert', entityId: 'S1' });
    await enqueue({ kind: 'product-upsert', entityId: 'S1' });
    expect(await queueLength()).toBe(1);
  });

  it('dequeue 1 mục + clear toàn bộ', async () => {
    await enqueue({ kind: 'product-upsert', entityId: 'S1' });
    await enqueue({ kind: 'image-upsert', entityId: 'img9' });
    await dequeue('product-upsert', 'S1');
    expect(await queueLength()).toBe(1);
    await clearQueue();
    expect(await queueLength()).toBe(0);
  });
});
