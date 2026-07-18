/**
 * Light catalogue PDF export — same row model as Word/Excel, file download (no print).
 * Compact landscape table + small product thumbnails to keep the file lean.
 */

import { jsPDF } from 'jspdf';
import type { ProductRecord } from '@/types/models';
import { buildCatalogueBlockRows, type CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';
import { ensureVietnamesePdfFonts, PDF_FONT_FAMILY } from '@/features/export/pdfFonts';
import { lightPdfImageDataUrl } from '@/features/export/pdfImage';
import { downloadBlob } from '@/utils/download';
import { formatSoVND } from '@/utils/format';

const TITLE = 'BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN';
const MARGIN = 8;
const IMG_W = 22;
const IMG_H = 14;
const FONT = PDF_FONT_FAMILY;

/** Column fractions (sum = 1). KL wide enough for max 3 decimals on one line. */
const COL_FRACS = [0.035, 0.105, 0.30, 0.045, 0.055, 0.055, 0.10, 0.10, 0.10, 0.105] as const;
const HEADERS = ['STT', 'Hình', 'Mô tả', 'DV', 'Rộng', 'Cao', 'KL', 'Đơn giá', 'Thành tiền', 'Tổng'] as const;

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '';
  return formatSoVND(value);
}

function colWidths(usable: number): number[] {
  return COL_FRACS.map((frac) => usable * frac);
}

function colXs(widths: number[], left: number): number[] {
  const xs: number[] = [];
  let x = left;
  for (const w of widths) {
    xs.push(x);
    x += w;
  }
  return xs;
}

function estimateDescLines(doc: jsPDF, text: string, width: number, fontSize: number): number {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(String(text || '').trim() || ' ', Math.max(8, width - 2));
  return Math.max(1, lines.length);
}

function rowHeightMm(doc: jsPDF, row: CatalogueBlockRow, descWidth: number): number {
  if (row.rowType === 'category') return 7;
  const lines = estimateDescLines(doc, row.description, descWidth, 7.5);
  const textH = lines * 3.2 + 2.5;
  if (row.rowType === 'product') return Math.max(IMG_H + 3, textH);
  return Math.max(5.5, textH);
}

function drawCellBorder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.setDrawColor(40, 56, 70);
  doc.setLineWidth(0.15);
  doc.rect(x, y, w, h);
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(x, y, w, h, 'F');
}

