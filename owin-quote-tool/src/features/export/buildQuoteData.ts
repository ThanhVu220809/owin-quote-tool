/**
 * Build dữ liệu PHẲNG cho docxtemplater + preview — NGUỒN CHUNG để preview WYSIWYG và
 * file Word luôn khớp nhau.
 *
 * Cấu trúc (TASK 4.5): mỗi sản phẩm → tối đa 2 phần tử trong mảng items:
 *   - 1 dòng SẢN PHẨM (is_sp=true): có STT, mã, kích thước, đơn giá, thành tiền chính.
 *   - 1 dòng PHỤ KIỆN (is_pk=true) NGAY DƯỚI (trống STT/Mã) — CHỈ khi có phụ kiện bật.
 * KHÔNG merge ô (BR docx). Dòng phụ kiện để STT/Mã rỗng.
 *
 * Tên placeholder lấy từ types/placeholders.ts (nguồn chân lý duy nhất).
 */

import type { Customer, QuoteLine } from '@/types/models';
import type { Format1Data, Format1Item, Format2Data, Format2Item } from '@/types/placeholders';
import { ITEMS_LOOP } from '@/types/placeholders';
import { formatSoVND } from '@/utils/format';
import { formatHienThiKhoiLuong } from '@/utils/calc';
import { tinhDong, khoiLuongDong, tinhTongBaoGia } from '@/features/quote/quoteCalc';

/** Mô tả phụ kiện đang bật của 1 dòng → chuỗi nhiều dòng (\n). */
function moTaPhuKien(line: QuoteLine): string {
  return line.accessories
    .filter((a) => a.enabled)
    .map((a) => `${a.ten} (SL ${a.sl} × ${formatSoVND(a.donGia)})`)
    .join('\n');
}

function hasEnabledAcc(line: QuoteLine): boolean {
  return line.accessories.some((a) => a.enabled);
}

/** Kích thước gộp (Format 2). */
function kichThuocGop(line: QuoteLine): string {
  if (line.dvt === 'Bộ') return `${line.sl} Bộ`;
  const r = line.rong ?? 0;
  const c = line.cao ?? 0;
  return `${r} × ${c} (m)`;
}

/* ───────────────────────── FORMAT 1 — Báo giá công trình ───────────────────────── */

export function buildFormat1Data(customer: Customer, lines: QuoteLine[], tamUng = 0): Format1Data {
  const items: Format1Item[] = [];
  let stt = 0;
  for (const line of lines) {
    stt += 1;
    const t = tinhDong(line);
    const kl = khoiLuongDong(line);
    // Dòng sản phẩm
    items.push({
      stt,
      ma: line.ma,
      mo_ta: [line.ten, line.moTa].filter(Boolean).join('\n'),
      dvt: line.dvt,
      rong: line.dvt === 'Bộ' ? '' : (line.rong ?? ''),
      cao: line.dvt === 'Bộ' ? '' : (line.cao ?? ''),
      sl: line.sl,
      khoi_luong: line.dvt === 'Bộ' ? '' : formatHienThiKhoiLuong(kl),
      don_gia: formatSoVND(line.donGia),
      thanh_tien: formatSoVND(t.tienChinh),
      is_sp: true,
      is_pk: false,
    });
    // Dòng phụ kiện (chỉ khi có)
    if (hasEnabledAcc(line)) {
      items.push({
        stt: '',
        ma: '',
        mo_ta: moTaPhuKien(line),
        dvt: '',
        rong: '',
        cao: '',
        sl: '',
        khoi_luong: '',
        don_gia: '',
        thanh_tien: formatSoVND(t.tienPhuKien),
        is_sp: false,
        is_pk: true,
      });
    }
  }
  const tong = tinhTongBaoGia(lines);
  return {
    ten_kh: customer.ten,
    dia_chi: customer.diaChi,
    sdt: customer.sdt,
    email: customer.email,
    tong_tien: formatSoVND(tong),
    tam_ung: formatSoVND(tamUng),
    con_lai: formatSoVND(tong - tamUng),
    [ITEMS_LOOP]: items,
  };
}

/* ──────────────────────── FORMAT 2 — Bảng giá hoàn thiện (BR-4: giỏ đã chọn) ──────────────────────── */

/**
 * @param getImageData hàm trả base64/dataURL ảnh theo imageId (cho preview) — image-module
 *        Word sẽ tự lấy bytes ở engine xuất, nên ở đây chỉ cần preview dùng.
 */
export function buildFormat2Data(
  customer: Customer,
  lines: QuoteLine[],
  imageMap: Record<string, string> = {},
  tamUng = 0,
): Format2Data {
  const items: Format2Item[] = [];
  let stt = 0;
  for (const line of lines) {
    stt += 1;
    const t = tinhDong(line);
    const kl = khoiLuongDong(line);
    items.push({
      stt,
      ma: line.ma,
      mo_ta: [line.ten, line.moTa].filter(Boolean).join('\n'),
      kich_thuoc: kichThuocGop(line),
      dvt: line.dvt,
      sl: line.sl,
      khoi_luong: line.dvt === 'Bộ' ? '' : formatHienThiKhoiLuong(kl),
      don_gia: formatSoVND(line.donGia),
      thanh_tien: formatSoVND(t.tienChinh),
      image: line.imageId ? (imageMap[line.imageId] ?? '') : '',
      is_sp: true,
      is_pk: false,
    });
    if (hasEnabledAcc(line)) {
      items.push({
        stt: '',
        ma: '',
        mo_ta: moTaPhuKien(line),
        kich_thuoc: '',
        dvt: '',
        sl: '',
        khoi_luong: '',
        don_gia: '',
        thanh_tien: formatSoVND(t.tienPhuKien),
        image: '',
        is_sp: false,
        is_pk: true,
      });
    }
  }
  const tong = tinhTongBaoGia(lines);
  return {
    ten_kh: customer.ten,
    dia_chi: customer.diaChi,
    sdt: customer.sdt,
    email: customer.email,
    tong_tien: formatSoVND(tong),
    tam_ung: formatSoVND(tamUng),
    con_lai: formatSoVND(tong - tamUng),
    [ITEMS_LOOP]: items,
  };
}
