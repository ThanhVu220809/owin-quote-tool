/**
 * Quote PDF export — file download (no browser print dialog), same spirit as Word/Excel.
 */

import { jsPDF } from 'jspdf';
import type { CalculatedQuote, CalculatedQuoteItem, ProductRecord, ProductUnit } from '@/types/models';
import { resolveItemImage } from '@/lib/media/itemImageResolver';
import { downloadBlob } from '@/utils/download';
import { formatSoVND } from '@/utils/format';
import { ensureVietnamesePdfFonts, PDF_FONT_FAMILY } from '@/features/export/pdfFonts';
import { lightPdfImageDataUrl } from '@/features/export/pdfImage';

const MARGIN = 8;
const IMG_W = 18;
const IMG_H = 12;
const FONT = PDF_FONT_FAMILY;

/** STT | Mã | Hình | Mô tả | DV | Rộng | Cao | SL | KL | ĐG | TT */
const COL_FRACS = [0.035, 0.07, 0.09, 0.28, 0.045, 0.055, 0.055, 0.045, 0.07, 0.12, 0.135] as const;
const HEADERS = ['STT', 'Mã', 'Hình', 'Mô tả', 'DV', 'Rộng', 'Cao', 'SL', 'KL', 'Đơn giá', 'Thành tiền'] as const;

type PdfRow = {
  stt: string;
  code: string;
  description: string;
  unit: string;
  width: string;
  height: string;
  quantity: string;
  weight: string;
  unitPrice: string;
  amount: string;
  imagePath?: string | null;
  imageKey?: string;
  bold?: boolean;
};

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (value === 0) return '0';
  return formatSoVND(value);
}

function unitLabel(unit: ProductUnit | string | null | undefined): string {
  if (unit === 'BO' || unit === 'Bộ') return 'Bộ';
  if (unit === 'METER' || unit === 'md') return 'md';
  return 'm²';
}

function normalizeUnit(value: unknown): ProductUnit {
  const unit = String(value || '').trim().toUpperCase();
  if (unit === 'BO' || unit === 'BỘ') return 'BO';
  if (unit === 'METER' || unit === 'MD') return 'METER';
  return 'M2';
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) === 0) return '';
  const n = Number(value);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

function parseJsonMaybe<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function quoteDescription(item: CalculatedQuoteItem, lineDescription?: string | null): string {
  return [
    item.itemName,
    item.description,
    lineDescription,
    ...(item.specs || [])
      .filter((spec) => String(spec.key || '').trim())
      .map((spec) => {
        const key = String(spec.key || '').trim();
        const text = String(spec.value || '').trim();
        return text ? `- ${key}: ${text}` : `- ${key}`;
      }),
  ].filter(Boolean).join('\n');
}

