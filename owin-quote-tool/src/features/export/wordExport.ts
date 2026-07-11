/**
 * Browser-safe Word export for the migrated REFERENCE templates.
 *
 * The bundled DOCX files are the REFERENCE marker-row templates:
 * - quote: {nhom}, {stt}/{ma_sp}/{anh_sp}/..., {bo_pk_*}, {pk_*}, {ps_*}
 * - catalogue: {category}, {product_info_block}, {accessory_block}
 *
 * We clone those Word table rows directly with PizZip. Runtime stays static and
 * GitHub Pages compatible: no fs/path/sharp/server upload/API routes.
 */

import PizZip from 'pizzip';
import type { CalculatedQuote, Customer, ProductRecord, ProductUnit, QuoteLine } from '@/types/models';
import { downloadBlob } from '@/utils/download';
import { formatSoVND } from '@/utils/format';
import { getImageDataUrlByPath } from '@/utils/imagePaths';
import { buildCatalogueBlockRows, type CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';
import { tinhDong, tinhTongBaoGia, tinhTongLamTron } from '@/features/quote/quoteCalc';

import tplBaoGiaUrl from '@/assets/templates/Template_Bao_Gia.docx?url';
import tplBangGiaUrl from '@/assets/templates/Template_Bang_Gia.docx?url';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Image sizing follows the rendered cell, not a fixed photo box:
 * - catalogue: finish the product + accessory row layout first, then contain-fit into
 *   95% of the merged image cell on both axes;
 * - quote: contain-fit into 95% of its image column.
 */
const MM_TO_EMU = 36000;
const DXA_TO_EMU = 635;
const CATALOGUE_TEMPLATE_TABLE_WIDTH = 14515;
const CATALOGUE_HEADER_TABLE_WIDTH = CATALOGUE_TEMPLATE_TABLE_WIDTH;
const CATALOGUE_TABLE_WIDTHS = [0.9, 5.1, 7.2, 0.9, 1.15, 1.0, 1.1, 2.75, 2.75, 2.75];
const CATALOGUE_COLUMN_WIDTHS_DXA = scaleWidthsToTarget(
  CATALOGUE_TABLE_WIDTHS,
  CATALOGUE_TEMPLATE_TABLE_WIDTH,
);
const CATALOGUE_IMAGE_CELL_MARGIN_DXA = 55;
const CATALOGUE_IMAGE_CELL_VERTICAL_MARGIN_DXA = 45;
const CATALOGUE_DESCRIPTION_CELL_MARGIN_DXA = 55;
const CATALOGUE_IMG_FILL = 0.95;
const CATALOGUE_IMG_MAX_CX = Math.round(
  (CATALOGUE_COLUMN_WIDTHS_DXA[1] - 2 * CATALOGUE_IMAGE_CELL_MARGIN_DXA) * DXA_TO_EMU * CATALOGUE_IMG_FILL,
);
const CATALOGUE_IMG_DEFAULT_MAX_CY = Math.round(3.8 * 360000);
const QUOTE_IMAGE_COLUMN_DXA = 2600;
const QUOTE_IMAGE_CELL_MARGIN_DXA = 108;
const QUOTE_IMG_FILL = 0.95;
const QUOTE_IMG_MAX_CX = Math.round(
  (QUOTE_IMAGE_COLUMN_DXA - 2 * QUOTE_IMAGE_CELL_MARGIN_DXA) * DXA_TO_EMU * QUOTE_IMG_FILL,
); // ≈ 1_438_148
const QUOTE_IMG_PAGE_SAFE_MAX_CY = Math.round(170 * MM_TO_EMU);
const IMG_CORNER_ADJ = 8000;
const CATALOGUE_PRODUCT_ROW_HEIGHT_TWIPS = 1530; // measured in REF export
const CATALOGUE_EXTRA_ROW_HEIGHT_TWIPS = 340;
const CATALOGUE_TITLE = 'BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN';

type XmlRowMatch = { row: string; index: number; end: number };
type ImageEmbedOptions = {
  maxCx?: number;
  maxCy?: number;
  /** catalogue uses rect (REF); quote uses roundRect (REF) */
  geometry?: 'rect' | 'roundRect';
  fallbackLogo?: boolean;
};
type ImageEmbedder = (path: string | null | undefined, options?: ImageEmbedOptions) => Promise<string | null>;

async function fetchTemplateZip(url: string): Promise<PizZip> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được template: ${url}`);
  return new PizZip(await response.arrayBuffer());
}

function generateDocxBlob(zip: PizZip): Blob {
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME });
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

function normalizeUnit(value: unknown): ProductUnit {
  const unit = String(value || '').trim().toUpperCase();
  if (unit === 'BO' || unit === 'BỘ') return 'BO';
  if (unit === 'METER' || unit === 'MD') return 'METER';
  return 'M2';
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

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function repairSplitEmailToken(xml: string): string {
  return xml.replace(
    /\{<\/w:t><\/w:r>(?:<w:proofErr\b[^>]*\/>)*<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>email\}/g,
    '{email}',
  );
}

function replaceToken(xml: string, token: string, value: unknown): string {
  return xml.split(token).join(xmlEscape(value));
}

function replaceTokens(xml: string, values: Record<string, unknown>): string {
  let next = repairSplitEmailToken(xml);
  for (const [token, value] of Object.entries(values)) {
    next = replaceToken(next, token, value);
  }
  return next;
}

function multilineRunContent(text: string): string {
  return String(text || '')
    .split(/\r?\n/)
    .map((line, index) => {
      const escaped = xmlEscape(line);
      return index === 0
        ? `<w:t xml:space="preserve">${escaped}</w:t>`
        : `<w:br/><w:t xml:space="preserve">${escaped}</w:t>`;
    })
    .join('');
}

function replaceMultilineToken(rowXml: string, token: string, text: string): string {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const singleRunPattern = new RegExp(
    `(<w:r\\b[^>]*>(?:<w:rPr>[\\s\\S]*?</w:rPr>)?)<w:t([^>]*)>${escapedToken}</w:t>(</w:r>)`,
  );
  if (singleRunPattern.test(rowXml)) {
    return rowXml.replace(singleRunPattern, (_match, runOpen) => `${runOpen}${multilineRunContent(text)}</w:r>`);
  }
  return rowXml.split(token).join(xmlEscape(text).replace(/\r?\n/g, '<w:br/>'));
}

function removeLeftoverTokens(xml: string): string {
  return repairSplitEmailToken(xml)
    .replace(/\{[a-zA-Z0-9_./%-]+\}/g, '')
    .replace(/undefined(?=<\/w:tr>)/g, '');
}

function removeParagraphContaining(xml: string, token: string): string {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.replace(new RegExp(`<w:p\\b(?:(?!</w:p>)[\\s\\S])*?${escapedToken}(?:(?!</w:p>)[\\s\\S])*?</w:p>`, 'g'), '');
}

function removeBlankQuoteContactLines(xml: string, quote: CalculatedQuote): string {
  let next = repairSplitEmailToken(xml);
  if (!String(quote.customerPhone || '').trim()) next = removeParagraphContaining(next, '{sdt}');
  if (!String(quote.customerEmail || '').trim()) next = removeParagraphContaining(next, '{email}');
  return next;
}

function rowMatches(documentXml: string): XmlRowMatch[] {
  return [...documentXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((match) => ({
    row: match[0],
    index: match.index || 0,
    end: (match.index || 0) + match[0].length,
  }));
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageInfoFromDataUrl(dataUrl: string): { ext: string; contentType: string } {
  const contentType = dataUrl.match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() || 'image/png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (contentType.includes('webp')) return { ext: 'webp', contentType: 'image/webp' };
  if (contentType.includes('gif')) return { ext: 'gif', contentType: 'image/gif' };
  return { ext: 'png', contentType: 'image/png' };
}

/**
 * Contain-fit into max EMU box — same algorithm as REFERENCE getContainExtent:
 * start at full max width, shrink if height exceeds max height.
 * Returns EMU extents (not px) for Word drawing XML.
 */
export function fitImageDimensionsToEmuBox(
  sourceWidth: number,
  sourceHeight: number,
  maxCx: number,
  maxCy: number,
): { cx: number; cy: number } {
  const safeMaxCx = Math.max(1, Math.round(maxCx));
  const safeMaxCy = Math.max(1, Math.round(maxCy));
  const ratio = sourceWidth / sourceHeight;
  if (!Number.isFinite(ratio) || ratio <= 0) return { cx: safeMaxCx, cy: safeMaxCy };

  // Fill width first, then constrain height. Exactly one axis reaches its 95% limit.
  let cx = safeMaxCx;
  let cy = Math.round(cx / ratio);
  if (cy > safeMaxCy) {
    cy = safeMaxCy;
    cx = Math.round(cy * ratio);
  }
  return { cx: Math.max(1, cx), cy: Math.max(1, cy) };
}

async function fitImageDataUrlToEmuBox(
  dataUrl: string,
  maxCx: number,
  maxCy: number,
): Promise<{ cx: number; cy: number }> {
  const natural = await new Promise<{ w: number; h: number }>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ w: maxCx, h: maxCy });
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ w: image.naturalWidth || 1, h: image.naturalHeight || 1 });
    image.onerror = () => resolve({ w: 1, h: 1 });
    image.src = dataUrl;
  });
  return fitImageDimensionsToEmuBox(natural.w, natural.h, maxCx, maxCy);
}

function ensureContentType(zip: PizZip, ext: string, contentType: string): void {
  const entry = zip.file('[Content_Types].xml');
  if (!entry) return;
  let xml = entry.asText();
  if (new RegExp(`<Default\\s+Extension="${ext}"(?:\\s|/)`).test(xml)) return;
  xml = xml.replace('</Types>', `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`);
  zip.file('[Content_Types].xml', xml);
}

function ensureDocumentRels(zip: PizZip): string {
  return zip.file('word/_rels/document.xml.rels')?.asText()
    || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
}

function createImageEmbedder(zip: PizZip): ImageEmbedder {
  let relsXml = ensureDocumentRels(zip);
  const relIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  let nextRelId = Math.max(0, ...relIds) + 1;
  let nextDocPrId = 5000;
  let nextImageId = 1;

  return async (path, options = {}) => {
    const fallbackLogo = options.fallbackLogo !== false;
    const dataUrl = await getImageDataUrlByPath(path, { fallbackLogo });
    if (!dataUrl) return null;
    const { ext, contentType } = imageInfoFromDataUrl(dataUrl);
    const imageName = `owin-browser-${nextImageId++}.${ext}`;
    const relId = `rId${nextRelId++}`;
    const docPrId = nextDocPrId++;
    const maxCx = options.maxCx ?? CATALOGUE_IMG_MAX_CX;
    const maxCy = options.maxCy ?? CATALOGUE_IMG_DEFAULT_MAX_CY;
    const { cx, cy } = await fitImageDataUrlToEmuBox(dataUrl, maxCx, maxCy);
    const geometry = options.geometry ?? 'rect';
    const geomXml =
      geometry === 'roundRect'
        ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${IMG_CORNER_ADJ}"/></a:avLst></a:prstGeom>`
        : `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;

    zip.file(`word/media/${imageName}`, dataUrlToUint8Array(dataUrl));
    ensureContentType(zip, ext, contentType);
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageName}"/></Relationships>`,
    );
    zip.file('word/_rels/document.xml.rels', relsXml);

    return (
      `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="OWIN image ${docPrId}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${xmlEscape(imageName)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      `${geomXml}` +
      `</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
    );
  };
}

