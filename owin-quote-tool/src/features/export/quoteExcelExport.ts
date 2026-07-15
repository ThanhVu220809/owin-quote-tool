import ExcelJS from 'exceljs';
import type { CalculatedQuote, CalculatedQuoteItem, ProductRecord, ProductUnit } from '@/types/models';
import { resolveItemImage } from '@/lib/media/itemImageResolver';
import { toExcelImage } from '@/utils/excelImage';
import { downloadBlob } from '@/utils/download';

type QuoteExcelRowKind = 'dimension' | 'accessory';

interface QuoteExcelRow {
  stt: string;
  productCode: string;
  imageLabel: string;
  description: string;
  unit: string;
  width: number | '';
  height: number | '';
  quantity: number | '';
  volume: number | '';
  unitPriceVnd: number | '';
  lineTotalVnd: number | '';
  rowType: QuoteExcelRowKind;
  sttRowSpan?: number;
  descriptionRowSpan?: number;
}

const HEADER_COLUMNS = [
  'STT',
  'Mã SP',
  'Hình ảnh minh họa',
  'Mô tả chi tiết',
  'DV',
  'Rộng',
  'Cao',
  'SL',
  'KL',
  'Đơn giá',
  'Thành tiền',
];

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

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | '' {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : '';
}

function moneyNumber(value: unknown): number | '' {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : '';
}

function compactText(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .join('\n');
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

function accessoryItemText(entry: Record<string, unknown>): string {
  const name = String(entry.name || '').trim();
  if (!name) return '';
  const quantity = safeNumber(entry.quantity, 1);
  return quantity > 1 ? `${name} x${quantity}` : name;
}

function quoteDescription(item: CalculatedQuoteItem, lineDescription?: string | null): string {
  return compactText([
    item.itemName,
    item.description,
    lineDescription,
    ...(item.specs || []).map((spec) => (spec.value ? `- ${spec.key}: ${spec.value}` : '')),
  ]);
}

function buildFixedAccessoryRows(item: CalculatedQuoteItem): QuoteExcelRow[] {
  const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
  if (fixed) {
    const quantity = safeNumber(fixed.packageQuantity ?? fixed.quantity, 1);
    const unitPrice = safeNumber(fixed.unitPrice ?? fixed.unitPriceVnd, 0);
    const items = Array.isArray(fixed.items) ? fixed.items : [];
    return [{
      stt: '',
      productCode: '',
      imageLabel: '',
      description: compactText([
        `${String(fixed.name || 'Bộ phụ kiện đi kèm').trim()}:`,
        ...items
          .map((entry) => accessoryItemText(entry as Record<string, unknown>))
          .filter(Boolean)
          .map((line) => `- ${line}`),
      ]),
      unit: 'Bộ',
      width: '',
      height: '',
      quantity,
      volume: '',
      unitPriceVnd: moneyNumber(unitPrice),
      lineTotalVnd: moneyNumber(quantity * unitPrice),
      rowType: 'accessory',
    }];
  }

  return item.accessories
    .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
    .map((accessory) => ({
      stt: '',
      productCode: '',
      imageLabel: '',
      description: compactText([accessory.name, accessory.note]),
      unit: 'Bộ',
      width: '',
      height: '',
      quantity: optionalNumber(accessory.quantityPerSet),
      volume: optionalNumber(accessory.totalSet),
      unitPriceVnd: moneyNumber(accessory.unitPriceVnd),
      lineTotalVnd: moneyNumber(accessory.lineTotalVnd),
      rowType: 'accessory' as const,
    }));
}

function buildExtraAccessoryRows(item: CalculatedQuoteItem): QuoteExcelRow[] {
  const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
  if (!Array.isArray(extras)) return [];

  return extras
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => String(entry.name || '').trim())
    .map((entry) => {
      const unit = normalizeUnit(entry.unit);
      const quantity = safeNumber(entry.quantity ?? entry.quantityPerSet, 1);
      const weight = safeNumber(entry.weight ?? entry.kl, 0);
      const unitPrice = safeNumber(entry.unitPrice ?? entry.unitPriceVnd, 0);
      // SL = số cái; md/m² nhân KL (fallback SL nếu KL trống) — khớp quote-engine.
      const basis = unit === 'BO' ? quantity : weight > 0 ? weight : quantity;
      return {
        stt: '',
        productCode: '',
        imageLabel: '',
        description: String(entry.name || 'Phụ kiện phát sinh').trim(),
        unit: unitLabel(unit),
        width: '',
        height: '',
        quantity: unit === 'BO' ? optionalNumber(quantity) : optionalNumber(quantity || 1),
        volume: unit === 'BO' ? '' : optionalNumber(weight > 0 ? weight : quantity),
        unitPriceVnd: moneyNumber(unitPrice),
        lineTotalVnd: moneyNumber(basis * unitPrice),
        rowType: 'accessory' as const,
      };
    });
}

