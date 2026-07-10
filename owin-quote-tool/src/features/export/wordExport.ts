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
const PX_TO_EMU = 9525;

type XmlRowMatch = { row: string; index: number; end: number };
type ImageEmbedder = (path: string | null | undefined, options?: { widthPx?: number; heightPx?: number }) => Promise<string | null>;

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

async function fitImageDataUrlToBox(
  dataUrl: string,
  maxWidthPx: number,
  maxHeightPx: number,
): Promise<{ widthPx: number; heightPx: number }> {
  if (typeof Image === 'undefined') return { widthPx: maxWidthPx, heightPx: maxHeightPx };
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || maxWidthPx;
      const height = image.naturalHeight || maxHeightPx;
      const scale = Math.min(maxWidthPx / width, maxHeightPx / height, 1);
      resolve({
        widthPx: Math.max(1, Math.round(width * scale)),
        heightPx: Math.max(1, Math.round(height * scale)),
      });
    };
    image.onerror = () => resolve({ widthPx: maxWidthPx, heightPx: maxHeightPx });
    image.src = dataUrl;
  });
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
    const dataUrl = await getImageDataUrlByPath(path);
    if (!dataUrl) return null;
    const { ext, contentType } = imageInfoFromDataUrl(dataUrl);
    const imageName = `owin-browser-${nextImageId++}.${ext}`;
    const relId = `rId${nextRelId++}`;
    const docPrId = nextDocPrId++;
    const fitted = await fitImageDataUrlToBox(dataUrl, options.widthPx ?? 112, options.heightPx ?? 82);
    const widthPx = fitted.widthPx;
    const heightPx = fitted.heightPx;
    const cx = Math.round(widthPx * PX_TO_EMU);
    const cy = Math.round(heightPx * PX_TO_EMU);

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
      `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 8000"/></a:avLst></a:prstGeom>` +
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
  let next = cellXml.replace(propertyPattern, '');
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

function quoteDescription(item: CalculatedQuote['items'][number], lineDescription?: string | null): string {
  return [
    item.itemName,
    lineDescription,
    ...(item.specs || []).filter((spec) => spec.value).map((spec) => `- ${spec.key}: ${spec.value}`),
  ].filter(Boolean).join('\n');
}

function findQuoteTemplateRows(documentXml: string) {
  const rows = rowMatches(documentXml);
  const group = rows.find((entry) => entry.row.includes('{nhom}'));
  const product = rows.find((entry) => entry.row.includes('{stt}') && entry.row.includes('{ma_sp}'));
  const fixedSet = rows.find((entry) => entry.row.includes('{bo_pk_ten}'));
  const fixedItem = rows.find((entry) => entry.row.includes('{pk_ten}'));
  const extra = rows.find((entry) => entry.row.includes('{ps_ten}'));
  const matches = [group, product, fixedSet, fixedItem, extra].filter((entry): entry is XmlRowMatch => Boolean(entry));
  if (!product || matches.length === 0) throw new Error('Template báo giá thiếu dòng placeholder sản phẩm.');
  return { group, product, fixedSet, fixedItem, extra, matches };
}

function renderQuoteGroupRow(template: string, groupName: string): string {
  return removeLeftoverTokens(replaceToken(template, '{nhom}', groupName));
}

function renderQuoteProductRow(
  template: string,
  item: CalculatedQuote['items'][number],
  line: CalculatedQuote['items'][number]['dimensions'][number],
  rowMeta: { stt: string; code: string; drawingXml: string | null; includeDescription: boolean },
): string {
  let xml = template;
  xml = replaceToken(xml, '{stt}', rowMeta.stt);
  xml = replaceToken(xml, '{ma_sp}', rowMeta.code);
  xml = fillImageToken(xml, '{anh_sp}', rowMeta.drawingXml);
  xml = replaceMultilineToken(xml, '{mo_ta}', rowMeta.includeDescription ? quoteDescription(item, line.description) : '');
  xml = replaceToken(xml, '{dv}', unitLabel(line.unit));
  xml = replaceToken(xml, '{rong}', line.unit === 'BO' ? '' : formatDecimal(line.widthM));
  xml = replaceToken(xml, '{cao}', line.unit === 'BO' ? '' : formatDecimal(line.heightM));
  xml = replaceToken(xml, '{sl}', formatDecimal(line.quantity));
  xml = replaceToken(xml, '{kl}', formatDecimal(line.calculatedQty));
  xml = replaceToken(xml, '{dg}', formatSoVND(line.unitPriceVnd));
  xml = replaceToken(xml, '{tt}', formatSoVND(line.lineTotalVnd));
  return removeLeftoverTokens(xml);
}