function fillImageToken(rowXml: string, token: string, drawingXml: string | null): string {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const runWithToken = new RegExp(
    `<w:r\\b[^>]*>(?:(?!</w:r>)[\\s\\S])*?<w:t[^>]*>${escapedToken}</w:t>(?:(?!</w:r>)[\\s\\S])*?</w:r>`,
  );
  if (drawingXml) {
    if (runWithToken.test(rowXml)) return rowXml.replace(runWithToken, `<w:r>${drawingXml}</w:r>`);
    return rowXml.split(token).join(drawingXml);
  }
  return rowXml.split(token).join('');
}

function upsertCellProperty(cellXml: string, propertyXml: string, propertyName: string): string {
  const propertyPattern = new RegExp(`<w:${propertyName}\\b[^>]*\\/>`, 'g');
  const next = cellXml.replace(propertyPattern, '');
  if (/<w:tcPr\b[^>]*>/.test(next)) {
    return next.replace(/<\/w:tcPr>/, `${propertyXml}</w:tcPr>`);
  }
  return next.replace(/<w:tc\b([^>]*)>/, `<w:tc$1><w:tcPr>${propertyXml}</w:tcPr>`);
}

function clearCellBody(cellXml: string): string {
  const openMatch = cellXml.match(/^<w:tc\b[^>]*>/)?.[0] || '<w:tc>';
  const propsMatch = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] || '';
  return `${openMatch}${propsMatch}<w:p/></w:tc>`;
}

function applyQuoteIdentityMerge(rowXml: string, mode: 'restart' | 'continue'): string {
  let cellIndex = 0;
  return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
    const currentIndex = cellIndex;
    cellIndex += 1;
    if (currentIndex > 2) return cellXml;
    const merged = upsertCellProperty(cellXml, `<w:vMerge w:val="${mode}"/>`, 'vMerge');
    return mode === 'continue' ? clearCellBody(merged) : merged;
  });
}

/**
 * vMerge cột MÔ TẢ (index 3) gộp chung qua các dòng kích thước (dòng tính) của 1 sản phẩm,
 * để phần mô tả là 1 ô cao thay vì 1 dòng có chữ + các dòng trống bên dưới.
 * Chỉ áp cho các dòng 'product'; dòng phụ kiện giữ mô tả riêng nên vùng gộp tự dừng.
 */
function applyQuoteDescriptionMerge(rowXml: string, mode: 'restart' | 'continue'): string {
  let cellIndex = 0;
  return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
    const currentIndex = cellIndex;
    cellIndex += 1;
    if (currentIndex !== 3) return cellXml;
    const merged = upsertCellProperty(cellXml, `<w:vMerge w:val="${mode}"/>`, 'vMerge');
    return mode === 'continue' ? clearCellBody(merged) : merged;
  });
}

function addVerticalMergeToCell(cellXml: string, mode: 'restart' | 'continue'): string {
  const mergeXml = mode === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
  return upsertCellProperty(cellXml, mergeXml, 'vMerge');
}

