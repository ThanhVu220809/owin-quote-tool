import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/types/models';
import { _clearAll, getAllProductsRaw, saveProduct } from '@/features/products/productStore';
import { getImage, imageStore, saveImage } from '@/utils/imageStorage';
import { beginPullFromOtherAccount, beginPushToOtherAccount } from './transferEngine';

const drive = vi.hoisted(() => ({
  downloadDB: vi.fn(),
  downloadImage: vi.fn(),
  uploadDB: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock('./driveSync', () => drive);

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'P1',
    updatedAt: '2026-06-12T16:00:00.000Z',
    dvt: 'm²',
    ten: 'Cửa mẫu',
    ma: 'P1',
    donGiaGoc: 1000000,
    accessories: [],
    ...over,
  };
}

beforeEach(async () => {
  await _clearAll();
  await imageStore.clear();
  vi.clearAllMocks();
  drive.downloadDB.mockResolvedValue(null);
  drive.downloadImage.mockResolvedValue(null);
  drive.uploadDB.mockResolvedValue(undefined);
  drive.uploadImage.mockResolvedValue(undefined);
});

describe('transferEngine - chuyển dữ liệu tài khoản Google khác', () => {
  it('đẩy kho sang tài khoản khác: upload DB và ảnh local đang được chọn', async () => {
    const saved = await saveProduct({
      dvt: 'm²',
      ten: 'Cửa local',
      ma: 'L1',
      donGiaGoc: 1500000,
      accessories: [],
      imageId: 'img-local',
    });
    await saveImage('img-local', new Blob(['local-image'], { type: 'image/png' }));

    const status = await beginPushToOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'push-other', products: 1, images: 1 });
    expect(drive.uploadDB).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 2,
        products: [expect.objectContaining({ id: saved.id, coverImagePath: 'legacy-images/img-local' })],
        quotes: [],
      }),
      'other-token',
    );
    expect(drive.uploadImage).toHaveBeenCalledWith('img-local', expect.any(Blob), 'other-token');
  });

  it('đẩy sang tài khoản khác: cùng mã nhưng khác nội dung → CONFLICT, không nuốt thầm', async () => {
    // local có S1 giá 2.0M
    await saveProduct({ id: 'S1', dvt: 'm²', ten: 'Cửa S1', ma: 'S1', donGiaGoc: 2000000, accessories: [] });
    // tài khoản kia có S1 giá 1.5M (khác nội dung)
    drive.downloadDB.mockResolvedValue({
      schemaVersion: 1,
      systems: [],
      products: [product({ id: 'S1', ma: 'S1', ten: 'Cửa S1', donGiaGoc: 1500000 })],
    });

    const status = await beginPushToOtherAccount('other-token');

    expect(status.state).toBe('conflict');
    if (status.state === 'conflict') {
      expect(status.conflicts.map((c) => c.id)).toContain('S1');
    }
    // KHÔNG tự đẩy khi còn conflict
    expect(drive.uploadDB).not.toHaveBeenCalled();
  });

  it('lấy kho từ tài khoản khác: ghi local và tải ảnh remote được chọn', async () => {
    drive.downloadDB.mockResolvedValue({
      schemaVersion: 1,
      systems: [],
      products: [product({ id: 'R1', ma: 'R1', ten: 'Cửa remote', imageId: 'img-remote' })],
    });
    drive.downloadImage.mockResolvedValue(new Blob(['remote-image'], { type: 'image/png' }));

    const status = await beginPullFromOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'pull-other', products: 1, images: 1 });
    expect((await getAllProductsRaw()).find((p) => p.id === 'R1')?.name).toBe('Cửa remote');
    expect(await getImage('img-remote')).toBeInstanceOf(Blob);
    expect(drive.downloadImage).toHaveBeenCalledWith('img-remote', 'other-token');
  });
});
