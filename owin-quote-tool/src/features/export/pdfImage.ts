/**
 * Ảnh cho bản PDF.
 *
 * Dùng chung đường tải của `exportImage` (thumb trước, hạ kích thước, nhớ lại),
 * chỉ khác ở chỗ jsPDF cần data URL kèm kích thước thật để contain-fit:
 * - bảng giá: ô lớn, giữ 640px cho nét khi in
 * - báo giá: ô nhỏ, 160px là đủ
 */

import { blobToDataUrl, loadExportImage, type ExportImageOptions } from '@/features/export/exportImage';

export type PdfImage = { dataUrl: string; width: number; height: number };

export type LightPdfImageOptions = ExportImageOptions;

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ width: 1, height: 1 });
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = dataUrl;
  });
}

/** Ảnh sẵn sàng vẽ vào PDF: data URL + kích thước thật (đã hạ). */
export async function loadPdfImage(
  source: string | null | undefined,
  options: LightPdfImageOptions = {},
): Promise<PdfImage | null> {
  const image = await loadExportImage(source, { maxEdge: 160, ...options });
  if (!image) return null;
  const dataUrl = await blobToDataUrl(image.blob);
  if (image.width && image.height) return { dataUrl, width: image.width, height: image.height };
  const natural = await measure(dataUrl);
  return { dataUrl, ...natural };
}

/** Chỉ cần data URL (không dùng tới kích thước). */
export async function lightPdfImageDataUrl(
  source: string | null | undefined,
  options: LightPdfImageOptions = {},
): Promise<string | null> {
  return (await loadPdfImage(source, options))?.dataUrl ?? null;
}
