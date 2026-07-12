import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _clearAll, saveProduct } from '@/features/products/productStore';
import { _clearQuotes } from '@/features/quote/quoteStore';
import { suggestionStore } from '@/lib/suggestions';
import { aluminumEstimatorStore } from '@/features/aluminum/aluminumEstimatorStorage';

const mocks = vi.hoisted(() => ({
  downloadDB: vi.fn(),
  getDBMetadata: vi.fn(),
  uploadDB: vi.fn(),
  syncReferencedImages: vi.fn(),
}));

vi.mock('./googleAuth', () => ({
  isConfigured: () => true,
}));

vi.mock('./driveSync', () => ({
  downloadDB: mocks.downloadDB,
  getDBMetadata: mocks.getDBMetadata,
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
    mocks.getDBMetadata.mockResolvedValue({ id: 'db-1', name: 'owin_db.json', modifiedTime: '2026-07-12T00:00:00.000Z', version: '1' });
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

  it('metadata không đổi thì polling không tải toàn bộ DB', async () => {
    const { checkRemoteChanges, saveRemoteSignature } = await import('./syncEngine');
    await saveRemoteSignature('db-1:2026-07-12T00:00:00.000Z:1');
    const result = await checkRemoteChanges();
    expect(result).toEqual({ state: 'unchanged' });
    expect(mocks.downloadDB).not.toHaveBeenCalled();
  });

  it('metadata đổi thì tải remote rồi merge và upload kết quả', async () => {
    const { checkRemoteChanges, syncNow, saveRemoteSignature } = await import('./syncEngine');
    await saveRemoteSignature('old:old:1');
    expect(await checkRemoteChanges()).toMatchObject({ state: 'changed' });
    mocks.downloadDB.mockResolvedValue({ schemaVersion: 2, systems: [], products: [], quotes: [], suggestions: [], aluminumCalculations: [] });
    const result = await syncNow(undefined, { includeImages: false });
    expect(result.state).toBe('done');
    expect(mocks.downloadDB).toHaveBeenCalledTimes(1);
    expect(mocks.uploadDB).toHaveBeenCalledTimes(1);
  });

  it('ghi nhận bootstrap và lần đồng bộ thành công cho diagnostics', async () => {
    const { getSyncDiagnostics } = await import('./syncEngine');
    expect((await getSyncDiagnostics()).bootstrapState).toMatch(/unknown|ready/);
    await syncNow(undefined, { includeImages: false });
    const diagnostics = await getSyncDiagnostics();
    expect(diagnostics.bootstrapState).toBe('ready');
    expect(diagnostics.lastSuccessAt).toEqual(expect.any(String));
  });
});