function applyCatalogueVerticalMerges(rowXml: string, mode: 'restart' | 'continue'): string {
  let cellIndex = 0;
  return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
    const currentIndex = cellIndex;
    cellIndex += 1;
    return currentIndex === 0 || currentIndex === 1 || currentIndex === 9
      ? addVerticalMergeToCell(cellXml, mode)
      : cellXml;
  });
}

function removeKeepNext(rowXml: string): string {
  return rowXml.replace(/<w:keepNext\b[^>]*\/>/g, '');
}

function addKeepNextToParagraph(paragraphXml: string): string {
  if (/<w:keepNext\b[^>]*\/>/.test(paragraphXml)) return paragraphXml;
  if (/<w:pPr\b[^>]*>/.test(paragraphXml)) {
    return paragraphXml.replace('</w:pPr>', '<w:keepNext/></w:pPr>');
  }
  return paragraphXml.replace(/<w:p\b([^>]*)>/, '<w:p$1><w:pPr><w:keepNext/></w:pPr>');
}

function addKeepNextToAllParagraphsInRow(rowXml: string): string {
  return removeKeepNext(rowXml).replace(/<w:p\b[\s\S]*?<\/w:p>/g, addKeepNextToParagraph);
}

function ensureCantSplit(rowXml: string): string {
  if (/<w:cantSplit\b[^>]*\/>/.test(rowXml)) return rowXml;
  if (/<w:trPr\b[^>]*>/.test(rowXml)) {
    return rowXml.replace(/<w:trPr\b([^>]*)>/, '<w:trPr$1><w:cantSplit/>');
  }
  return rowXml.replace(/<w:tr\b([^>]*)>/, '<w:tr$1><w:trPr><w:cantSplit/></w:trPr>');
}

function setMinRowHeight(rowXml: string, heightTwips: number): string {
  const heightXml = `<w:trHeight w:val="${heightTwips}" w:hRule="atLeast"/>`;
  if (/<w:trHeight\b[^>]*\/>/.test(rowXml)) {
    return rowXml.replace(/<w:trHeight\b[^>]*\/>/, heightXml);
  }
  if (/<w:trPr\b[^>]*>/.test(rowXml)) {
    return rowXml.replace(/<w:trPr\b([^>]*)>/, `<w:trPr$1>${heightXml}`);
  }
  return rowXml.replace(/<w:tr\b([^>]*)>/, `<w:tr$1><w:trPr>${heightXml}</w:trPr>`);
}

function formatQuoteSpecLine(key: string, value: string): string {
  const label = String(key || '').trim();
  if (!label) return '';
  const text = String(value || '').trim();
  // Empty value: keep the key only (no trailing colon).
  return text ? `- ${label}: ${text}` : `- ${label}`;
}

function quoteDescription(item: CalculatedQuote['items'][number], lineDescription?: string | null): string {
  return [
    item.itemName,
    lineDescription,
    ...(item.specs || [])
      .filter((spec) => String(spec.key || '').trim())
      .map((spec) => formatQuoteSpecLine(spec.key, spec.value)),
  ].filter(Boolean).join('\n');
}

/**
 * REFERENCE quote-export-docx strategy (browser-safe port):
 * - Marker rows {nhom}/{stt}/{bo_pk_*}/{pk_*}/{ps_*} only define the injection span.
 * - ALL data rows (product, fixed package, extra) are rendered with the PRODUCT template row.
 * - Fixed accessory item lines are multiline description inside the fixed package row.
 * - Never clone blank {pk_ten} rows (orphan "x" source in REFERENCE notes).
 * - STT / Mã SP / Ảnh vMerge across the whole item block.
 * - keepNext + cantSplit on all but last row of each item block.
 */
function findQuoteTemplateRows(documentXml: string) {
  const rows = rowMatches(documentXml);
  const group = rows.find((entry) => entry.row.includes('{nhom}'));
  const product = rows.find((entry) => entry.row.includes('{stt}') && entry.row.includes('{ma_sp}'));
  const fixedSet = rows.find((entry) => entry.row.includes('{bo_pk_ten}'));
  const fixedItem = rows.find((entry) => entry.row.includes('{pk_ten}'));
  const extra = rows.find((entry) => entry.row.includes('{ps_ten}'));
  // Include ALL marker data rows so blank fixed-item/extra shells are removed from the table.
  const matches = [group, product, fixedSet, fixedItem, extra].filter((entry): entry is XmlRowMatch => Boolean(entry));
  if (!product || matches.length === 0) throw new Error('Template báo giá thiếu dòng placeholder sản phẩm.');
  return { group, product, fixedSet, fixedItem, extra, matches };
}

function renderQuoteGroupRow(template: string, groupName: string): string {
  return removeLeftoverTokens(replaceToken(template, '{nhom}', groupName));
}

type QuoteDocDataRow = {
  kind: 'product' | 'fixedAccessory' | 'extraAccessory';
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
  showImage: boolean;
};

function quoteFixedItemLines(fixed: Record<string, unknown>): string[] {
  const items = Array.isArray(fixed.items) ? fixed.items : [];
  return items
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const name = String(entry.name || '').trim();
      if (!name) return '';
      const quantity = Number(entry.quantity ?? 0);
      // REFERENCE: only show "xN" when quantity > 1; qty 0/1 = name only.
      return quantity > 1 ? `- ${name} x${formatDecimal(quantity)}` : `- ${name}`;
    })
    .filter(Boolean);
}

function fixedPackageDescription(fixed: Record<string, unknown>): string {
  const name = String(fixed.name || 'Bộ phụ kiện đi kèm').trim() || 'Bộ phụ kiện đi kèm';
  const itemLines = quoteFixedItemLines(fixed);
  return [`${name}:`, ...itemLines].join('\n');
}

/** Build ordered document rows for one quote item (REFERENCE print-group shape). */
/**
 * Estimate an item block's content height in EMU from its description lines, so the
 * merged image can fill ~95% of the (content-driven) image cell. More specs/accessories
 * → taller block → bigger image; a sparse item gets a smaller image. This is why the
 * resize differs per product/category.
 */
const QUOTE_LINE_EMU = 175_000; // ~ one description line
const QUOTE_ROW_PAD_EMU = 55_000; // cell padding per row
function estimateQuoteBlockHeightEmu(rows: QuoteDocDataRow[]): number {
  let total = 0;
  for (const row of rows) {
    const lines = Math.max(1, String(row.description || '').split('\n').filter(Boolean).length);
    total += lines * QUOTE_LINE_EMU + QUOTE_ROW_PAD_EMU;
  }
  return total;
}

