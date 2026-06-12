/**
 * XỬ LÝ ẢNH + LƯU TRỮ IndexedDB — Owin Quote Tool.
 *
 * HẰNG SỐ NGHIỆP VỤ:
 *  - BR-5: ảnh BẮT BUỘC xử lý EXIF orientation (thợ chụp bằng tablet/điện thoại).
 *          browser-image-compression tự lo: nó vẽ ảnh ra canvas, BAKE orientation vào
 *          pixel (preserveExif mặc định = false), nên ảnh dọc không bị xoay ngang.
 *          Nén ~800px, mục tiêu ~100KB.
 *  - BR-9: ảnh TÁCH khỏi file sync. Ở LOCAL ảnh lưu IndexedDB (qua localforage),
 *          record sản phẩm chỉ giữ imageId. Khi sync, ảnh là file riêng trên Drive.
 *
 * Verify lib (rule 6) — browser-image-compression@2.0.2:
 *   default export: imageCompression(file: File, options): Promise<File>
 *   options dùng: maxSizeMB, maxWidthOrHeight, initialQuality, useWebWorker.
 *
 * ⚠️ Module này cần BROWSER APIs (canvas/Image/Web Worker + IndexedDB).
 *    KHÔNG chạy trong node/jsdom thuần — test nén/EXIF/quota phải ở môi trường trình duyệt.
 */

import imageCompression from 'browser-image-compression';
import localforage from 'localforage';

/** Cấu hình nén — căn theo BR-5. maxSizeMB bắt đầu 0.1, có thể chỉnh ở test. */
export const COMPRESS_OPTIONS = {
  maxSizeMB: 0.1,
  maxWidthOrHeight: 800,
  initialQuality: 0.7,
  useWebWorker: true,
} as const;

/** Kho ảnh riêng trong IndexedDB (tách khỏi metadata). */
const imageStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'images',
  driver: localforage.INDEXEDDB,
  description: 'Ảnh sản phẩm đã nén (BR-9: tách khỏi file sync)',
});

/** Lỗi nghiệp vụ ảnh — phân biệt với lỗi hệ thống để UI hiển thị thân thiện. */
export type ImageErrorCode = 'NOT_IMAGE' | 'COMPRESS_FAILED' | 'STORE_FAILED';

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(message: string, code: ImageErrorCode) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
  }
}

/** Kiểm tra file có phải ảnh không (chặn sớm, tránh ném lib lỗi khó hiểu). */
export function isImageFile(file: File): boolean {
  return typeof file.type === 'string' && file.type.startsWith('image/');
}

/**
 * Nén 1 ảnh: xử lý EXIF orientation (BR-5), trả Blob đã nén.
 * - File không phải ảnh → ném ImageError('NOT_IMAGE') sạch, KHÔNG treo.
 * - Lib lỗi (ảnh hỏng) → ném ImageError('COMPRESS_FAILED'), KHÔNG để Promise treo.
 */
export async function compressImage(
  file: File,
  options: Partial<typeof COMPRESS_OPTIONS> = {},
): Promise<Blob> {
  if (!isImageFile(file)) {
    throw new ImageError(
      `File "${file.name}" không phải ảnh (type=${file.type || 'unknown'})`,
      'NOT_IMAGE',
    );
  }
  try {
    const compressed = await imageCompression(file, {
      ...COMPRESS_OPTIONS,
      ...options,
    });
    return compressed;
  } catch (err) {
    // Bọc mọi lỗi (ảnh hỏng, decode fail...) để caller không bị Promise treo.
    throw new ImageError(
      `Nén ảnh thất bại: ${err instanceof Error ? err.message : String(err)}`,
      'COMPRESS_FAILED',
    );
  }
}

/** Lưu blob ảnh vào IndexedDB theo id. */
export async function saveImage(id: string, blob: Blob): Promise<void> {
  try {
    await imageStore.setItem(id, blob);
  } catch (err) {
    throw new ImageError(
      `Lưu ảnh "${id}" thất bại: ${err instanceof Error ? err.message : String(err)}`,
      'STORE_FAILED',
    );
  }
}

/**
 * Nén rồi lưu trong một bước. Trả id ảnh (để gắn vào record sản phẩm — BR-9).
 * @param id id ảnh muốn dùng (mặc định sinh ngẫu nhiên).
 */
export async function compressAndStore(
  file: File,
  id: string = crypto.randomUUID(),
  options: Partial<typeof COMPRESS_OPTIONS> = {},
): Promise<{ id: string; blob: Blob }> {
  const blob = await compressImage(file, options);
  await saveImage(id, blob);
  return { id, blob };
}

/** Đọc blob ảnh từ IndexedDB. null nếu không có. */
export async function getImage(id: string): Promise<Blob | null> {
  return imageStore.getItem<Blob>(id);
}

/** Tạo object URL để hiển thị <img>. Nhớ revoke sau khi dùng. */
export async function getImageUrl(id: string): Promise<string | null> {
  const blob = await getImage(id);
  return blob ? URL.createObjectURL(blob) : null;
}

/** Đọc ảnh thành dataURL base64 (cho preview Format 2 + nhúng Word). */
export async function getImageDataUrl(id: string): Promise<string | null> {
  const blob = await getImage(id);
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Xoá ảnh khỏi IndexedDB. */
export async function deleteImage(id: string): Promise<void> {
  await imageStore.removeItem(id);
}

/** Liệt kê mọi id ảnh đang lưu. */
export async function listImageIds(): Promise<string[]> {
  return imageStore.keys();
}

/** Số ảnh đang lưu (dùng cho test quota). */
export async function countImages(): Promise<number> {
  return imageStore.length();
}

export { imageStore };
