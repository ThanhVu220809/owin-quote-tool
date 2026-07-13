import ExcelJS from 'exceljs';
import type { ProductRecord } from '@/types/models';
import { resolveItemImage } from '@/lib/media/itemImageResolver';
import { toExcelImage } from '@/utils/excelImage';
import { buildCatalogueBlockRows } from '@/lib/catalogue/catalogueRows';
import { downloadBlob } from '@/utils/download';

const HEADERS = ['STT', 'Hình ảnh', 'Mô tả chi tiết', 'DV', 'Rộng', 'Cao', 'KL', 'Đơn giá', 'Thành tiền', 'Tổng tiền'];


function money(value: number | null): number | '' {
  return value ? value : '';
}

function styleBorder(): Partial<ExcelJS.Borders> {
  const line = { style: 'thin' as const, color: { argb: 'FF283846' } };
  return { top: line, left: line, bottom: line, right: line };
}

export async function exportBangGiaExcel(products: ProductRecord[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OWIN Quote Tool';
  const sheet = workbook.addWorksheet('Bang gia', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { width: 6 },
    { width: 18 },
    { width: 48 },
    { width: 7 },
    { width: 8 },
    { width: 8 },
    { width: 9 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
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

  for (const row of buildCatalogueBlockRows(products)) {
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
    const product = products.find((candidate) => candidate.code === row.productCode);
    if (product && row.imagePath) {
      const resolved = await resolveItemImage(product, products, { loadBlob: true });
      if (resolved.blob) {
        const image = await toExcelImage(resolved.blob);
        const imageId = workbook.addImage(image);
        sheet.addImage(imageId, { tl: { col: 1.1, row: excelRow.number - 1 + 0.1 }, ext: { width: 105, height: 58 } });
      }
      if (resolved.revoke && resolved.url) URL.revokeObjectURL(resolved.url);
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

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `BangGia_OWIN_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