function buildQuoteExcelRows(quote: CalculatedQuote): QuoteExcelRow[] {
  const rows: QuoteExcelRow[] = [];

  quote.items.forEach((item, itemIndex) => {
    const productRows: QuoteExcelRow[] = (item.dimensions.length > 0 ? item.dimensions : [{
      unit: item.unit,
      widthM: null,
      heightM: null,
      quantity: 1,
      calculatedQty: item.unit === 'BO' ? 1 : 0,
      unitPriceVnd: item.unitPriceVnd,
      lineTotalVnd: item.productSubtotalVnd,
      description: null,
    }]).map((line, lineIndex) => ({
      stt: lineIndex === 0 ? String(itemIndex + 1) : '',
      productCode: lineIndex === 0 ? item.quoteItemCode || item.productCode : '',
      imageLabel: lineIndex === 0 && (item.image || item.coverImagePath || item.imageReference || item.sourceProductId) ? 'Có ảnh' : '',
      description: lineIndex === 0 ? quoteDescription(item, line.description) : String(line.description || ''),
      unit: unitLabel(line.unit),
      width: line.unit === 'BO' ? '' : optionalNumber(line.widthM),
      height: line.unit === 'BO' ? '' : optionalNumber(line.heightM),
      quantity: optionalNumber(line.quantity),
      volume: optionalNumber(line.calculatedQty),
      unitPriceVnd: moneyNumber(line.unitPriceVnd),
      lineTotalVnd: moneyNumber(line.lineTotalVnd),
      rowType: 'dimension' as const,
      descriptionRowSpan: lineIndex === 0 && item.dimensions.length > 1 ? item.dimensions.length : undefined,
    }));

    const accessoryRows = [...buildFixedAccessoryRows(item), ...buildExtraAccessoryRows(item)];
    const itemRowSpan = Math.max(1, productRows.length + accessoryRows.length);
    productRows[0].sttRowSpan = itemRowSpan > 1 ? itemRowSpan : undefined;
    rows.push(...productRows, ...accessoryRows);
  });

  return rows;
}

function styleBorder(): Partial<ExcelJS.Borders> {
  const line = { style: 'thin' as const, color: { argb: 'FFE5E5EA' } };
  return { top: line, left: line, bottom: line, right: line };
}

function estimateHeight(text: string): number {
  const lines = String(text || '').split(/\r?\n/);
  const visualLines = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 48)), 0);
  return Math.max(24, visualLines * 15 + 10);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').trim() || 'OWIN-BG';
}


