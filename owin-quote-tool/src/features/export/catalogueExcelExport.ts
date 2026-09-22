import ExcelJS from 'exceljs';
import type { ProductRecord } from '@/types/models';
import { toExcelImage } from '@/features/export/excelImage';
import {
  EXPORT_IMAGE_MAX_EDGE,
  EXPORT_IMAGE_QUALITY,
  loadExportImage,
} from '@/features/export/exportImage';
import { buildCatalogueBlockRows } from '@/lib/catalogue/catalogueRows';
import { downloadBlob } from '@/lib/browser/download';
import { DEFAULT_IMAGE_CONCURRENCY, mapWithConcurrency } from '@/lib/async/mapWithConcurrency';
import { trackExport } from '@/features/export/exportTiming';

const HEADERS = ['STT', 'Hình ảnh', 'Mô tả chi tiết', 'DV', 'Rộng', 'Cao', 'KL', 'Đơn giá', 'Thành tiền', 'Tổng tiền'];


function money(value: number | null): number | '' {
  return value ? value : '';
}

/**
 * Bytes ảnh cho ExcelJS: đã hạ kích thước, WebP mới phải chuyển thêm một bước.
 *
 * Dùng đúng khung chuẩn của Word/PDF bảng giá để ba lần xuất liên tiếp xài
 * chung một bản ảnh thay vì mỗi lần tải và mã hoá lại từ đầu.
 */
async function excelImageFor(path: string | null | undefined) {
  const image = await loadExportImage(path, {
    maxEdge: EXPORT_IMAGE_MAX_EDGE,
    quality: EXPORT_IMAGE_QUALITY,
  });
  if (!image) return null;
  if (image.extension === 'webp') return toExcelImage(image.blob);
  return { buffer: await image.blob.arrayBuffer(), extension: image.extension };
}

function styleBorder(): Partial<ExcelJS.Borders> {
  const line = { style: 'thin' as const, color: { argb: 'FF283846' } };
  return { top: line, left: line, bottom: line, right: line };
}

export function exportCatalogueExcel(products: ProductRecord[]): Promise<void> {
  return trackExport('Bảng giá Excel', () => buildCatalogueExcel(products));
}

async function buildCatalogueExcel(products: ProductRecord[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OWIN Quote Tool';
  const sheet = workbook.addWorksheet('Bang gia', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { width: 6 },
    { width: 16 },
    { width: 44 },
    { width: 7 },
    { width: 9 },
    { width: 9 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  const companyRow = sheet.addRow(['HOÀNG ANH OWIN', '', 'Tiên Điền - Nghi Xuân - Hà Tĩnh · 0799040616']);
  sheet.mergeCells(companyRow.number, 1, companyRow.number, 2);
  sheet.mergeCells(companyRow.number, 3, companyRow.number, 10);
  companyRow.font = { bold: true };
  companyRow.alignment = { horizontal: 'center' };

  const titleRow = sheet.addRow(['BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN']);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 10);
  titleRow.getCell(1).font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B6078' } };
  titleRow.getCell(1).alignment = { horizontal: 'center' };

  const headerRow = sheet.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2F44' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = styleBorder();
  });

  const blockRows = buildCatalogueBlockRows(products);

  // Tải + chuyển đổi toàn bộ ảnh trước, song song có giới hạn. Mỗi ảnh khác
  // nhau chỉ nhúng một lần, dù nhiều sản phẩm cùng dùng chung tấm đó.
  //
  // Lấy thẳng `row.imagePath` như bản Word và PDF. Trước đây chỗ này đi qua
  // `resolveItemImage`, mà hàm đó tải cả ảnh master (vài MB) chỉ để chọn ra
  // đường dẫn — tức mỗi sản phẩm tải hai lần, lần đầu là bản nặng nhất.
  const imagePaths = [
    ...new Set(
      blockRows.flatMap((row) => (row.rowType === 'product' && row.imagePath ? [row.imagePath] : [])),
    ),
  ];
  const imageIdByPath = new Map<string, number>();
  const loadedImages = await mapWithConcurrency(imagePaths, DEFAULT_IMAGE_CONCURRENCY, excelImageFor);
  imagePaths.forEach((path, index) => {
    const image = loadedImages[index];
    if (image) imageIdByPath.set(path, workbook.addImage(image));
  });

  for (const row of blockRows) {
    if (row.rowType === 'category') {
      const categoryRow = sheet.addRow([row.categoryName]);
      sheet.mergeCells(categoryRow.number, 1, categoryRow.number, 10);
      categoryRow.getCell(1).font = { bold: true };
      categoryRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
      categoryRow.getCell(1).border = styleBorder();
      continue;
    }

    const excelRow = sheet.addRow([
      row.stt,
      row.imagePath ? 'Có ảnh' : '',
      row.description,
      row.unit,
      row.width,
      row.height,
      row.weight,
      money(row.unitPriceVnd),
      money(row.amountVnd),
      money(row.completedTotalVnd),
    ]);
    excelRow.height = Math.max(24, row.descriptionLines.length * 18);
    const imageId = row.imagePath ? imageIdByPath.get(row.imagePath) : undefined;
    if (imageId !== undefined) {
      sheet.addImage(imageId, { tl: { col: 1.1, row: excelRow.number - 1 + 0.1 }, ext: { width: 105, height: 58 } });
    }
    excelRow.eachCell((cell, columnNumber) => {
      cell.border = styleBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: columnNumber >= 7 ? 'right' : columnNumber === 1 || columnNumber === 4 ? 'center' : 'left',
        wrapText: true,
      };
      if (columnNumber >= 8) cell.numFmt = '#,##0';
    });
  }

  // Nén nhanh (level 1): ảnh JPEG trong file vốn đã nén sẵn nên ép zip cố nén
  // tiếp chỉ tốn thêm vài giây CPU mà gần như không giảm được dung lượng.
  const buffer = await workbook.xlsx.writeBuffer({
    zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } },
  });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `BangGia_OWIN_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