function quoteFixedItemLines(fixed: Record<string, unknown>): string[] {
  const items = Array.isArray(fixed.items) ? fixed.items : [];
  return items
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const name = String(entry.name || '').trim();
      if (!name) return '';
      const quantity = Number(entry.quantity ?? 0);
      return quantity > 1 ? `- ${name} x${formatDecimal(quantity)}` : `- ${name}`;
    })
    .filter(Boolean);
}

function renderQuoteFixedSetRow(template: string, fixed: Record<string, unknown>): string {
  const quantity = Number(fixed.packageQuantity ?? fixed.quantity ?? 1) || 1;
  const unitPrice = Number(fixed.unitPrice ?? fixed.unitPriceVnd ?? 0) || 0;
  const itemLines = quoteFixedItemLines(fixed);
  const description = [
    `${String(fixed.name || 'Bộ phụ kiện đi kèm').trim()}${itemLines.length ? ':' : ''}`,
    ...itemLines,
  ].join('\n');
  let xml = template;
  xml = replaceMultilineToken(xml, '{bo_pk_ten}', description);
  xml = replaceToken(xml, '{bo_pk_dv}', 'Bộ');
  xml = replaceToken(xml, '{bo_pk_sl}', formatDecimal(quantity));
  xml = replaceToken(xml, '{bo_pk_dg}', formatSoVND(unitPrice));
  xml = replaceToken(xml, '{bo_pk_tt}', formatSoVND(quantity * unitPrice));
  return removeLeftoverTokens(xml);
}

function renderQuoteExtraRow(template: string, extra: Record<string, unknown>): string {
  const unit = normalizeUnit(extra.unit);
  const quantity = Number(extra.quantity ?? extra.quantityPerSet ?? 1) || 1;
  const weight = unit === 'BO' ? quantity : Number(extra.weight ?? extra.kl ?? 0) || 0;
  const unitPrice = Number(extra.unitPrice ?? extra.unitPriceVnd ?? 0) || 0;
  let xml = template;
  xml = replaceToken(xml, '{ps_ten}', String(extra.name || 'Phụ kiện phát sinh').trim());
  xml = replaceToken(xml, '{ps_dv}', unitLabel(unit));
  xml = replaceToken(xml, '{ps_sl}', formatDecimal(unit === 'BO' ? quantity : weight));
  xml = replaceToken(xml, '{ps_dg}', formatSoVND(unitPrice));
  xml = replaceToken(xml, '{ps_tt}', formatSoVND((unit === 'BO' ? quantity : weight) * unitPrice));
  return removeLeftoverTokens(xml);
}