function buildQuoteItemDocRows(
  item: CalculatedQuote['items'][number],
  itemIndex: number,
): QuoteDocDataRow[] {
  const rows: QuoteDocDataRow[] = [];
  const stt = String(itemIndex + 1);
  const code = item.quoteItemCode || item.productCode || `HM-${String(itemIndex + 1).padStart(2, '0')}`;

  const dimensions = item.dimensions.filter((line) => {
    const qty = Number(line.quantity || 0);
    const w = Number(line.widthM || 0);
    const h = Number(line.heightM || 0);
    return qty > 0 || w > 0 || h > 0 || Number(line.lineTotalVnd || 0) > 0;
  });
  const lines = dimensions.length > 0 ? dimensions : item.dimensions.slice(0, 1);

  lines.forEach((line, lineIndex) => {
    rows.push({
      kind: 'product',
      stt: lineIndex === 0 ? stt : '',
      code: lineIndex === 0 ? code : '',
      description: lineIndex === 0 ? quoteDescription(item, line.description) : String(line.description || ''),
      unit: unitLabel(line.unit),
      width: line.unit === 'BO' ? '' : formatDecimal(line.widthM),
      height: line.unit === 'BO' ? '' : formatDecimal(line.heightM),
      quantity: formatDecimal(line.quantity),
      weight: formatDecimal(line.calculatedQty),
      unitPrice: formatSoVND(line.unitPriceVnd),
      amount: formatSoVND(line.lineTotalVnd),
      showImage: lineIndex === 0,
    });
  });

  const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
  if (fixed) {
    const quantity = Number(fixed.packageQuantity ?? fixed.quantity ?? 1) || 1;
    const unitPrice = Number(fixed.unitPrice ?? fixed.unitPriceVnd ?? 0) || 0;
    const hasContent =
      String(fixed.name || '').trim()
      || (Array.isArray(fixed.items) && fixed.items.some((entry) => String((entry as Record<string, unknown>).name || '').trim()))
      || unitPrice > 0;
    if (hasContent) {
      rows.push({
        kind: 'fixedAccessory',
        stt: '',
        code: '',
        description: fixedPackageDescription(fixed),
        unit: 'Bộ',
        width: '',
        height: '',
        quantity: formatDecimal(quantity),
        weight: '',
        unitPrice: formatSoVND(unitPrice),
        amount: formatSoVND(quantity * unitPrice),
        showImage: false,
      });
    }
  } else {
    item.accessories
      .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
      .forEach((accessory) => {
        const noteItems = String(accessory.note || '')
          .split(/\r?\n|,/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((name) => `- ${name}`);
        const quantity = accessory.totalSet || accessory.quantityPerSet || 1;
        rows.push({
          kind: 'fixedAccessory',
          stt: '',
          code: '',
          description: [`${accessory.name}:`, ...noteItems].join('\n'),
          unit: 'Bộ',
          width: '',
          height: '',
          quantity: formatDecimal(quantity),
          weight: '',
          unitPrice: formatSoVND(accessory.unitPriceVnd),
          amount: formatSoVND(accessory.lineTotalVnd),
          showImage: false,
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
        const weight = unit === 'BO' ? quantity : Number(entry.weight ?? entry.kl ?? 0) || 0;
        const unitPrice = Number(entry.unitPrice ?? entry.unitPriceVnd ?? 0) || 0;
        const amount = (unit === 'BO' ? quantity : weight) * unitPrice;
        rows.push({
          kind: 'extraAccessory',
          stt: '',
          code: '',
          description: String(entry.name || 'Phụ kiện phát sinh').trim(),
          unit: unitLabel(unit),
          width: '',
          height: '',
          quantity: unit === 'BO' ? formatDecimal(quantity) : '',
          weight: unit === 'BO' ? '' : formatDecimal(weight),
          unitPrice: formatSoVND(unitPrice),
          amount: formatSoVND(amount),
          showImage: false,
        });
      });
  }

  return rows;
}

/** Render any quote data row using the product marker template (REFERENCE approach). */
function renderQuoteUnifiedProductRow(
  template: string,
  row: QuoteDocDataRow,
  drawingXml: string | null,
): string {
  let xml = template;
  xml = replaceToken(xml, '{stt}', row.stt);
  xml = replaceToken(xml, '{ma_sp}', row.code);
  xml = fillImageToken(xml, '{anh_sp}', drawingXml);
  xml = replaceMultilineToken(xml, '{mo_ta}', row.description);
  xml = replaceToken(xml, '{dv}', row.unit);
  xml = replaceToken(xml, '{rong}', row.width);
  xml = replaceToken(xml, '{cao}', row.height);
  xml = replaceToken(xml, '{sl}', row.quantity);
  xml = replaceToken(xml, '{kl}', row.weight);
  xml = replaceToken(xml, '{dg}', row.unitPrice);
  xml = replaceToken(xml, '{tt}', row.amount);
  return removeLeftoverTokens(xml);
}

function ensureBoldFontRuns(rowXml: string): string {
  return rowXml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (runXml) => {
    if (!/<w:t\b/.test(runXml)) return runXml;
    if (/<w:rPr\b[^>]*>/.test(runXml)) {
      let next = /<w:b\b[^>]*\/>/.test(runXml)
        ? runXml
        : runXml.replace(/<w:rPr\b([^>]*)>/, '<w:rPr$1><w:b/>');
      next = /<w:sz\b[^>]*\/>/.test(next)
        ? next.replace(/<w:sz\b[^>]*\/>/g, '<w:sz w:val="20"/>')
        : next.replace('</w:rPr>', '<w:sz w:val="20"/></w:rPr>');
      next = /<w:szCs\b[^>]*\/>/.test(next)
        ? next.replace(/<w:szCs\b[^>]*\/>/g, '<w:szCs w:val="20"/>')
        : next.replace('</w:rPr>', '<w:szCs w:val="20"/></w:rPr>');
      return next;
    }
    return runXml.replace(/<w:r\b([^>]*)>/, '<w:r$1><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>');
  });
}

function ensureAllTablesBold(documentXml: string): string {
  return documentXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tableXml) => ensureBoldFontRuns(tableXml));
}

function setTableWidth(tableXml: string, width: number): string {
  const widthXml = `<w:tblW w:w="${width}" w:type="dxa"/>`;
  if (/<w:tblW\b[^>]*\/>/.test(tableXml)) return tableXml.replace(/<w:tblW\b[^>]*\/>/, widthXml);
  if (/<w:tblPr\b[^>]*>/.test(tableXml)) {
    return tableXml.replace(/<w:tblPr\b[^>]*>/, (match) => `${match}${widthXml}`);
  }
  return tableXml.replace(/<w:tbl\b([^>]*)>/, `<w:tbl$1><w:tblPr>${widthXml}</w:tblPr>`);
}

function removeTableIndent(tableXml: string): string {
  return tableXml.replace(/<w:tblInd\b[^>]*\/>/g, '');
}

function setTableJustification(tableXml: string, value: 'left' | 'center'): string {
  const jcXml = `<w:jc w:val="${value}"/>`;
  if (/<w:jc\b[^>]*\/>/.test(tableXml)) return tableXml.replace(/<w:jc\b[^>]*\/>/g, jcXml);
  if (/<w:tblPr\b[^>]*>/.test(tableXml)) {
    return tableXml.replace(/<w:tblPr\b[^>]*>/, (match) => `${match}${jcXml}`);
  }
  return tableXml.replace(/<w:tbl\b([^>]*)>/, `<w:tbl$1><w:tblPr>${jcXml}</w:tblPr>`);
}

function ensureFixedTableLayout(tableXml: string): string {
  const layoutXml = '<w:tblLayout w:type="fixed"/>';
  if (/<w:tblLayout\b[^>]*\/>/.test(tableXml)) return tableXml.replace(/<w:tblLayout\b[^>]*\/>/g, layoutXml);
  if (/<w:tblPr\b[^>]*>/.test(tableXml)) {
    return tableXml.replace(/<w:tblPr\b[^>]*>/, (match) => `${match}${layoutXml}`);
  }
  return tableXml.replace(/<w:tbl\b([^>]*)>/, `<w:tbl$1><w:tblPr>${layoutXml}</w:tblPr>`);
}

