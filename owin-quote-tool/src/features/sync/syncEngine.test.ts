import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _clearAll, saveProduct } from '@/features/products/productStore';
import { _clearQuotes } from '@/features/quote/quoteStore';
import { suggestionStore } from '@/lib/suggestions';
import { aluminumEstimatorStore } from '@/features/aluminum/aluminumEstimatorStorage';

const mocks = vi.hoisted(() => ({
  downloadDB: vi.fn(),
  uploadDB: vi.fn(),
  syncReferencedImages: vi.fn(),
}));

vi.mock('./googleAuth', () => ({
  isConfigured: () => true,
}));

vi.mock('./driveSync', () => ({
  downloadDB: mocks.downloadDB,
  uploadDB: mocks.uploadDB,
}));

vi.mock('./imageSync', () => ({
  syncReferencedImages: mocks.syncReferencedImages,
}));

import { syncNow } from './syncEngine';

describe('syncNow image staging', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([
      _clearAll(),
      _clearQuotes(),
      suggestionStore.clear(),
      aluminumEstimatorStore.clear(),
    ]);
    mocks.downloadDB.mockResolvedValue(null);
    mocks.uploadDB.mockResolvedValue(undefined);
    mocks.syncReferencedImages.mockResolvedValue({ count: 1, errors: 0 });
    await saveProduct({ id: 'P1', ma: 'P1', ten: 'Cửa P1', dvt: 'm²', donGiaGoc: 1_000_000 });
  });

  it('auto-save metadata không quét ảnh, đồng bộ đầy đủ vẫn sao lưu ảnh', async () => {
    await syncNow(undefined, { includeImages: false });
    expect(mocks.syncReferencedImages).not.toHaveBeenCalled();
    expect(mocks.uploadDB).toHaveBeenCalledTimes(1);

    await syncNow();
    expect(mocks.syncReferencedImages).toHaveBeenCalledTimes(1);
    expect(mocks.uploadDB).toHaveBeenCalledTimes(2);
  });
});
