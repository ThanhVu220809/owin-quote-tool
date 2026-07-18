/**
 * Small JPEG thumbs for light PDF exports (catalogue + quote).
 */

import { getImageDataUrlByPath, thumbUrlFor } from '@/utils/imagePaths';

/** Downscale image for a light PDF (JPEG ~0.72). */
export async function lightPdfImageDataUrl(source: string | null | undefined): Promise<string | null> {
  if (!source) return null;
  const preferred = thumbUrlFor(source) || source;
  const dataUrl = await getImageDataUrlByPath(preferred, { fallbackLogo: false });
  if (!dataUrl) return null;

  if (typeof Image === 'undefined' || typeof document === 'undefined') return dataUrl;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxEdge = 160;
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const w = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const h = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}