function setTableGridToWidths(tableXml: string, widths: number[]): string {
  const gridXml = `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
  if (/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/.test(tableXml)) {
    return tableXml.replace(/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/, gridXml);
  }
  return tableXml.replace(/<\/w:tblPr>/, `</w:tblPr>${gridXml}`);
}

function scaleWidthsToTarget(widths: number[], targetWidth: number): number[] {
  const sum = widths.reduce((total, width) => total + width, 0);
  if (sum <= 0) return widths;
  const scaled = widths.map((width) => Math.max(1, Math.round((width * targetWidth) / sum)));
  const diff = targetWidth - scaled.reduce((total, width) => total + width, 0);
  if (scaled.length > 0) scaled[scaled.length - 1] += diff;
  return scaled;
}

function setTableColumnWidths(tableXml: string, widths: number[]): string {
  let next = setTableGridToWidths(tableXml, widths);
  next = next.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (rowXml) => {
    let columnIndex = 0;
    return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
      const span = Number(cellXml.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/)?.[1] || '1');
      const width = widths.slice(columnIndex, columnIndex + span).reduce((total, value) => total + value, 0)
        || widths[columnIndex % widths.length];
      columnIndex += span;
      if (/<w:tcW\b[^>]*\/>/.test(cellXml)) {
        return cellXml.replace(/<w:tcW\b[^>]*\/>/, (match) => match
          .replace(/w:w="\d+"/, `w:w="${width}"`)
          .replace(/w:type="[^"]+"/, 'w:type="dxa"'));
      }
      if (/<w:tcPr\b[^>]*>/.test(cellXml)) {
        return cellXml.replace(/<w:tcPr\b[^>]*>/, (match) => `${match}<w:tcW w:w="${width}" w:type="dxa"/>`);
      }
      return cellXml.replace(/<w:tc\b([^>]*)>/, `<w:tc$1><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>`);
    });
  });
  return next;
}

function cellBordersXml(): string {
  return '<w:tcBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tcBorders>';
}

function ensureCellBorders(tableXml: string): string {
  const borderXml = cellBordersXml();
  return tableXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
    if (/<w:tcBorders\b[\s\S]*?<\/w:tcBorders>/.test(cellXml)) {
      return cellXml.replace(/<w:tcBorders\b[\s\S]*?<\/w:tcBorders>/, borderXml);
    }
    if (/<w:tcPr\b[^>]*>/.test(cellXml)) return cellXml.replace(/<\/w:tcPr>/, `${borderXml}</w:tcPr>`);
    return cellXml.replace(/<w:tc\b([^>]*)>/, `<w:tc$1><w:tcPr>${borderXml}</w:tcPr>`);
  });
}

function paragraphXml(
  value: string,
  options: { align?: 'left' | 'center' | 'right'; color?: string; size?: number } = {},
): string {
  const align = options.align ?? 'center';
  const color = options.color ? `<w:color w:val="${options.color}"/>` : '';
  const size = options.size ?? 20;
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${color}</w:rPr><w:t>${xmlEscape(value)}</w:t></w:r></w:p>`;
}

function cellXml(options: {
  width: number;
  gridSpan?: number;
  fill?: string;
  bodyXml: string;
  verticalAlign?: 'center' | 'top' | 'bottom';
}): string {
  const spanXml = options.gridSpan && options.gridSpan > 1 ? `<w:gridSpan w:val="${options.gridSpan}"/>` : '';
  const fillXml = options.fill ? `<w:shd w:fill="${options.fill}" w:val="clear"/>` : '';
  const vAlign = options.verticalAlign ?? 'center';
  return `<w:tc><w:tcPr><w:tcW w:w="${options.width}" w:type="dxa"/>${spanXml}${fillXml}<w:vAlign w:val="${vAlign}"/>${cellBordersXml()}</w:tcPr>${options.bodyXml}</w:tc>`;
}

function setParagraphJustification(xml: string, value: 'left' | 'center' | 'right'): string {
  return xml.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (paragraph) => {
    if (/<w:pPr\b[^>]*>/.test(paragraph)) {
      if (/<w:jc\b[^>]*\/>/.test(paragraph)) return paragraph.replace(/<w:jc\b[^>]*\/>/g, `<w:jc w:val="${value}"/>`);
      return paragraph.replace(/<w:pPr\b([^>]*)>/, `<w:pPr$1><w:jc w:val="${value}"/>`);
    }
    return paragraph.replace(/<w:p\b([^>]*)>/, `<w:p$1><w:pPr><w:jc w:val="${value}"/></w:pPr>`);
  });
}

function catalogueRowXml(cellsXml: string, height?: number): string {
  const heightXml = height ? `<w:trPr><w:trHeight w:val="${height}" w:hRule="exact"/></w:trPr>` : '';
  return `<w:tr>${heightXml}${cellsXml}</w:tr>`;
}

function applyCatalogueDetailAlignment(tableXml: string): string {
  return tableXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (rowXml) => {
    const rowText = [...rowXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(' ');
    const isHeaderRow = rowText.includes('STT') && rowText.includes('Hình ảnh') && rowText.includes('Mô tả chi tiết');
    let columnIndex = 0;
    return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cell) => {
      const span = Number(cell.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/)?.[1] || '1');
      const startColumn = columnIndex;
      columnIndex += span;
      if (isHeaderRow) return setParagraphJustification(cell, 'center');
      if (span >= 10) return setParagraphJustification(cell, 'left');
      if (startColumn === 2) return setParagraphJustification(cell, 'left');
      if (startColumn >= 7) return setParagraphJustification(cell, 'right');
      return setParagraphJustification(cell, 'center');
    });
  });
}

function extractFirstCellBody(tableXml: string): string | null {
  const firstCell = tableXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/)?.[0];
  if (!firstCell) return null;
  const body = firstCell
    .replace(/^<w:tc\b[^>]*>/, '')
    .replace(/<\/w:tc>$/, '')
    .replace(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/, '');
  return body.trim() || null;
}

function buildCatalogueHeaderTable(logoBodyXml: string | null): string {
  const widths = scaleWidthsToTarget(CATALOGUE_TABLE_WIDTHS, CATALOGUE_TEMPLATE_TABLE_WIDTH);
  const logoWidth = widths.slice(0, 2).reduce((total, width) => total + width, 0);
  const companyWidth = widths.slice(2).reduce((total, width) => total + width, 0);
  const logoBody = logoBodyXml ?? paragraphXml('OWIN');
  const gridXml = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  return [
    `<w:tbl><w:tblPr><w:tblW w:w="${CATALOGUE_TEMPLATE_TABLE_WIDTH}" w:type="dxa"/><w:jc w:val="left"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${gridXml}</w:tblGrid>`,
    catalogueRowXml(
      cellXml({ width: logoWidth, gridSpan: 2, bodyXml: logoBody })
        + cellXml({ width: companyWidth, gridSpan: 8, bodyXml: paragraphXml('HOÀNG ANH OWIN') }),
      1320,
    ),
    catalogueRowXml(
      cellXml({ width: CATALOGUE_TEMPLATE_TABLE_WIDTH, gridSpan: 10, fill: '4B6078', bodyXml: paragraphXml(CATALOGUE_TITLE, { color: 'FFFFFF' }) }),
      560,
    ),
    '</w:tbl>',
  ].join('');
}

