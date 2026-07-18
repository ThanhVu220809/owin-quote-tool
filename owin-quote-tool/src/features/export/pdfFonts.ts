/**
 * Shared Vietnamese PDF fonts (subset Noto Sans under public/fonts/).
 * Loaded once on first PDF export — not bundled into the main JS chunk.
 */

import type { jsPDF } from 'jspdf';
import { withBasePath } from '@/utils/imagePaths';

export const PDF_FONT_FAMILY = 'NotoSansVI';

type PdfFontCache = { regular: string; bold: string };
let fontCache: PdfFontCache | null = null;
let fontsReady: Promise<PdfFontCache> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Attach Vietnamese font files to a jsPDF instance. */
export async function ensureVietnamesePdfFonts(doc: jsPDF): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const [regular, bold] = await Promise.all([
        fetch(withBasePath('fonts/NotoSans-VI.ttf')).then((response) => {
          if (!response.ok) throw new Error('Không tải được font PDF.');
          return response.arrayBuffer();
        }),
        fetch(withBasePath('fonts/NotoSans-VI-Bold.ttf')).then((response) => {
          if (!response.ok) throw new Error('Không tải được font PDF đậm.');
          return response.arrayBuffer();
        }),
      ]);
      fontCache = {
        regular: arrayBufferToBase64(regular),
        bold: arrayBufferToBase64(bold),
      };
      return fontCache;
    })().catch((error) => {
      fontsReady = null;
      fontCache = null;
      throw error;
    });
  }
  const cache = await fontsReady;
  doc.addFileToVFS('NotoSans-VI.ttf', cache.regular);
  doc.addFileToVFS('NotoSans-VI-Bold.ttf', cache.bold);
  doc.addFont('NotoSans-VI.ttf', PDF_FONT_FAMILY, 'normal');
  doc.addFont('NotoSans-VI-Bold.ttf', PDF_FONT_FAMILY, 'bold');
}
