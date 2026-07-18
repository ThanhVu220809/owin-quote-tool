/**
 * JPEG images for PDF export.
 * - catalogue: higher res so 95% cell fill stays sharp
 * - quote/other: lighter thumbs
 */

import { getImageDataUrlByPath, thumbUrlFor } from '@/utils/imagePaths';

export type LightPdfImageOptions = {
  /** Prefer storage thumb (smaller). Default true for quote; false for catalogue. */
  preferThumb?: boolean;
  /** Max edge in px after downscale. Default 160; use ~900 for catalogue. */
  maxEdge?: number;
  /** JPEG quality 0–1. */
  quality?: number;
};

/** Load + optionally downscale for PDF. Aspect ratio preserved for contain-fit later. */
export async function lightPdfImageDataUrl(
  source: string | null | undefined,
  options: LightPdfImageOptions = {},
): Promise<string | null> {
  if (!source) return null;
  const preferThumb = options.preferThumb !== false;
  const maxEdge = options.maxEdge ?? 160;
  const quality = options.quality ?? 0.72;
  const preferred = preferThumb ? thumbUrlFor(source) || source : source;
  const dataUrl = await getImageDataUrlByPath(preferred, { fallbackLogo: false });
  if (!dataUrl) {
    // Thumb missing → try master once.
    if (preferThumb && preferred !== source) {
      return lightPdfImageDataUrl(source, { ...options, preferThumb: false });
    }
    return null;
  }

  if (typeof Image === 'undefined' || typeof document === 'undefined') return dataUrl;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const nw = image.naturalWidth || 1;
        const nh = image.naturalHeight || 1;
        const scale = Math.min(1, maxEdge / Math.max(nw, nh));
        const w = Math.max(1, Math.round(nw * scale));
        const h = Math.max(1, Math.round(nh * scale));
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
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}