function replaceCatalogueHeaderTables(documentXml: string): string {
  const tables = [...documentXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)];
  if (tables.length < 2) return documentXml;
  const firstTable = tables[0][0];
  const secondTable = tables[1][0];
  if (!firstTable.includes('HOÀNG ANH OWIN') || !secondTable.includes('BẢNG GIÁ')) return documentXml;
  const replacement = buildCatalogueHeaderTable(extractFirstCellBody(firstTable));
  const start = tables[0].index ?? 0;
  const end = (tables[1].index ?? start) + secondTable.length;
  return documentXml.slice(0, start) + replacement + documentXml.slice(end);
}

function removeEmptyParagraphsBetweenTables(documentXml: string): string {
  return documentXml.replace(
    /<\/w:tbl>((?:<w:p\b[\s\S]*?<\/w:p>)+)(?=<w:tbl\b)/g,
    (match, paragraphs: string) => /<w:t\b[^>]*>[\s\S]*?\S[\s\S]*?<\/w:t>/.test(paragraphs) ? match : '</w:tbl>',
  );
}

function normalizeCatalogueLayout(documentXml: string): string {
  let tableIndex = 0;
  let next = documentXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    const targetWidth = tableIndex === 0 ? CATALOGUE_HEADER_TABLE_WIDTH : CATALOGUE_TEMPLATE_TABLE_WIDTH;
    const fixedWidths = scaleWidthsToTarget(CATALOGUE_TABLE_WIDTHS, CATALOGUE_TEMPLATE_TABLE_WIDTH);
    tableIndex += 1;
    let normalized = removeTableIndent(tableXml);
    normalized = setTableJustification(normalized, 'center');
    normalized = setTableColumnWidths(normalized, fixedWidths);
    normalized = setTableWidth(normalized, targetWidth);
    normalized = ensureFixedTableLayout(normalized);
    if (tableIndex > 1) normalized = applyCatalogueDetailAlignment(normalized);
    return ensureCellBorders(normalized);
  });
  next = removeEmptyParagraphsBetweenTables(next);
  return next;
}

export async function renderQuoteDocumentXml(zip: PizZip, quote: CalculatedQuote): Promise<string> {
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Template báo giá không có word/document.xml.');

  let documentXml = repairSplitEmailToken(documentFile.asText());
  // Drop blank phone/email paragraphs before token fill (REFERENCE order).
  documentXml = removeBlankQuoteContactLines(documentXml, quote);
  documentXml = replaceTokens(documentXml, buildQuoteWordData(quote));

  const templates = findQuoteTemplateRows(documentXml);
  const blockStart = Math.min(...templates.matches.map((match) => match.index));
  const blockEnd = Math.max(...templates.matches.map((match) => match.end));
  const embedImage = createImageEmbedder(zip);
  const rows: string[] = [];
  let previousGroup = '';

  for (const [itemIndex, item] of quote.items.entries()) {
    const groupName = item.groupName || item.category || '';
    if (templates.group && groupName && groupName !== previousGroup) {
      rows.push(ensureCantSplit(ensureBoldFontRuns(renderQuoteGroupRow(templates.group.row, groupName))));
      previousGroup = groupName;
    }

    const dataRows = buildQuoteItemDocRows(item, itemIndex);
    if (dataRows.length === 0) continue;

    // Image once per item block — fill 95% of the image column width, and up to ~95% of
    // the content-driven cell height (so it grows with the block instead of leaving a gap,
    // yet never stretches a sparse block). Height auto-varies per item/category.
    const blockHeightEmu = estimateQuoteBlockHeightEmu(dataRows);
    const imageMaxCy = Math.min(
      QUOTE_IMG_PAGE_SAFE_MAX_CY,
      Math.max(Math.round(QUOTE_IMG_MAX_CX * 0.9), Math.round(blockHeightEmu * 0.95)),
    );
    const imageXml = await embedImage(item.image || item.coverImagePath, {
      maxCx: QUOTE_IMG_MAX_CX,
      maxCy: imageMaxCy,
      geometry: 'roundRect',
      fallbackLogo: true,
    });

    const productRowCount = dataRows.filter((row) => row.kind === 'product').length;
    const itemXmlRows = dataRows.map((row, rowIndex) => {
      const drawing = row.showImage ? imageXml : null;
      let xml = renderQuoteUnifiedProductRow(templates.product.row, row, drawing);
      xml = ensureBoldFontRuns(xml);
      if (dataRows.length > 1) {
        xml = applyQuoteIdentityMerge(xml, rowIndex === 0 ? 'restart' : 'continue');
      }
      // Gộp cột mô tả qua các dòng kích thước (dòng tính) của cùng 1 sản phẩm.
      if (productRowCount > 1 && row.kind === 'product') {
        xml = applyQuoteDescriptionMerge(xml, rowIndex === 0 ? 'restart' : 'continue');
      }
      xml = ensureCantSplit(xml);
      if (rowIndex < dataRows.length - 1) xml = addKeepNextToAllParagraphsInRow(xml);
      return xml;
    });

    rows.push(...itemXmlRows);
  }

  documentXml = documentXml.slice(0, blockStart) + rows.join('') + documentXml.slice(blockEnd);
  // Strip any leftover marker tokens (including empty pk_ten "x" shells).
  documentXml = removeLeftoverTokens(documentXml)
    .replace(/\s+x\s*(?=<\/w:t>)/gi, '')
    .replace(/>\s*x\s*</g, '><');
  return documentXml;
}

export function buildQuoteWordData(quote: CalculatedQuote): Record<string, string> {
  const d = dateParts(quote.quoteDate);
  return {
    '{ten_kh}': quote.customerName,
    '{dia_chi}': quote.customerAddress,
    '{sdt}': quote.customerPhone,
    '{email}': quote.customerEmail || '',
    '{ngay}': d.ngay,
    '{thang}': d.thang,
    '{nam}': d.nam,
    '{tong_tien}': formatSoVND(quote.summary.totalVnd),
    '{lam_tron}': formatSoVND(quote.summary.roundedTotalVnd),
    '{tam_ung}': formatSoVND(quote.summary.depositVnd),
    '{can_thanh_toan}': formatSoVND(quote.summary.balanceVnd),
  };
}

export async function exportQuoteWord(quote: CalculatedQuote, quoteCode: string): Promise<string> {
  const zip = await fetchTemplateZip(tplBaoGiaUrl);
  const documentXml = await renderQuoteDocumentXml(zip, quote);
  zip.file('word/document.xml', documentXml);
  const fileName = `Bao_gia_${quoteCode}.docx`;
  downloadBlob(generateDocxBlob(zip), fileName);
  return fileName;
}

function findCatalogueTemplateRows(documentXml: string) {
  const rows = rowMatches(documentXml);
  const category = rows.find((entry) => entry.row.includes('{category}'));
  const product = rows.find((entry) => entry.row.includes('{product_info_block}'));
  const accessory = rows.find((entry) => entry.row.includes('{accessory_block}'));
  if (!category || !product || !accessory) {
    throw new Error('Template bảng giá thiếu row placeholder {category}/{product_info_block}/{accessory_block}.');
  }
  return { category, product, accessory };
}

