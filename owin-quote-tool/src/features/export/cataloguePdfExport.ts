/**
 * Light catalogue PDF — file download (no print).
 * Layout matches Word: STT / Hình / Tổng vMerge across product+accessories;
 * logo+title+column header once at the top; category row only when loại cửa changes.
 */

import { jsPDF } from 'jspdf';
import type { ProductRecord } from '@/types/models';
import { buildCatalogueBlockRows, type CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';
import { ensureVietnamesePdfFonts, PDF_FONT_FAMILY } from '@/features/export/pdfFonts';
import { lightPdfImageDataUrl } from '@/features/export/pdfImage';
import { cellImageMaxBox, containFitSize } from '@/lib/media/containFit';
import { downloadBlob } from '@/utils/download';
import { formatSoVND } from '@/utils/format';

const TITLE = 'BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN';
const MARGIN = 8;
/** Same 95% cell fill as Word / web catalogue images. */
const IMG_CELL_FILL = 0.95;
const IMG_CELL_PAD_MM = 1.2;
const FONT = PDF_FONT_FAMILY;

/** Column fractions (sum = 1). KL wide enough for max 3 decimals on one line. */
const COL_FRACS = [0.035, 0.105, 0.30, 0.045, 0.055, 0.055, 0.10, 0.10, 0.10, 0.105] as const;
const HEADERS = ['STT', 'Hình', 'Mô tả', 'DV', 'Rộng', 'Cao', 'KL', 'Đơn giá', 'Thành tiền', 'Tổng'] as const;

type ProductBlock = {
  kind: 'product';
  product: CatalogueBlockRow;
  lines: CatalogueBlockRow[]; // product + accessories + extras
};

type CategoryBlock = {
  kind: 'category';
  row: CatalogueBlockRow;
};

type PdfBlock = ProductBlock | CategoryBlock;

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

function drawCellBorder(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(40, 56, 70);
  doc.setLineWidth(0.15);
  doc.rect(x, y, w, h);
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(x, y, w, h, 'F');
}

/** Same block model as Word / web: category alone; product + its accessories together. */
function groupCatalogueBlocks(rows: CatalogueBlockRow[]): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  let current: ProductBlock | null = null;

  for (const row of rows) {
    if (row.rowType === 'category') {
      if (current) {
        blocks.push(current);
        current = null;
      }
      blocks.push({ kind: 'category', row });
      continue;
    }
    if (row.rowType === 'product') {
      if (current) blocks.push(current);
      current = { kind: 'product', product: row, lines: [row] };
      continue;
    }
    // accessory / extraAccessory
    if (!current) {
      current = { kind: 'product', product: row, lines: [row] };
    } else {
      current.lines.push(row);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function lineCells(row: CatalogueBlockRow): string[] {
  return [
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
}

export async function exportBangGiaPdf(products: ProductRecord[]): Promise<string> {
  const rows = buildCatalogueBlockRows(products);
  const blocks = groupCatalogueBlocks(rows);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await ensureVietnamesePdfFonts(doc);
  doc.setFont(FONT, 'normal');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usable = pageW - MARGIN * 2;
  const widths = colWidths(usable);
  const xs = colXs(widths, MARGIN);
  const descWidth = widths[2]!;

  type CachedImage = { dataUrl: string; naturalW: number; naturalH: number };
  const imageCache = new Map<string, CachedImage | null>();

  const loadNaturalSize = (dataUrl: string): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve({ w: 1, h: 1 });
        return;
      }
      const image = new Image();
      image.onload = () => resolve({ w: image.naturalWidth || 1, h: image.naturalHeight || 1 });
      image.onerror = () => resolve({ w: 1, h: 1 });
      image.src = dataUrl;
    });

  for (const block of blocks) {
    if (block.kind !== 'product') continue;
    const path = block.product.imagePath;
    if (!path || imageCache.has(path)) continue;
    const dataUrl = await lightPdfImageDataUrl(path);
    if (!dataUrl) {
      imageCache.set(path, null);
      continue;
    }
    const natural = await loadNaturalSize(dataUrl);
    imageCache.set(path, { dataUrl, naturalW: natural.w, naturalH: natural.h });
  }

  let y = MARGIN;
  let headerDrawn = false;

  /** Word-style: logo + title + column headers only once at the document start. */
  const drawDocumentHeaderOnce = () => {
    if (headerDrawn) return;
    headerDrawn = true;

    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(14, 47, 68);
    doc.text('HOÀNG ANH OWIN', pageW / 2, y + 4.5, { align: 'center' });
    y += 7;

    fillRect(doc, MARGIN, y, usable, 8, [75, 96, 120]);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(TITLE, pageW / 2, y + 5.3, { align: 'center' });
    y += 9;

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
    let vx = MARGIN;
    for (let i = 0; i < widths.length - 1; i += 1) {
      vx += widths[i]!;
      doc.line(vx, y, vx, y + headH);
    }
    y += headH;
    doc.setTextColor(20, 20, 20);
  };

  const ensureSpace = (need: number) => {
    if (y + need <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN;
    // No repeated logo/title/header on later pages (matches Word bang-gia).
  };

  drawDocumentHeaderOnce();

  if (blocks.length === 0) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.text('Chưa có sản phẩm.', MARGIN, y + 8);
  }

  for (const block of blocks) {
    if (block.kind === 'category') {
      // Category heading only when loại cửa changes (from buildCatalogueBlockRows).
      const h = 7;
      ensureSpace(h);
      fillRect(doc, MARGIN, y, usable, h, [217, 226, 243]);
      drawCellBorder(doc, MARGIN, y, usable, h);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(14, 47, 68);
      doc.text(block.row.categoryName || block.row.description, MARGIN + 2, y + h / 2 + 1.2);
      y += h;
      continue;
    }

    const lineHeights = block.lines.map((line) => rowHeightMm(doc, line, descWidth));
    const blockH = lineHeights.reduce((sum, h) => sum + h, 0);
    ensureSpace(blockH);

    const blockTop = y;
    let rowY = y;

    // Draw each content line (mô tả + DV…thành tiền). STT/Hình/Tổng drawn as one tall cell after.
    block.lines.forEach((line, lineIndex) => {
      const h = lineHeights[lineIndex]!;
      const isProduct = line.rowType === 'product';
      const bg: [number, number, number] = isProduct ? [255, 255, 255] : [250, 251, 252];

      // Mid columns only (index 2..8) — skip STT(0), Hình(1), Tổng(9) for per-row boxes.
      for (let col = 2; col <= 8; col += 1) {
        fillRect(doc, xs[col]!, rowY, widths[col]!, h, bg);
        drawCellBorder(doc, xs[col]!, rowY, widths[col]!, h);
      }

      const cells = lineCells(line);
      doc.setFont(FONT, isProduct ? 'bold' : 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(20, 20, 20);

      // Description
      const descLines = doc.splitTextToSize(cells[2] || ' ', Math.max(8, descWidth - 2)) as string[];
      let ty = rowY + 3.2;
      for (const text of descLines) {
        if (ty > rowY + h - 1.5) break;
        doc.text(text, xs[2]! + 1, ty);
        ty += 3.2;
      }

      doc.setFont(FONT, 'normal');
      doc.setFontSize(7.5);
      for (const col of [3, 4, 5, 6]) {
        const text = cells[col] || '';
        if (!text) continue;
        doc.text(text, xs[col]! + widths[col]! / 2, rowY + h / 2 + 1, { align: 'center' });
      }
      for (const col of [7, 8]) {
        const text = cells[col] || '';
        if (!text) continue;
        doc.text(text, xs[col]! + widths[col]! - 1.2, rowY + h / 2 + 1, { align: 'right' });
      }

      rowY += h;
    });

    // ── Word vMerge: STT + Hình + Tổng span the whole product block ──
    fillRect(doc, xs[0]!, blockTop, widths[0]!, blockH, [255, 255, 255]);
    drawCellBorder(doc, xs[0]!, blockTop, widths[0]!, blockH);
    fillRect(doc, xs[1]!, blockTop, widths[1]!, blockH, [250, 251, 252]);
    drawCellBorder(doc, xs[1]!, blockTop, widths[1]!, blockH);
    fillRect(doc, xs[9]!, blockTop, widths[9]!, blockH, [255, 255, 255]);
    drawCellBorder(doc, xs[9]!, blockTop, widths[9]!, blockH);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    if (block.product.stt) {
      doc.text(block.product.stt, xs[0]! + widths[0]! / 2, blockTop + blockH / 2 + 1, { align: 'center' });
    }

    const img = block.product.imagePath ? imageCache.get(block.product.imagePath) : null;
    if (img) {
      try {
        // Contain-fit into 95% of merged image cell (stop at first axis limit).
        const { maxWidth, maxHeight } = cellImageMaxBox(
          widths[1]!,
          blockH,
          IMG_CELL_FILL,
          IMG_CELL_PAD_MM,
        );
        const fitted = containFitSize(img.naturalW, img.naturalH, maxWidth, maxHeight);
        const format = img.dataUrl.startsWith('data:image/jpeg') || img.dataUrl.startsWith('data:image/jpg')
          ? 'JPEG'
          : 'PNG';
        const ix = xs[1]! + (widths[1]! - fitted.width) / 2;
        const iy = blockTop + (blockH - fitted.height) / 2;
        doc.addImage(img.dataUrl, format, ix, iy, fitted.width, fitted.height, undefined, 'FAST');
      } catch {
        // skip
      }
    }

    const totalText = money(block.product.completedTotalVnd);
    if (totalText) {
      doc.setFont(FONT, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(180, 100, 20);
      doc.text(totalText, xs[9]! + widths[9]! - 1.2, blockTop + blockH / 2 + 1, { align: 'right' });
      doc.setTextColor(20, 20, 20);
    }

    y = blockTop + blockH;
  }

  const fileName = `Bang_gia_OWIN_${new Date().toISOString().slice(0, 10)}.pdf`;
  const buffer = doc.output('arraybuffer');
  downloadBlob(new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), fileName);
  return fileName;
}
