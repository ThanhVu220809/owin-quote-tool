/**
 * XUẤT EXCEL (.xlsx) — dùng exceljs chạy trong trình duyệt.
 * Số liệu lấy từ cùng engine (quoteCalc) để khớp Word & preview.
 * Layout cột giống "Báo giá" (Format 1): STT · Mã · Mô tả · ĐVT · Rộng · Cao · SL · KL · Đơn giá · Thành tiền.
 */
import ExcelJS from 'exceljs';
import type { Customer, QuoteLine } from '@/types/models';
import { formatHienThiKhoiLuong } from '@/utils/calc';
import { tinhDong, khoiLuongDong, tinhTongBaoGia, tinhTongLamTron } from '@/features/quote/quoteCalc';
import { downloadBlob } from '@/utils/download';

const HEADER = ['STT', 'Mã', 'Mô tả', 'ĐVT', 'Rộng', 'Cao', 'SL', 'KL', 'Đơn giá', 'Thành tiền'];
const MONEY_FMT = '#,##0';

/** Mô tả phụ kiện đang bật → chuỗi nhiều dòng. */
function moTaPhuKien(line: QuoteLine): string {
  return line.accessories
    .filter((a) => a.enabled)
    .map((a) => `${a.ten} (SL ${a.sl})`)
    .join('\n');
}

export async function exportExcel(customer: Customer, lines: QuoteLine[], tamUng = 0): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OWIN Quote Tool';
  const ws = wb.addWorksheet('Báo giá', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: 5 }, { width: 10 }, { width: 42 }, { width: 6 }, { width: 8 },
    { width: 8 }, { width: 6 }, { width: 9 }, { width: 14 }, { width: 16 },
  ];
  const lastCol = HEADER.length;

  // Tiêu đề
  const titleRow = ws.addRow(['BÁO GIÁ CÔNG TRÌNH']);
  ws.mergeCells(titleRow.number, 1, titleRow.number, lastCol);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF0F2A3D' } };
  titleRow.getCell(1).alignment = { horizontal: 'center' };

  // Khách hàng + ngày
  ws.addRow([`Khách hàng: ${customer.ten || ''}`]);
  ws.addRow([`Địa chỉ: ${customer.diaChi || ''}`]);
  ws.addRow([`SĐT: ${customer.sdt || ''}    Email: ${customer.email || ''}`]);
  const now = new Date();
  ws.addRow([`Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`]);
  ws.addRow([]);

  // Header bảng
  const headerRow = ws.addRow(HEADER);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A3D' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });

  // Dòng sản phẩm + phụ kiện
  let stt = 0;
  for (const line of lines) {
    stt += 1;
    const t = tinhDong(line);
    const isBo = line.dvt === 'Bộ';
    const kl = isBo ? '' : formatHienThiKhoiLuong(khoiLuongDong(line));
    const spRow = ws.addRow([
      stt,
      line.ma,
      [line.ten, line.moTa].filter(Boolean).join('\n'),
      line.dvt,
      isBo ? '' : line.rong ?? '',
      isBo ? '' : line.cao ?? '',
      line.sl,
      kl,
      line.donGia,
      t.tienChinh,
    ]);
    styleDataRow(spRow);

    const accText = moTaPhuKien(line);
    if (accText) {
      const pkRow = ws.addRow(['', '', accText, '', '', '', '', '', '', t.tienPhuKien]);
      styleDataRow(pkRow);
      pkRow.font = { italic: true };
    }
  }

  // Tổng
  const tong = tinhTongBaoGia(lines);
  const lamTron = tinhTongLamTron(lines);
  const conLai = lamTron - tamUng;
  ws.addRow([]);
  addTotalRow(ws, lastCol, 'TỔNG TIỀN', tong, true);
  addTotalRow(ws, lastCol, 'LÀM TRÒN', lamTron, false);
  addTotalRow(ws, lastCol, 'TẠM ỨNG', tamUng, false);
  addTotalRow(ws, lastCol, 'CẦN THANH TOÁN', conLai, true);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `BaoGia_${customer.ten || 'OWIN'}.xlsx`.replace(/\s+/g, '_'));
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: 'FFB0B0B0' } };
  return { top: s, left: s, bottom: s, right: s };
}

function styleDataRow(row: ExcelJS.Row) {
  row.alignment = { vertical: 'top', wrapText: true };
  row.eachCell((cell, col) => {
    cell.border = thinBorder();
    if (col >= 5 && col <= 10) cell.alignment = { horizontal: 'right', vertical: 'top' };
    if (col === 9 || col === 10) cell.numFmt = MONEY_FMT;
  });
}

function addTotalRow(ws: ExcelJS.Worksheet, lastCol: number, label: string, value: number, bold: boolean) {
  const row = ws.addRow([]);
  ws.mergeCells(row.number, 1, row.number, lastCol - 1);
  const labelCell = row.getCell(1);
  labelCell.value = label;
  labelCell.alignment = { horizontal: 'right' };
  labelCell.font = { bold };
  const valCell = row.getCell(lastCol);
  valCell.value = value;
  valCell.numFmt = MONEY_FMT;
  valCell.font = { bold };
  valCell.alignment = { horizontal: 'right' };
}