function buildPdfRows(quote: CalculatedQuote): PdfRow[] {
  const rows: PdfRow[] = [];

  quote.items.forEach((item, itemIndex) => {
    const stt = String(itemIndex + 1);
    const code = item.quoteItemCode || item.productCode || `HM-${String(itemIndex + 1).padStart(2, '0')}`;
    const imageKey = String(
      item.image || item.coverImagePath || item.imageReference || item.quoteItemCode || item.productCode || code,
    );

    const dimensions = item.dimensions.filter((line) => {
      const qty = Number(line.quantity || 0);
      const w = Number(line.widthM || 0);
      const h = Number(line.heightM || 0);
      return qty > 0 || w > 0 || h > 0 || Number(line.lineTotalVnd || 0) > 0;
    });
    const lines = dimensions.length > 0 ? dimensions : item.dimensions.slice(0, 1);

    lines.forEach((line, lineIndex) => {
      rows.push({
        stt: lineIndex === 0 ? stt : '',
        code: lineIndex === 0 ? code : '',
        description: lineIndex === 0 ? quoteDescription(item, line.description) : String(line.description || ''),
        unit: unitLabel(line.unit),
        width: line.unit === 'BO' ? '' : fmtNum(line.widthM),
        height: line.unit === 'BO' ? '' : fmtNum(line.heightM),
        quantity: fmtNum(line.quantity),
        weight: fmtNum(line.calculatedQty),
        unitPrice: money(line.unitPriceVnd),
        amount: money(line.lineTotalVnd),
        imagePath: lineIndex === 0 ? (item.image || item.coverImagePath || null) : null,
        imageKey: lineIndex === 0 ? String(imageKey) : undefined,
        bold: lineIndex === 0,
      });
    });

    const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
    if (fixed) {
      const quantity = Number(fixed.packageQuantity ?? fixed.quantity ?? 1) || 1;
      const unitPrice = Number(fixed.unitPrice ?? fixed.unitPriceVnd ?? 0) || 0;
      const items = Array.isArray(fixed.items) ? fixed.items : [];
      const itemLines = items
        .map((entry) => entry as Record<string, unknown>)
        .map((entry) => {
          const name = String(entry.name || '').trim();
          if (!name) return '';
          const q = Number(entry.quantity ?? 0);
          return q > 1 ? `- ${name} x${fmtNum(q)}` : `- ${name}`;
        })
        .filter(Boolean);
      const hasContent =
        String(fixed.name || '').trim()
        || itemLines.length > 0
        || unitPrice > 0;
      if (hasContent) {
        rows.push({
          stt: '',
          code: '',
          description: [`${String(fixed.name || 'Bộ phụ kiện đi kèm').trim()}:`, ...itemLines].join('\n'),
          unit: 'Bộ',
          width: '',
          height: '',
          quantity: fmtNum(quantity),
          weight: '',
          unitPrice: money(unitPrice),
          amount: money(quantity * unitPrice),
        });
      }
    } else {
      item.accessories
        .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
        .forEach((accessory) => {
          const quantity = accessory.totalSet || accessory.quantityPerSet || 1;
          rows.push({
            stt: '',
            code: '',
            description: compactNote(accessory.name, accessory.note),
            unit: 'Bộ',
            width: '',
            height: '',
            quantity: fmtNum(quantity),
            weight: '',
            unitPrice: money(accessory.unitPriceVnd),
            amount: money(accessory.lineTotalVnd),
          });
        });
    }

    const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
    if (Array.isArray(extras)) {
      extras
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => String(entry.name || '').trim())
        .forEach((entry) => {
          const unit = normalizeUnit(entry.unit);
          const quantity = Number(entry.quantity ?? entry.quantityPerSet ?? 0) || 0;
          const weight = unit === 'BO' ? 0 : Number(entry.weight ?? entry.kl ?? 0) || 0;
          const unitPrice = Number(entry.unitPrice ?? entry.unitPriceVnd ?? 0) || 0;
          const basis = unit === 'BO' ? quantity : weight > 0 ? weight : quantity;
          rows.push({
            stt: '',
            code: '',
            description: String(entry.name || 'Phụ kiện phát sinh').trim(),
            unit: unitLabel(unit),
            width: '',
            height: '',
            quantity: fmtNum(quantity || (unit === 'BO' ? 0 : 1)),
            weight: unit === 'BO' ? '' : fmtNum(weight > 0 ? weight : quantity),
            unitPrice: money(unitPrice),
            amount: money(basis * unitPrice),
          });
        });
    }
  });

  return rows;
}