function renderLegacyAccessoryAsFixed(template: string, accessory: CalculatedQuote['items'][number]['accessories'][number]): string {
  const noteItems = String(accessory.note || '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, quantity: 0 }));
  return renderQuoteFixedSetRow(template, {
    name: accessory.name,
    items: noteItems,
    packageQuantity: accessory.totalSet || accessory.quantityPerSet,
    unitPrice: accessory.unitPriceVnd,
  });
}

export async function renderQuoteDocumentXml(zip: PizZip, quote: CalculatedQuote): Promise<string> {
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Template báo giá không có word/document.xml.');

  let documentXml = repairSplitEmailToken(documentFile.asText());
  const templates = findQuoteTemplateRows(documentXml);
  const blockStart = Math.min(...templates.matches.map((match) => match.index));
  const blockEnd = Math.max(...templates.matches.map((match) => match.end));
  const embedImage = createImageEmbedder(zip);
  const rows: string[] = [];
  let previousGroup = '';

  for (const [itemIndex, item] of quote.items.entries()) {
    const groupName = item.groupName || item.category || '';
    if (templates.group && groupName && groupName !== previousGroup) {
      rows.push(renderQuoteGroupRow(templates.group.row, groupName));
      previousGroup = groupName;
    }

    const itemRows: string[] = [];
    const imageXml = await embedImage(item.image || item.coverImagePath, { widthPx: 190, heightPx: 160 });
    item.dimensions.forEach((line, lineIndex) => {
      itemRows.push(renderQuoteProductRow(templates.product.row, item, line, {
        stt: lineIndex === 0 ? String(itemIndex + 1) : '',
        code: lineIndex === 0 ? item.quoteItemCode || item.productCode : '',
        drawingXml: lineIndex === 0 ? imageXml : null,
        includeDescription: lineIndex === 0,
      }));
    });

    const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
    if (fixed && templates.fixedSet) {
      itemRows.push(renderQuoteFixedSetRow(templates.fixedSet.row, fixed));
    } else if (templates.fixedSet) {
      item.accessories
        .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
        .forEach((accessory) => itemRows.push(renderLegacyAccessoryAsFixed(templates.fixedSet!.row, accessory)));
    }

    const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
    if (templates.extra && Array.isArray(extras)) {
      extras
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => String(entry.name || '').trim())
        .forEach((entry) => itemRows.push(renderQuoteExtraRow(templates.extra!.row, entry)));
    }

    rows.push(...itemRows.map((rowXml, rowIndex) => {
      if (itemRows.length <= 1) return rowXml;
      return applyQuoteIdentityMerge(rowXml, rowIndex === 0 ? 'restart' : 'continue');
    }));
  }

  documentXml = documentXml.slice(0, blockStart) + rows.join('') + documentXml.slice(blockEnd);
  documentXml = removeBlankQuoteContactLines(documentXml, quote);
  documentXml = replaceTokens(documentXml, buildQuoteWordData(quote));
  return removeLeftoverTokens(documentXml);
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
  return removeLeftoverTokens(replaceMultilineToken(template, '{category}', row.categoryName || row.description));
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
  return applyCatalogueVerticalMerges(removeLeftoverTokens(xml), 'continue');
}

export async function renderBangGiaDocumentXml(zip: PizZip, products: ProductRecord[]): Promise<string> {
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Template bảng giá không có word/document.xml.');

  let documentXml = documentFile.asText();
  const templates = findCatalogueTemplateRows(documentXml);
  const blockStart = Math.min(templates.category.index, templates.product.index, templates.accessory.index);
  const blockEnd = Math.max(templates.category.end, templates.product.end, templates.accessory.end);
  const rows = buildCatalogueBlockRows(products);
  const embedImage = createImageEmbedder(zip);
  const imageCache = new Map<string, string | null>();
  const blocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const row of rows) {
    if (row.rowType === 'category') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push([ensureCantSplit(renderCatalogueCategoryRow(templates.category.row, row))]);
    } else if (row.rowType === 'product') {
      if (currentBlock) blocks.push(currentBlock);
      let imageXml = imageCache.get(row.imagePath);
      if (!imageCache.has(row.imagePath)) {
        imageXml = await embedImage(row.imagePath, { widthPx: 190, heightPx: 270 });
        imageCache.set(row.imagePath, imageXml);
      }
      currentBlock = [ensureCantSplit(renderCatalogueProductRow(templates.product.row, row, imageXml || null))];
    } else {
      if (!currentBlock) currentBlock = [];
      const accessoryRow = renderCatalogueAccessoryRow(templates.accessory.row, row);
      currentBlock.push(ensureCantSplit(row.rowType === 'extraAccessory' ? setMinRowHeight(accessoryRow, 340) : accessoryRow));
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  const renderedRows = blocks.flatMap((block) =>
    block.map((rowXml, rowIndex) =>
      rowIndex < block.length - 1 ? addKeepNextToAllParagraphsInRow(rowXml) : rowXml,
    ),
  );

  documentXml = documentXml.slice(0, blockStart) + renderedRows.join('') + documentXml.slice(blockEnd);
  return removeLeftoverTokens(documentXml);
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
