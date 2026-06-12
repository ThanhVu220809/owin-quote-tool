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
import type { Customer, QuoteLine } from '@/types/models';
import { buildFormat1Data, buildFormat2Data } from './buildQuoteData';
import { TEMPLATE_FILES } from '@/types/placeholders';

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

/** Tải Blob về máy với tên file. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
