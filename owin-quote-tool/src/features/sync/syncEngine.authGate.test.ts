import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _clearAll, saveProduct } from '@/features/products/productStore';
import { _clearQuotes } from '@/features/quote/quoteStore';
import { listImageIds, saveImage } from '@/utils/imageStorage';

const mocks = vi.hoisted(() => ({
  downloadDB: vi.fn(),
  getDBMetadata: vi.fn(),
  uploadDB: vi.fn(),
  syncReferencedImages: vi.fn(),
}));

// OAuth chưa thành công / cấu hình Client ID không hợp lệ → coi như chưa cấu hình.
vi.mock('./publicConfig', () => ({ isSyncConfigured: () => false }));

vi.mock('./driveSync', () => ({
  downloadDB: mocks.downloadDB,
  getDBMetadata: mocks.getDBMetadata,
  uploadDB: mocks.uploadDB,
}));

vi.mock('./imageSync', () => ({ syncReferencedImages: mocks.syncReferencedImages }));

import { syncNow, forcePushToDrive } from './syncEngine';

describe('cổng chặn khi OAuth chưa sẵn sàng', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([_clearAll(), _clearQuotes()]);
    await saveProduct({ id: 'P1', ma: 'P1', ten: 'Cửa P1', dvt: 'm²', donGiaGoc: 1_000_000 });
    await saveImage('P1', new Blob(['x'], { type: 'image/png' }));
  });

  it('syncNow bỏ qua êm, không gọi backend/Drive/ảnh', async () => {
    const result = await syncNow();
    expect(result).toEqual({ state: 'skipped', reason: 'not-configured' });
    expect(mocks.downloadDB).not.toHaveBeenCalled();
    expect(mocks.uploadDB).not.toHaveBeenCalled();
    expect(mocks.syncReferencedImages).not.toHaveBeenCalled();
  });

  it('không xoá product_images local khi OAuth chưa sẵn sàng', async () => {
    await syncNow();
    expect(await listImageIds()).toContain('P1');
  });

  it('forcePush đã xác nhận vẫn bị chặn khi chưa cấu hình', async () => {
    const result = await forcePushToDrive({ confirmed: true });
    expect(result).toEqual({ state: 'skipped', reason: 'not-configured' });
    expect(mocks.uploadDB).not.toHaveBeenCalled();
    expect(await listImageIds()).toContain('P1');
  });
});
