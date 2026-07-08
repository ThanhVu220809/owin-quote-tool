/**
 * ENGINE XUẤT WORD (docxtemplater) — TASK 4.5.
 *
 * VERIFY DOCS (đã đọc node_modules, KHÔNG theo trí nhớ):
 *  - docxtemplater@3.68.7:
 *      new Docxtemplater(zip, { modules, paragraphLoop, linebreaks })  // compile on the fly
 *      doc.render(data)        // KHÔNG dùng setData (deprecated)
 *      doc.toBlob()            // xuất Blob trực tiếp
 *  - docxtemplater-image-module-free@1.1.1:
 *      default export = ImageModule (function), new ImageModule(opts)
 *      opts.getImage(tagValue) → PHẢI trả ArrayBuffer (xem test.js: bytes.buffer)
 *      opts.getSize(img, tagValue) → [width, height]
 *      ⚠️ regex mẫu chỉ nhận png/jpg → ta tự strip mọi prefix data:*;base64,
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import type { CalculatedQuote, Customer, ProductRecord, QuoteLine } from '@/types/models';
import { buildFormat1Data, buildFormat2Data } from './buildQuoteData';
import { TEMPLATE_FILES } from '@/types/placeholders';
import { downloadBlob } from '@/utils/download';
import { formatSoVND } from '@/utils/format';
import { getImageDataUrlByPath } from '@/utils/imagePaths';
import { buildCatalogueBlockRows } from '@/lib/catalogue/catalogueRows';

import tplBaoGiaUrl from '@/assets/templates/Template_Bao_Gia.docx?url';
import tplBangGiaUrl from '@/assets/templates/Template_Bang_Gia.docx?url';

/** dataURL base64 (bất kỳ mime) → ArrayBuffer (kiểu image-module yêu cầu). */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** 1×1 PNG trong suốt — dùng cho ô ảnh rỗng (dòng phụ kiện) để module không lỗi. */
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function fetchTemplate(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được template: ${url}`);
  return res.arrayBuffer();
}

function dateParts(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    ngay: String(safe.getDate()),
    thang: String(safe.getMonth() + 1),
    nam: String(safe.getFullYear()),
  };
}

function unitLabel(unit: string): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function formatDecimal(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return '';
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

function accessoryItemText(name: unknown, quantity: unknown): string {
  const text = String(name || '').trim();
  if (!text) return '';
  const qty = Number(quantity ?? 0);
  return qty > 1 ? `${text} x${qty}` : text;
}

function buildQuoteWordAccessoryRows(item: CalculatedQuote['items'][number]) {
  const rows: Array<Record<string, string | number | boolean>> = [];
  const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
  if (fixed) {
    const quantity = Number(fixed.packageQuantity ?? fixed.quantity ?? 1) || 1;
    const unitPrice = Number(fixed.unitPrice ?? fixed.unitPriceVnd ?? 0) || 0;
    const entries = Array.isArray(fixed.items) ? fixed.items : [];
    rows.push({
      stt: '',
      ma: '',
      mo_ta: [
        `${String(fixed.name || 'Bộ phụ kiện đi kèm').trim()}:`,
        ...entries
          .map((entry) => {
            const row = entry as Record<string, unknown>;
            return accessoryItemText(row.name, row.quantity);
          })
          .filter(Boolean)
          .map((line) => `- ${line}`),
      ].join('\n'),
      dvt: 'Bộ',
      rong: '',
      cao: '',
      sl: formatDecimal(quantity),
      khoi_luong: formatDecimal(quantity),
      don_gia: formatSoVND(unitPrice),
      thanh_tien: formatSoVND(quantity * unitPrice),
      is_sp: false,
      is_pk: true,
    });
  }

  const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
  extras
    .filter((entry) => entry && String((entry as Record<string, unknown>).name || '').trim())
    .forEach((entry) => {
      const extra = entry as Record<string, unknown>;
      const unit = extra.unit === 'M2' || extra.unit === 'METER' || extra.unit === 'BO'
        ? extra.unit
        : 'BO';
      const quantity = Number(extra.quantity ?? extra.quantityPerSet ?? 1) || 1;
      const weight = unit === 'BO' ? 0 : Number(extra.weight ?? extra.kl ?? 0) || 0;
      const unitPrice = Number(extra.unitPrice ?? extra.unitPriceVnd ?? 0) || 0;
      const basis = unit === 'BO' ? quantity : weight;
      rows.push({
        stt: '',
        ma: '',
        mo_ta: String(extra.name || 'Phụ kiện phát sinh').trim(),
        dvt: unitLabel(unit),
        rong: '',
        cao: '',
        sl: unit === 'BO' ? formatDecimal(quantity) : '',
        khoi_luong: unit === 'BO' ? '' : formatDecimal(weight),
        don_gia: formatSoVND(unitPrice),
        thanh_tien: formatSoVND(basis * unitPrice),
        is_sp: false,
        is_pk: true,
      });
    });

  if (rows.length > 0) return rows;
  return item.accessories
    .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
    .map((accessory) => ({
      stt: '',
      ma: '',
      mo_ta: [accessory.name, accessory.note].filter(Boolean).join('\n'),
      dvt: 'Bộ',
      rong: '',
      cao: '',
      sl: formatDecimal(accessory.quantityPerSet),
      khoi_luong: formatDecimal(accessory.totalSet),
      don_gia: formatSoVND(accessory.unitPriceVnd),
      thanh_tien: formatSoVND(accessory.lineTotalVnd),
      is_sp: false,
      is_pk: true,
    }));
}

export function buildQuoteWordData(quote: CalculatedQuote) {
  const items: Array<Record<string, string | number | boolean>> = [];
  let stt = 0;

  quote.items.forEach((item) => {
    stt += 1;
    item.dimensions.forEach((line, lineIndex) => {
      const first = lineIndex === 0;
      const specLines = first
        ? (item.specs || []).filter((spec) => spec.value).map((spec) => `- ${spec.key}: ${spec.value}`)
        : [];
      items.push({
        stt: first ? stt : '',
        ma: first ? item.quoteItemCode || item.productCode : '',
        mo_ta: [
          first ? item.itemName : line.description || '',
          first ? item.description || '' : '',
          ...specLines,
        ].filter(Boolean).join('\n'),
        dvt: unitLabel(line.unit),
        rong: line.unit === 'BO' ? '' : line.widthM ?? '',
        cao: line.unit === 'BO' ? '' : line.heightM ?? '',
        sl: line.quantity,
        khoi_luong: line.unit === 'BO' ? line.quantity : formatDecimal(line.calculatedQty),
        don_gia: formatSoVND(line.unitPriceVnd),
        thanh_tien: formatSoVND(line.lineTotalVnd),
        is_sp: true,
        is_pk: false,
      });
    });

    items.push(...buildQuoteWordAccessoryRows(item));
  });

  const d = dateParts(quote.quoteDate);
  return {
    ten_kh: quote.customerName,
    dia_chi: quote.customerAddress,
    sdt: quote.customerPhone,
    email: quote.customerEmail || '',
    ngay: d.ngay,
    thang: d.thang,
    nam: d.nam,
    tong_tien: formatSoVND(quote.summary.totalVnd),
    lam_tron: formatSoVND(quote.summary.roundedTotalVnd),
    tam_ung: formatSoVND(quote.summary.depositVnd),
    con_lai: formatSoVND(quote.summary.balanceVnd),
    can_thanh_toan: formatSoVND(quote.summary.balanceVnd),
    items,
  };
}

export async function exportQuoteWord(quote: CalculatedQuote, quoteCode: string): Promise<string> {
  const content = await fetchTemplate(tplBaoGiaUrl);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(buildQuoteWordData(quote));
  const blob = doc.toBlob();
  const fileName = `Bao_gia_${quoteCode}.docx`;
  downloadBlob(blob, fileName);
  return fileName;
}

export async function buildBangGiaWordData(products: ProductRecord[]) {
  const rows = buildCatalogueBlockRows(products);
  const items: Array<Record<string, string | number | boolean>> = [];
  const imageValues: string[] = [];

  for (const row of rows) {
    let image = '';
    if (row.rowType === 'product') {
      image = (await getImageDataUrlByPath(row.imagePath)) || '';
      if (image) imageValues.push(image);
    }

    if (row.rowType === 'category') {
      items.push({
        stt: '',
        ma: '',
        mo_ta: row.categoryName,
        kich_thuoc: '',
        dvt: '',
        sl: '',
        khoi_luong: '',
        don_gia: '',
        thanh_tien: '',
        image: '',
        is_sp: false,
        is_pk: true,
      });
      continue;
    }

    items.push({
      stt: row.stt,
      ma: row.productCode,
      mo_ta: row.description,
      kich_thuoc: [row.width, row.height].filter(Boolean).join(' × '),
      dvt: row.unit,
      sl: row.weight,
      khoi_luong: row.weight,
      don_gia: row.unitPriceVnd ? formatSoVND(row.unitPriceVnd) : '',
      thanh_tien: row.amountVnd ? formatSoVND(row.amountVnd) : '',
      image,
      is_sp: row.rowType === 'product',
      is_pk: row.rowType !== 'product',
    });
  }

  const d = dateParts();
  const total = rows.reduce((sum, row) => sum + (row.rowType === 'product' ? row.completedTotalVnd || 0 : 0), 0);
  return {
    data: {
      ten_kh: 'HOÀNG ANH OWIN',
      dia_chi: 'Tiên Điền - Nghi Xuân - Hà Tĩnh',
      sdt: '0799040616',
      email: '',
      ngay: d.ngay,
      thang: d.thang,
      nam: d.nam,
      tong_tien: formatSoVND(total),
      lam_tron: formatSoVND(total),
      tam_ung: '0',
      con_lai: formatSoVND(total),
      can_thanh_toan: formatSoVND(total),
      items,
    },
    imageValues,
  };
}

export async function exportBangGiaWord(products: ProductRecord[]): Promise<string> {
  // Browser-safe DOCX export: keep PizZip/docxtemplater only, no fs/path/sharp/server APIs.
  // Data rows mirror the REFERENCE catalogue block model; exact XML vMerge belongs to the server renderer.
  const content = await fetchTemplate(tplBangGiaUrl);
  const { data, imageValues } = await buildBangGiaWordData(products);
  const sizeMap = await buildSizeMap(imageValues);
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage: (tagValue: string) => dataUrlToArrayBuffer(tagValue || TRANSPARENT_PNG),
    getSize: (_img: ArrayBuffer, tagValue: string): [number, number] =>
      tagValue ? sizeMap.get(tagValue) ?? [110, 80] : [1, 1],
  });
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  const blob = doc.toBlob();
  const fileName = `Bang_gia_OWIN_${new Date().toISOString().slice(0, 10)}.docx`;
  downloadBlob(blob, fileName);
  return fileName;
}

/** Tính [w,h] giữ tỉ lệ, cạnh rộng ≤ maxW (px → docxtemplater dùng px). */
function computeSize(natW: number, natH: number, maxW = 110): [number, number] {
  if (!natW || !natH) return [maxW, Math.round(maxW * 0.75)];
  const ratio = natH / natW;
  const w = Math.min(natW, maxW);
  return [Math.round(w), Math.round(w * ratio)];
}

/** Đọc kích thước thật của mỗi dataURL (async) để getSize (sync) tra cứu. */
async function buildSizeMap(dataUrls: string[]): Promise<Map<string, [number, number]>> {
  const map = new Map<string, [number, number]>();
  await Promise.all(
    dataUrls.map(
      (durl) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            map.set(durl, computeSize(img.naturalWidth, img.naturalHeight));
            resolve();
          };
          img.onerror = () => {
            map.set(durl, [110, 80]);
            resolve();
          };
          img.src = durl;
        }),
    ),
  );
  return map;
}

/** FORMAT 1 — Báo giá công trình (không ảnh). */
export async function exportFormat1(customer: Customer, lines: QuoteLine[], tamUng = 0): Promise<void> {
  const content = await fetchTemplate(tplBaoGiaUrl);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(buildFormat1Data(customer, lines, tamUng));
  const blob = doc.toBlob();
  downloadBlob(blob, TEMPLATE_FILES.format1.replace('Template_', 'BaoGia_'));
}

/** FORMAT 2 — Bảng giá hoàn thiện (có ảnh, BR-4 chỉ giỏ đã chọn). */
export async function exportFormat2(
  customer: Customer,
  lines: QuoteLine[],
  imageMap: Record<string, string>,
  tamUng = 0,
): Promise<void> {
  const content = await fetchTemplate(tplBangGiaUrl);
  const data = buildFormat2Data(customer, lines, imageMap, tamUng);

  // Pre-compute size cho mọi dataURL ảnh thật.
  const realUrls = Object.values(imageMap).filter(Boolean);
  const sizeMap = await buildSizeMap(realUrls);

  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage: (tagValue: string) => {
      const durl = tagValue && tagValue.length > 0 ? tagValue : TRANSPARENT_PNG;
      return dataUrlToArrayBuffer(durl);
    },
    getSize: (_img: ArrayBuffer, tagValue: string): [number, number] => {
      if (!tagValue) return [1, 1]; // ô ảnh rỗng (dòng phụ kiện) → ẩn
      return sizeMap.get(tagValue) ?? [110, 80];
    },
  });

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  const blob = doc.toBlob();
  downloadBlob(blob, TEMPLATE_FILES.format2.replace('Template_', 'BangGia_'));
}
