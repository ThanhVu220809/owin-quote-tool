import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductRecord } from '@/types/models';

const mocks = vi.hoisted(() => ({
  getImage: vi.fn(),
  getQuoteImage: vi.fn(),
  saveImage: vi.fn(),
  saveQuoteImage: vi.fn(),
  uploadImage: vi.fn(),
  downloadImage: vi.fn(),
  findFileMetadata: vi.fn(),
}));

vi.mock('@/utils/imageStorage', () => ({
  getImage: mocks.getImage,
  getQuoteImage: mocks.getQuoteImage,
  saveImage: mocks.saveImage,
  saveQuoteImage: mocks.saveQuoteImage,
}));

vi.mock('./driveSync', () => ({
  uploadImage: mocks.uploadImage,
  downloadImage: mocks.downloadImage,
  findFileMetadata: mocks.findFileMetadata,
}));

import { syncReferencedImages, uploadReferencedImages } from './imageSync';

function productWithImage(id: string): ProductRecord {
  return {
    id,
    coverImagePath: `products/${id}/cover.webp`,
    gallery: [],
  } as unknown as ProductRecord;
}

describe('uploadReferencedImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFileMetadata.mockResolvedValue(null);
  });
  it('xử lý ảnh song song có giới hạn và vẫn tổng hợp lỗi', async () => {
    let active = 0;
    let maxActive = 0;
    mocks.getImage.mockResolvedValue(new Blob(['image']));
    mocks.uploadImage.mockImplementation(async (key: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (key.includes('/5/')) throw new Error('upload failed');
    });

    const result = await uploadReferencedImages(
      Array.from({ length: 8 }, (_, index) => productWithImage(String(index + 1))),
      [],
      'token',
    );

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(result).toEqual({ count: 7, errors: 1 });
  });

  it('remote có metadata mới hơn thì tải xuống, không upload đè ảnh local', async () => {
    mocks.getImage.mockResolvedValue(new Blob(['local']));
    mocks.findFileMetadata.mockResolvedValue({ id: 'remote-1', name: 'img_products/1/cover.webp', modifiedTime: 'remote-new' });
    mocks.downloadImage.mockResolvedValue(new Blob(['remote']));
    const result = await syncReferencedImages([productWithImage('1')]);
    expect(result).toEqual({ count: 1, errors: 0 });
    expect(mocks.downloadImage).toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });
});