function renderCatalogueCategoryRow(template: string, row: CatalogueBlockRow): string {
  return ensureBoldFontRuns(
    removeLeftoverTokens(replaceMultilineToken(template, '{category}', row.categoryName || row.description)),
  );
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return formatSoVND(value);
}

function renderCatalogueProductRow(template: string, row: CatalogueBlockRow, imageXml: string | null): string {
  let xml = template;
  xml = replaceToken(xml, '{stt}', row.stt);
  xml = fillImageToken(xml, '{image}', imageXml);
  xml = replaceMultilineToken(xml, '{product_info_block}', row.description);
  xml = replaceToken(xml, '{dv}', row.unit);
  xml = replaceToken(xml, '{rong}', row.width);
  xml = replaceToken(xml, '{cao}', row.height);
  xml = replaceToken(xml, '{kl}', row.weight);
  xml = replaceToken(xml, '{don_gia}', money(row.unitPriceVnd));
  xml = replaceToken(xml, '{thanh_tien}', money(row.amountVnd));
  xml = replaceToken(xml, '{tong_tien}', money(row.completedTotalVnd));
  return applyCatalogueVerticalMerges(removeLeftoverTokens(xml), 'restart');
}

function renderCatalogueAccessoryRow(template: string, row: CatalogueBlockRow): string {
  let xml = template;
  xml = replaceMultilineToken(xml, '{accessory_block}', row.description);
  xml = replaceToken(xml, '{pk_dv}', row.unit);
  xml = replaceToken(xml, '{pk_kl}', row.weight);
  xml = replaceToken(xml, '{pk_don_gia}', money(row.unitPriceVnd));
  xml = replaceToken(xml, '{pk_thanh_tien}', money(row.amountVnd));
  return ensureBoldFontRuns(applyCatalogueVerticalMerges(removeLeftoverTokens(xml), 'continue'));
}

const CATALOGUE_FONT_SIZE_PT = 10;
const CATALOGUE_LINE_TWIPS = 264; // Word renders the bold 10pt rows at ~13.2pt line pitch
const CATALOGUE_CONTENT_VERTICAL_PADDING_TWIPS = 113;
const CATALOGUE_ESTIMATED_EXTRA_ROW_HEIGHT_TWIPS = 451;
const CATALOGUE_DESCRIPTION_WIDTH_DXA = Math.max(
  1,
  CATALOGUE_COLUMN_WIDTHS_DXA[2] - 2 * CATALOGUE_DESCRIPTION_CELL_MARGIN_DXA,
);
const CATALOGUE_IMG_PAGE_SAFE_CY = Math.round(150 * MM_TO_EMU);

function catalogueCharacterWidthEm(character: string): number {
  if (/\s/u.test(character)) return 0.27;
  if ("ilIjtfr1.,:;|'!()[]".includes(character)) return 0.3;
  if (/[mwMW@%&]/u.test(character)) return 0.88;
  if (/\p{Lu}/u.test(character)) return 0.66;
  if (/\d/u.test(character)) return 0.53;
  return 0.51;
}

function catalogueTextWidthEm(text: string): number {
  return [...text].reduce((width, character) => width + catalogueCharacterWidthEm(character), 0);
}

function catalogueWrappedLineCount(text: string): number {
  const words = String(text || '').trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return 1;

  const maxWidthEm = CATALOGUE_DESCRIPTION_WIDTH_DXA / (CATALOGUE_FONT_SIZE_PT * 20);
  const spaceWidthEm = catalogueCharacterWidthEm(' ');
  let lineCount = 1;
  let currentWidthEm = 0;

  for (const word of words) {
    let wordWidthEm = catalogueTextWidthEm(word);
    if (currentWidthEm > 0 && currentWidthEm + spaceWidthEm + wordWidthEm <= maxWidthEm) {
      currentWidthEm += spaceWidthEm + wordWidthEm;
      continue;
    }
    if (currentWidthEm > 0) {
      lineCount += 1;
      currentWidthEm = 0;
    }
    while (wordWidthEm > maxWidthEm) {
      lineCount += 1;
      wordWidthEm -= maxWidthEm;
    }
    currentWidthEm = wordWidthEm;
  }
  return lineCount;
}

function catalogueRowHeightTwips(row: CatalogueBlockRow): number {
  const descriptionLines = row.descriptionLines?.length > 0
    ? row.descriptionLines
    : String(row.description || '').split(/\r?\n/u);
  const wrappedLineCount = descriptionLines.reduce(
    (total, line) => total + catalogueWrappedLineCount(line),
    0,
  );
  const contentHeight = Math.max(1, wrappedLineCount) * CATALOGUE_LINE_TWIPS
    + CATALOGUE_CONTENT_VERTICAL_PADDING_TWIPS;
  const minHeight = row.rowType === 'extraAccessory'
    ? CATALOGUE_ESTIMATED_EXTRA_ROW_HEIGHT_TWIPS
    : CATALOGUE_PRODUCT_ROW_HEIGHT_TWIPS;
  return Math.max(minHeight, contentHeight);
}

type CatalogueContentLayout = {
  rowHeightsTwips: number[];
  productBlockHeightsTwips: Map<number, number>;
};

/**
 * Resolve every content row before sizing any image. These are the natural rendered heights
 * (including Word line pitch/cell spacing), while the rows themselves retain the template's
 * lower atLeast constraints so Word does not add that spacing twice.
 */
function buildCatalogueContentLayout(rows: CatalogueBlockRow[]): CatalogueContentLayout {
  const rowHeightsTwips = rows.map((row) => row.rowType === 'category' ? 0 : catalogueRowHeightTwips(row));
  const productBlockHeightsTwips = new Map<number, number>();

  for (let productIndex = 0; productIndex < rows.length; productIndex += 1) {
    if (rows[productIndex].rowType !== 'product') continue;
    let blockHeightTwips = 0;
    for (let rowIndex = productIndex; rowIndex < rows.length; rowIndex += 1) {
      if (rowIndex > productIndex && (rows[rowIndex].rowType === 'product' || rows[rowIndex].rowType === 'category')) {
        break;
      }
      blockHeightTwips += rowHeightsTwips[rowIndex];
    }
    productBlockHeightsTwips.set(productIndex, blockHeightTwips);
  }

  return { rowHeightsTwips, productBlockHeightsTwips };
}

function catalogueImageMaxCy(blockHeightTwips: number): number {
  const contentHeightTwips = Math.max(
    1,
    blockHeightTwips - 2 * CATALOGUE_IMAGE_CELL_VERTICAL_MARGIN_DXA,
  );
  return Math.min(
    CATALOGUE_IMG_PAGE_SAFE_CY,
    Math.max(1, Math.round(contentHeightTwips * DXA_TO_EMU * CATALOGUE_IMG_FILL)),
  );
}