function compactNote(name: string, note?: string | null): string {
  const notes = String(note || '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`);
  return [`${name}:`, ...notes].join('\n');
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

function drawBorder(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(40, 56, 70);
  doc.setLineWidth(0.15);
  doc.rect(x, y, w, h);
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(x, y, w, h, 'F');
}

function rowHeight(doc: jsPDF, text: string, descWidth: number): number {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.2);
  const lines = doc.splitTextToSize(String(text || ' ').trim() || ' ', Math.max(8, descWidth - 2)) as string[];
  return Math.max(IMG_H + 2.5, lines.length * 3.1 + 2.5);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').trim() || 'OWIN-BG';
}

/**
 * Export quote as a PDF file download (no window.print).
 * Returns the downloaded file name.
 */
export async function exportQuotePdf(
  quote: CalculatedQuote,
  quoteCode: string,
  products: ProductRecord[] = [],
): Promise<string> {
  const rows = buildPdfRows(quote);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await ensureVietnamesePdfFonts(doc);
  doc.setFont(FONT, 'normal');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usable = pageW - MARGIN * 2;
  const widths = colWidths(usable);
  const xs = colXs(widths, MARGIN);
  const descWidth = widths[3]!;

  // Resolve product images once (thumb → light JPEG). Key matches PdfRow.imageKey.
  const imageCache = new Map<string, string | null>();
  for (const [itemIndex, item] of quote.items.entries()) {
    const key = String(
      item.image || item.coverImagePath || item.imageReference || item.quoteItemCode || item.productCode || itemIndex,
    );
    if (imageCache.has(key)) continue;
    const resolved = await resolveItemImage(item, products, { loadBlob: false });
    const path = resolved.path || item.image || item.coverImagePath || item.imageReference || null;
    imageCache.set(key, await lightPdfImageDataUrl(path));
  }

  let y = MARGIN;

  const ensureSpace = (need: number) => {
    if (y + need <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN;
    drawTableHeader();
  };

  const drawCustomerHeader = () => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(14, 47, 68);
    doc.text('HOÀNG ANH OWIN', pageW / 2, y + 4.5, { align: 'center' });
    y += 7;

    fillRect(doc, MARGIN, y, usable, 8, [14, 47, 68]);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`BÁO GIÁ ${quoteCode}`, pageW / 2, y + 5.3, { align: 'center' });
    y += 10;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    const left = [
      `Khách hàng: ${quote.customerName || '—'}`,
      `SĐT: ${quote.customerPhone || '—'}`,
      quote.customerEmail ? `Email: ${quote.customerEmail}` : '',
    ].filter(Boolean);
    const right = [
      `Địa chỉ: ${quote.customerAddress || '—'}`,
      quote.quoteDate ? `Ngày: ${quote.quoteDate}` : '',
    ].filter(Boolean);
    left.forEach((line, index) => doc.text(line, MARGIN, y + index * 4));
    right.forEach((line, index) => doc.text(line, pageW / 2 + 4, y + index * 4));
    y += Math.max(left.length, right.length) * 4 + 3;
  };

  const drawTableHeader = () => {
    const headH = 7;
    fillRect(doc, MARGIN, y, usable, headH, [14, 47, 68]);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    HEADERS.forEach((label, index) => {
      doc.text(label, xs[index]! + widths[index]! / 2, y + 4.5, { align: 'center' });
    });
    drawBorder(doc, MARGIN, y, usable, headH);
    let vx = MARGIN;
    for (let i = 0; i < widths.length - 1; i += 1) {
      vx += widths[i]!;
      doc.line(vx, y, vx, y + headH);
    }
    y += headH;
    doc.setTextColor(20, 20, 20);
  };

  drawCustomerHeader();
  drawTableHeader();

  if (rows.length === 0) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.text('Chưa có hạng mục.', MARGIN, y + 8);
  }

  for (const row of rows) {
    const h = rowHeight(doc, row.description, descWidth);
    ensureSpace(h);

    fillRect(doc, MARGIN, y, usable, h, row.bold ? [255, 255, 255] : [250, 251, 252]);
    drawBorder(doc, MARGIN, y, usable, h);
    let vx = MARGIN;
    for (let i = 0; i < widths.length - 1; i += 1) {
      vx += widths[i]!;
      doc.line(vx, y, vx, y + h);
    }

    doc.setFont(FONT, row.bold ? 'bold' : 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(20, 20, 20);

    if (row.stt) doc.text(row.stt, xs[0]! + widths[0]! / 2, y + h / 2 + 1, { align: 'center' });
    if (row.code) doc.text(row.code, xs[1]! + 0.8, y + h / 2 + 1);

    if (row.imageKey) {
      const img = imageCache.get(row.imageKey);
      if (img) {
        try {
          const format = img.startsWith('data:image/jpeg') || img.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
          const ix = xs[2]! + (widths[2]! - IMG_W) / 2;
          const iy = y + (h - IMG_H) / 2;
          doc.addImage(img, format, ix, iy, IMG_W, IMG_H, undefined, 'FAST');
        } catch {
          // skip
        }
      }
    }

    const descLines = doc.splitTextToSize(row.description || ' ', Math.max(8, descWidth - 2)) as string[];
    let ty = y + 3;
    for (const line of descLines) {
      if (ty > y + h - 1.2) break;
      doc.text(line, xs[3]! + 0.8, ty);
      ty += 3.1;
    }

    const center = [4, 5, 6, 7, 8];
    const values = [row.unit, row.width, row.height, row.quantity, row.weight, row.unitPrice, row.amount];
    doc.setFont(FONT, 'normal');
    for (let i = 0; i < 5; i += 1) {
      const text = values[i] || '';
      if (!text) continue;
      const col = center[i]!;
      doc.text(text, xs[col]! + widths[col]! / 2, y + h / 2 + 1, { align: 'center' });
    }
    for (const [offset, col] of [[5, 9], [6, 10]] as const) {
      const text = values[offset] || '';
      if (!text) continue;
      doc.text(text, xs[col]! + widths[col]! - 1, y + h / 2 + 1, { align: 'right' });
    }

    y += h;
  }

  // Totals
  ensureSpace(28);
  y += 4;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(14, 47, 68);
  const summary = quote.summary;
  const lines = [
    `Tổng tiền: ${money(summary.totalVnd)}đ`,
    `Làm tròn: ${money(summary.roundedTotalVnd)}đ`,
    `Tạm ứng: ${money(summary.depositVnd)}đ`,
    `Còn lại: ${money(summary.balanceVnd)}đ`,
  ];
  lines.forEach((line, index) => {
    doc.text(line, pageW - MARGIN, y + index * 5, { align: 'right' });
  });

  const fileName = `Bao_gia_${sanitizeFileName(quoteCode)}.pdf`;
  const buffer = doc.output('arraybuffer');
  downloadBlob(new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), fileName);
  return fileName;
}
