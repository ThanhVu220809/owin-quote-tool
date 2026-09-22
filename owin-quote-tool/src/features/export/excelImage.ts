export type ExcelImageExtension = 'png' | 'jpeg' | 'gif';

/** ExcelJS does not embed WebP. Convert it to PNG in browsers while preserving JPEG/GIF bytes. */
export async function toExcelImage(blob: Blob): Promise<{ buffer: ArrayBuffer; extension: ExcelImageExtension }> {
  const type = blob.type.toLowerCase();
  if (!type.includes('webp')) {
    return { buffer: await blob.arrayBuffer(), extension: type.includes('jpeg') || type.includes('jpg') ? 'jpeg' : type.includes('gif') ? 'gif' : 'png' };
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('Trình duyệt không hỗ trợ chuyển WebP để nhúng Excel.');
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không chuyển được WebP sang PNG.')), 'image/png'));
  return { buffer: await png.arrayBuffer(), extension: 'png' };
}
