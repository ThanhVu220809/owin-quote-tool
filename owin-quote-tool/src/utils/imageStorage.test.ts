/**
 * Test tầng LƯU TRỮ IndexedDB của imageStorage (chạy được trong node nhờ fake-indexeddb).
 *
 * ⚠️ GIỚI HẠN: phần NÉN ảnh (EXIF orientation + tỉ lệ nén) cần canvas/Web Worker của
 * trình duyệt THẬT, KHÔNG kiểm được ở node. Các test đó là 👤 HUMAN / browser-verify
 * (xem harness in-app + LOG). Ở đây chỉ test: round-trip lưu/đọc, chịu tải >5MB
 * (thoát bẫy localStorage), và CHẶN file không phải ảnh (nhánh không cần canvas).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveImage,
  getImage,
  deleteImage,
  countImages,
  listImageIds,
  isImageFile,
  compressImage,
  ImageError,
  imageStore,
} from '@/utils/imageStorage';

beforeEach(async () => {
  await imageStore.clear();
});

/** Tạo blob giả ~sizeKB để mô phỏng ảnh đã nén. */
function fakeBlob(sizeKB: number): Blob {
  return new Blob([new Uint8Array(sizeKB * 1024)], { type: 'image/jpeg' });
}

describe('TEST 2.2 — IndexedDB chịu tải, không tràn quota localStorage', () => {
  it('lưu 25 ảnh ~100KB, đọc lại ảnh #1 và #20 đúng', async () => {
    for (let i = 1; i <= 25; i++) {
      await saveImage(`img-${i}`, fakeBlob(100));
    }
    expect(await countImages()).toBe(25);

    const first = await getImage('img-1');
    const twentieth = await getImage('img-20');
    expect(first).not.toBeNull();
    expect(twentieth).not.toBeNull();
    expect(first!.size).toBe(100 * 1024);
    expect(twentieth!.size).toBe(100 * 1024);
  });

  it('tổng dữ liệu vượt 5MB (bẫy localStorage) vẫn lưu/đọc được', async () => {
    // 60 × 100KB ≈ 6MB > giới hạn localStorage 5MB → chứng minh đang dùng IndexedDB.
    for (let i = 0; i < 60; i++) {
      await saveImage(`big-${i}`, fakeBlob(100));
    }
    expect(await countImages()).toBe(60);
    const back = await getImage('big-59');
    expect(back!.size).toBe(100 * 1024);
  });

  it('xoá ảnh hoạt động đúng', async () => {
    await saveImage('x', fakeBlob(10));
    expect((await listImageIds()).includes('x')).toBe(true);
    await deleteImage('x');
    expect(await getImage('x')).toBeNull();
  });
});

describe('TEST 2.1 (phần testable) — chặn file không phải ảnh, không treo', () => {
  it('isImageFile phân biệt đúng', () => {
    expect(isImageFile(new File([''], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new File([''], 'a.txt', { type: 'text/plain' }))).toBe(false);
    expect(isImageFile(new File([''], 'noext', { type: '' }))).toBe(false);
  });

  it('compressImage với file không phải ảnh → ném ImageError(NOT_IMAGE) sạch, KHÔNG treo', async () => {
    const notImage = new File(['hello'], 'doc.txt', { type: 'text/plain' });
    await expect(compressImage(notImage)).rejects.toBeInstanceOf(ImageError);
    await expect(compressImage(notImage)).rejects.toMatchObject({ code: 'NOT_IMAGE' });
  });
});