export async function renderBangGiaDocumentXml(zip: PizZip, products: ProductRecord[]): Promise<string> {
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Template bảng giá không có word/document.xml.');

  let documentXml = documentFile.asText();
  const templates = findCatalogueTemplateRows(documentXml);
  const blockStart = Math.min(templates.category.index, templates.product.index, templates.accessory.index);
  const blockEnd = Math.max(templates.category.end, templates.product.end, templates.accessory.end);
  const rows = buildCatalogueBlockRows(products);
  const contentLayout = buildCatalogueContentLayout(rows);
  const embedImage = createImageEmbedder(zip);
  const imageCache = new Map<string, string | null>();
  // Block model matched to REAL REF export (exportCatalogueV8ToDocx):
  // - category = its own cantSplit block
  // - product + accessories = one keepNext block (image not orphaned from accessories)
  const blocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.rowType === 'category') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push([ensureCantSplit(renderCatalogueCategoryRow(templates.category.row, row))]);
    } else if (row.rowType === 'product') {
      if (currentBlock) blocks.push(currentBlock);
      // Content pass is complete at this point. Fit the photo into 95% of the final merged
      // image cell; contain-fit stops as soon as either the horizontal or vertical axis hits.
      const imageMaxCy = catalogueImageMaxCy(contentLayout.productBlockHeightsTwips.get(i) || 1);
      // Cache per image + height bucket so the same photo isn't re-embedded needlessly.
      const imageKey = `${row.imagePath || `__logo__${row.productCode}`}::${imageMaxCy}`;
      let imageXml = imageCache.get(imageKey);
      if (!imageCache.has(imageKey)) {
        imageXml = await embedImage(row.imagePath || 'owin-user-assets/logo/logo.webp', {
          maxCx: CATALOGUE_IMG_MAX_CX,
          maxCy: imageMaxCy,
          geometry: 'rect',
          fallbackLogo: true,
        });
        imageCache.set(imageKey, imageXml);
      }
      let productRow = ensureCantSplit(
        ensureBoldFontRuns(renderCatalogueProductRow(templates.product.row, row, imageXml || null)),
      );
      productRow = setMinRowHeight(productRow, CATALOGUE_PRODUCT_ROW_HEIGHT_TWIPS);
      currentBlock = [productRow];
    } else {
      if (!currentBlock) currentBlock = [];
      const accessoryRow = renderCatalogueAccessoryRow(templates.accessory.row, row);
      currentBlock.push(
        ensureCantSplit(
          setMinRowHeight(
            accessoryRow,
            row.rowType === 'extraAccessory'
              ? CATALOGUE_EXTRA_ROW_HEIGHT_TWIPS
              : CATALOGUE_PRODUCT_ROW_HEIGHT_TWIPS,
          ),
        ),
      );
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  const renderedRows = blocks.flatMap((block) =>
    block.map((rowXml, rowIndex) =>
      rowIndex < block.length - 1 ? addKeepNextToAllParagraphsInRow(rowXml) : rowXml,
    ),
  );

  documentXml = documentXml.slice(0, blockStart) + renderedRows.join('') + documentXml.slice(blockEnd);
  documentXml = ensureAllTablesBold(removeLeftoverTokens(documentXml));
  documentXml = replaceCatalogueHeaderTables(documentXml);
  documentXml = normalizeCatalogueLayout(documentXml);
  // Header (logo · tiêu đề · dòng cột) chỉ hiện 1 lần ở đầu — bỏ lặp lại mỗi trang.
  // Ranh giới các trang sau do "hàng nhóm" (I. CỬA CHÍNH…) đảm nhận.
  documentXml = documentXml.replace(/<w:tblHeader\b[^>]*\/>/g, '');
  return ensureBoldFontRuns(documentXml);
}

export async function buildBangGiaWordData(products: ProductRecord[]) {
  return {
    rows: buildCatalogueBlockRows(products),
    totalVnd: buildCatalogueBlockRows(products)
      .filter((row) => row.rowType === 'product')
      .reduce((sum, row) => sum + (row.completedTotalVnd || 0), 0),
  };
}

export async function exportBangGiaWord(products: ProductRecord[]): Promise<string> {
  const zip = await fetchTemplateZip(tplBangGiaUrl);
  const documentXml = await renderBangGiaDocumentXml(zip, products);
  zip.file('word/document.xml', documentXml);
  const fileName = `Bang_gia_OWIN_${new Date().toISOString().slice(0, 10)}.docx`;
  downloadBlob(generateDocxBlob(zip), fileName);
  return fileName;
}

function legacyQuoteToCalculated(customer: Customer, lines: QuoteLine[], tamUng = 0): CalculatedQuote {
  const items = lines.map((line, index) => {
    const calc = tinhDong(line);
    const unit: ProductUnit = line.dvt === 'Bộ' ? 'BO' : line.dvt === 'md' ? 'METER' : 'M2';
    const quantity =
      unit === 'M2'
        ? Number(((line.rong || 0) * (line.cao || 0) * line.sl).toFixed(3))
        : unit === 'METER'
          ? Number((((line.rong || 0) + (line.cao || 0)) * line.sl).toFixed(3))
          : line.sl;
    return {
      sourceType: 'CUSTOM' as const,
      productId: line.productId,
      productCode: line.ma,
      quoteItemCode: line.ma,
      itemName: line.ten,
      productName: line.ten,
      category: null,
      groupName: null,
      coverImagePath: line.imageId || null,
      image: line.imageId || null,
      unit,
      description: line.moTa || null,
      unitPriceVnd: line.donGia,
      specs: [],
      dimensions: [{
        unit,
        widthM: line.rong ?? null,
        heightM: line.cao ?? null,
        quantity: line.sl,
        calculatedQty: quantity,
        unitPriceVnd: line.donGia,
        lineTotalVnd: calc.tienChinh,
        description: null,
      }],
      accessories: line.accessories.filter((item) => item.enabled).map((item) => ({
        enabled: true,
        isEnabled: true,
        name: item.ten,
        quantityPerSet: item.sl,
        totalSet: item.sl,
        unitPriceVnd: item.donGia,
        lineTotalVnd: item.sl * item.donGia,
        note: null,
      })),
      fixedAccessoryPackage: null,
      extraAccessories: null,
      productSubtotalVnd: calc.tienChinh,
      accessorySubtotalVnd: calc.tienPhuKien,
      itemTotalVnd: calc.tongDong,
      mainTotal: calc.tienChinh,
      accessoryTotal: calc.tienPhuKien,
      itemTotal: calc.tongDong,
      sortOrder: index + 1,
      numericId: null,
    };
  });
  const totalVnd = tinhTongBaoGia(lines);
  const roundedTotalVnd = tinhTongLamTron(lines);
  return {
    customerId: null,
    customerName: customer.ten,
    customerPhone: customer.sdt,
    customerEmail: customer.email,
    customerAddress: customer.diaChi,
    quoteDate: new Date(),
    depositVnd: tamUng,
    items,
    summary: {
      subtotalProductVnd: items.reduce((sum, item) => sum + item.productSubtotalVnd, 0),
      subtotalAccessoryVnd: items.reduce((sum, item) => sum + item.accessorySubtotalVnd, 0),
      totalVnd,
      roundedTotalVnd,
      depositVnd: tamUng,
      balanceVnd: Math.max(0, roundedTotalVnd - tamUng),
    },
  };
}

/** Legacy compatibility export kept for old callers. */
export async function exportFormat1(customer: Customer, lines: QuoteLine[], tamUng = 0): Promise<void> {
  await exportQuoteWord(legacyQuoteToCalculated(customer, lines, tamUng), `OWIN-${Date.now()}`);
}

/** Legacy compatibility export kept for old callers. */
export async function exportFormat2(customer: Customer, lines: QuoteLine[], _imageMap: Record<string, string>, tamUng = 0): Promise<void> {
  await exportQuoteWord(legacyQuoteToCalculated(customer, lines, tamUng), `OWIN-${Date.now()}`);
}