export async function exportBangGiaPdf(products: ProductRecord[]): Promise<string> {
  const rows = buildCatalogueBlockRows(products);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await ensureVietnamesePdfFonts(doc);
  doc.setFont(FONT, 'normal');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usable = pageW - MARGIN * 2;
  const widths = colWidths(usable);
  const xs = colXs(widths, MARGIN);
  const descWidth = widths[2]!;

  // Preload small images for product rows only (shared cache by path).
  const imageCache = new Map<string, string | null>();
  for (const row of rows) {
    if (row.rowType !== 'product' || !row.imagePath || imageCache.has(row.imagePath)) continue;
    imageCache.set(row.imagePath, await lightPdfImageDataUrl(row.imagePath));
  }

  let y = MARGIN;

  const ensureSpace = (need: number) => {
    if (y + need <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN;
    drawHeaderBand();
  };

  const drawHeaderBand = () => {
    // Company
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(14, 47, 68);
    doc.text('HOÀNG ANH OWIN', pageW / 2, y + 4.5, { align: 'center' });
    y += 7;

    // Title bar
    fillRect(doc, MARGIN, y, usable, 8, [75, 96, 120]);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(TITLE, pageW / 2, y + 5.3, { align: 'center' });
    y += 9;

    // Column headers
    const headH = 7;
    fillRect(doc, MARGIN, y, usable, headH, [14, 47, 68]);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    HEADERS.forEach((label, index) => {
      const cx = xs[index]! + widths[index]! / 2;
      doc.text(label, cx, y + 4.5, { align: 'center' });
    });
    drawCellBorder(doc, MARGIN, y, usable, headH);
    // vertical grid for header
    let vx = MARGIN;
    for (let i = 0; i < widths.length - 1; i += 1) {
      vx += widths[i]!;
      doc.line(vx, y, vx, y + headH);
    }
    y += headH;
    doc.setTextColor(20, 20, 20);
  };

  drawHeaderBand();

  if (rows.length === 0) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.text('Chưa có sản phẩm.', MARGIN, y + 8);
  }

  for (const row of rows) {
    const h = rowHeightMm(doc, row, descWidth);
    ensureSpace(h);

    if (row.rowType === 'category') {
      fillRect(doc, MARGIN, y, usable, h, [217, 226, 243]);
      drawCellBorder(doc, MARGIN, y, usable, h);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(14, 47, 68);
      doc.text(row.categoryName || row.description, MARGIN + 2, y + h / 2 + 1.2);
      y += h;
      continue;
    }

    // Background for product vs accessory
    if (row.rowType === 'product') {
      fillRect(doc, MARGIN, y, usable, h, [255, 255, 255]);
    } else {
      fillRect(doc, MARGIN, y, usable, h, [250, 251, 252]);
    }

    // Outer + vertical grid
    drawCellBorder(doc, MARGIN, y, usable, h);
    let vx = MARGIN;
    for (let i = 0; i < widths.length - 1; i += 1) {
      vx += widths[i]!;
      doc.line(vx, y, vx, y + h);
    }

    const cells: string[] = [
      row.stt,
      '',
      row.description,
      row.unit,
      row.width || (row.rowType !== 'product' ? '—' : ''),
      row.height || (row.rowType !== 'product' ? '—' : ''),
      row.weight,
      money(row.unitPriceVnd),
      money(row.amountVnd),
      money(row.completedTotalVnd),
    ];

    doc.setFont(FONT, row.rowType === 'product' ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(20, 20, 20);

    // STT
    if (cells[0]) {
      doc.text(cells[0], xs[0]! + widths[0]! / 2, y + h / 2 + 1, { align: 'center' });
    }

    // Image (product only)
    if (row.rowType === 'product' && row.imagePath) {
      const img = imageCache.get(row.imagePath);
      if (img) {
        try {
          const format = img.startsWith('data:image/jpeg') || img.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
          const ix = xs[1]! + (widths[1]! - IMG_W) / 2;
          const iy = y + (h - IMG_H) / 2;
          doc.addImage(img, format, ix, iy, IMG_W, IMG_H, undefined, 'FAST');
        } catch {
          // skip broken image
        }
      }
    }

    // Description (wrapped)
    doc.setFont(FONT, row.rowType === 'product' ? 'bold' : 'normal');
    doc.setFontSize(7.2);
    const descLines = doc.splitTextToSize(cells[2] || ' ', Math.max(8, descWidth - 2)) as string[];
    let ty = y + 3.2;
    for (const line of descLines) {
      if (ty > y + h - 1.5) break;
      doc.text(line, xs[2]! + 1, ty);
      ty += 3.2;
    }

    // Remaining columns
    const centerCols = [3, 4, 5, 6];
    const rightCols = [7, 8, 9];
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    for (const index of centerCols) {
      const text = cells[index] || '';
      if (!text) continue;
      doc.text(text, xs[index]! + widths[index]! / 2, y + h / 2 + 1, { align: 'center' });
    }
    for (const index of rightCols) {
      const text = cells[index] || '';
      if (!text) continue;
      doc.text(text, xs[index]! + widths[index]! - 1.2, y + h / 2 + 1, { align: 'right' });
    }

    y += h;
  }

  const fileName = `Bang_gia_OWIN_${new Date().toISOString().slice(0, 10)}.pdf`;
  const buffer = doc.output('arraybuffer');
  downloadBlob(new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), fileName);
  return fileName;
}