export async function exportQuoteExcel(quote: CalculatedQuote, quoteCode: string, products: ProductRecord[] = []): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OWIN Quote Tool';
  const sheet = workbook.addWorksheet('Báo Giá OWIN', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: true }],
  });

  sheet.columns = [
    { width: 6 },
    { width: 11 },
    { width: 18 },
    { width: 46 },
    { width: 7 },
    { width: 8 },
    { width: 8 },
    { width: 7 },
    { width: 8 },
    { width: 15 },
    { width: 16 },
  ];

  const company = (quote as CalculatedQuote & { company?: { name?: string; phone?: string; email?: string; address?: string } }).company || {};
  const companyName = company.name || 'HOÀNG ANH OWIN';
  const companyPhone = company.phone || '0799040616';
  const companyAddress = company.address || 'Tiên Điền - Nghi Xuân - Hà Tĩnh';
  const companyEmail = String(company.email || '').trim();
  const quoteDate = quote.quoteDate ? new Date(quote.quoteDate) : new Date();
  const safeDate = Number.isNaN(quoteDate.getTime()) ? new Date() : quoteDate;

  const companyRow = sheet.addRow([companyName]);
  sheet.mergeCells(companyRow.number, 1, companyRow.number, 11);
  companyRow.getCell(1).font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF0F2A3D' } };

  const addressRow = sheet.addRow([`Địa chỉ: ${companyAddress}`]);
  sheet.mergeCells(addressRow.number, 1, addressRow.number, 11);
  addressRow.getCell(1).font = { name: 'Times New Roman', italic: true, size: 10 };

  const contactRow = sheet.addRow([`Điện thoại: ${companyPhone}${companyEmail ? ` | Email: ${companyEmail}` : ''}`]);
  sheet.mergeCells(contactRow.number, 1, contactRow.number, 11);
  contactRow.getCell(1).font = { name: 'Times New Roman', italic: true, size: 10 };

  sheet.addRow([]);

  const titleRow = sheet.addRow(['', '', 'BẢNG BÁO GIÁ CỬA NHÔM KÍNH OWIN CAO CẤP']);
  sheet.mergeCells(titleRow.number, 3, titleRow.number, 11);
  titleRow.getCell(3).font = { name: 'Times New Roman', bold: true, size: 16, color: { argb: 'FF0F2A3D' } };
  titleRow.getCell(3).alignment = { horizontal: 'center' };
  sheet.addRow([]);

  const customerRow = sheet.addRow([`Khách hàng: ${quote.customerName || ''}`, '', '', '', '', `Mã báo giá: ${quoteCode}`]);
  sheet.mergeCells(customerRow.number, 1, customerRow.number, 5);
  sheet.mergeCells(customerRow.number, 6, customerRow.number, 8);

  const phoneRow = sheet.addRow([`Điện thoại: ${quote.customerPhone || ''}`, '', '', '', '', `Ngày lập: ${safeDate.toLocaleDateString('vi-VN')}`]);
  sheet.mergeCells(phoneRow.number, 1, phoneRow.number, 5);
  sheet.mergeCells(phoneRow.number, 6, phoneRow.number, 8);

  const addressInfoRow = sheet.addRow([`Địa chỉ công trình: ${quote.customerAddress || ''}`]);
  sheet.mergeCells(addressInfoRow.number, 1, addressInfoRow.number, 8);
  [customerRow, phoneRow, addressInfoRow].forEach((row) => {
    row.font = { name: 'Times New Roman', bold: true, size: 10 };
  });
  sheet.addRow([]);

  const headerRow = sheet.addRow(HEADER_COLUMNS);
  headerRow.height = 28;
  headerRow.eachCell((cell, colIndex) => {
    cell.font = { name: 'Times New Roman', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A3D' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colIndex === 4 ? 'left' : colIndex >= 10 ? 'right' : 'center',
      wrapText: true,
    };
    cell.border = styleBorder();
  });

  const tableStartRow = headerRow.number + 1;
  const mergeRanges: Array<{ startRow: number; endRow: number; column: number; vertical: 'middle' | 'top' }> = [];
  const tableRows = buildQuoteExcelRows(quote);

  for (const row of tableRows) {
    const excelRow = sheet.addRow([
      row.stt,
      row.productCode,
      row.imageLabel,
      row.description,
      row.unit,
      row.width,
      row.height,
      row.quantity,
      row.volume,
      row.unitPriceVnd,
      row.lineTotalVnd,
    ]);
    excelRow.height = Math.max(row.imageLabel ? 64 : 24, estimateHeight(row.description) / (row.descriptionRowSpan || 1));
    const item = row.rowType === 'dimension'
      ? quote.items.find((candidate) => candidate.quoteItemCode === row.productCode || candidate.productCode === row.productCode)
      : undefined;
    if (item && row.imageLabel) {
      const resolved = await resolveItemImage(item, products, { loadBlob: true });
      if (resolved.blob) {
        const image = await toExcelImage(resolved.blob);
        const imageId = workbook.addImage(image);
        sheet.addImage(imageId, { tl: { col: 2.1, row: excelRow.number - 1 + 0.1 }, ext: { width: 92, height: 58 } });
      }
      if (resolved.revoke && resolved.url) URL.revokeObjectURL(resolved.url);
    }

    for (let colIndex = 1; colIndex <= 11; colIndex += 1) {
      const cell = excelRow.getCell(colIndex);
      cell.font = {
        name: 'Times New Roman',
        size: 10,
        italic: row.rowType === 'accessory' && colIndex === 4,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colIndex === 4 ? 'left' : colIndex >= 10 ? 'right' : 'center',
        wrapText: true,
      };
      cell.border = styleBorder();
    }
    [6, 7, 9].forEach((col) => {
      if (excelRow.getCell(col).value !== '') excelRow.getCell(col).numFmt = '0.000';
    });
    [8, 10, 11].forEach((col) => {
      if (excelRow.getCell(col).value !== '') excelRow.getCell(col).numFmt = '#,##0';
    });

    if (row.sttRowSpan && row.sttRowSpan > 1) {
      const endRow = excelRow.number + row.sttRowSpan - 1;
      [1, 2, 3].forEach((column) => mergeRanges.push({ startRow: excelRow.number, endRow, column, vertical: 'middle' }));
    }
    if (row.descriptionRowSpan && row.descriptionRowSpan > 1) {
      mergeRanges.push({ startRow: excelRow.number, endRow: excelRow.number + row.descriptionRowSpan - 1, column: 4, vertical: 'top' });
    }
  }

  mergeRanges.forEach(({ startRow, endRow, column, vertical }) => {
    if (endRow < tableStartRow || endRow <= startRow) return;
    sheet.mergeCells(startRow, column, endRow, column);
    const mergedCell = sheet.getCell(startRow, column);
    mergedCell.alignment = {
      vertical,
      horizontal: column === 4 ? 'left' : 'center',
      wrapText: true,
    };
    mergedCell.border = styleBorder();
  });

  sheet.addRow([]);

  const addTotalRow = (label: string, value: number, highlight = false) => {
    const row = sheet.addRow(['', '', label, '', '', '', '', '', '', '', Math.round(value || 0)]);
    sheet.mergeCells(row.number, 3, row.number, 10);
    row.getCell(3).font = { name: 'Times New Roman', bold: true, size: highlight ? 11 : 10, color: highlight ? { argb: 'FFC8A45D' } : undefined };
    row.getCell(11).font = { name: 'Times New Roman', bold: true, size: highlight ? 12 : 10 };
    row.getCell(11).numFmt = '#,##0';
    for (let colIndex = 3; colIndex <= 11; colIndex += 1) {
      const cell = row.getCell(colIndex);
      cell.border = highlight
        ? { top: { style: 'thin' }, bottom: { style: 'double' } }
        : styleBorder();
      if (highlight) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF7EE' } };
      }
      cell.alignment = { horizontal: colIndex === 11 ? 'right' : 'left' };
    }
  };

  addTotalRow('TỔNG TIỀN', quote.summary.totalVnd);
  addTotalRow('LÀM TRÒN', quote.summary.roundedTotalVnd);
  addTotalRow('TẠM ỨNG', quote.summary.depositVnd);
  addTotalRow('CẦN THANH TOÁN', quote.summary.balanceVnd, true);

  sheet.addRow([]);
  sheet.addRow([]);
  const signatureRow = sheet.addRow(['', 'ĐẠI DIỆN KHÁCH HÀNG', '', '', '', '', '', 'ĐẠI DIỆN DOANH NGHIỆP']);
  sheet.mergeCells(signatureRow.number, 2, signatureRow.number, 5);
  sheet.mergeCells(signatureRow.number, 8, signatureRow.number, 11);
  signatureRow.getCell(2).font = { name: 'Times New Roman', bold: true };
  signatureRow.getCell(8).font = { name: 'Times New Roman', bold: true };
  signatureRow.getCell(2).alignment = { horizontal: 'center' };
  signatureRow.getCell(8).alignment = { horizontal: 'center' };

  const signNoteRow = sheet.addRow(['', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '(Ký tên và đóng dấu)']);
  sheet.mergeCells(signNoteRow.number, 2, signNoteRow.number, 5);
  sheet.mergeCells(signNoteRow.number, 8, signNoteRow.number, 11);
  signNoteRow.getCell(2).font = { name: 'Times New Roman', italic: true };
  signNoteRow.getCell(8).font = { name: 'Times New Roman', italic: true };
  signNoteRow.getCell(2).alignment = { horizontal: 'center' };
  signNoteRow.getCell(8).alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `Bao_gia_${sanitizeFileName(quoteCode)}.xlsx`;
  downloadBlob(blob, fileName);
  return fileName;
}
