/**
 * Client-side import of OWIN quote Word (.docx) files.
 * Port of scripts/import_quotes.py — parse tables → QuoteItemInput[] + customer meta.
 */
import PizZip from 'pizzip';
import type {
  AccessoryInput,
  DimensionInput,
  ProductUnit,
  QuoteExtraAccessory,
  QuoteItemInput,
} from '@/types/models';
import { createCustomQuoteItem } from '@/lib/quote/productToQuoteItem';

export interface ImportedQuoteDraft {
  customerName: string;
  customerAddress: string;
  quoteDate: string;
  items: QuoteItemInput[];
  suggestedCode: string;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function joinCellText(tcXml: string): string {
  let txt = '';
  const tokens = tcXml.split(/(<w:br\s*\/>|<\/w:p>\s*<w:p[^>]*>)/);
  for (const token of tokens) {
    if (/^<w:br/.test(token) || /^<\/w:p>/.test(token)) {
      txt += '\n';
      continue;
    }
    const parts = token.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    for (const part of parts) {
      const inner = part.replace(/<w:t(?: [^>]*)?>/, '').replace(/<\/w:t>/, '');
      txt += unescapeXml(inner);
    }
  }
  return txt;
}

function parseDim(value: string | undefined): number | null {
  let raw = String(value || '').trim();
  if (!raw) return null;
  // Door/window sizes are meters, almost always < 20:
  // - "2,4" / "2,40" → decimal comma
  // - "2.950" / "1.800" → decimal meters (NOT thousands)
  // - "1.234,5" (rare) → thousand dots + decimal comma
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(raw)) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',') && !raw.includes('.')) {
    raw = raw.replace(',', '.');
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Guard: a 2.95m opening must never become 2950m.
  if (n > 50) return Math.round((n / 1000) * 10_000) / 10_000;
  return Math.round(n * 10_000) / 10_000;
}

function parseMoney(value: string | undefined): number {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Split "Bộ PK X: - Món 1 - Món 2" into package title + item names. */
function parsePackageDescription(desc: string): { packageName: string; itemNames: string[] } {
  const cleaned = desc.replace(/\r/g, '').trim();
  const colon = cleaned.indexOf(':');
  const packageName = (colon >= 0 ? cleaned.slice(0, colon) : cleaned).trim();
  const rest = colon >= 0 ? cleaned.slice(colon + 1) : '';
  const itemNames = rest
    .split(/\n|•|·|;|(?:\s[-–—]\s)/)
    .map((part) => part.replace(/^[-–—•\s]+/, '').trim())
    .filter((part) => part && !/^phụ kiện$/i.test(part));
  return { packageName: packageName || 'Bộ phụ kiện đi kèm', itemNames };
}

function parseIntSafe(value: string | undefined): number {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function normalizeUnit(value: string | undefined, fallback: ProductUnit = 'M2'): ProductUnit {
  const unit = String(value || '')
    .trim()
    .toUpperCase()
    .replace('M²', 'M2')
    .replace('M2', 'M2');
  if (unit === 'BO' || unit === 'BỘ' || unit === 'BỘ'.normalize()) return 'BO';
  if (unit.includes('MD') || unit === 'M' || unit === 'METER') return 'METER';
  if (unit.includes('M2') || unit.includes('M²') || unit === 'M²') return 'M2';
  // Vietnamese labels
  const lower = String(value || '').toLowerCase();
  if (lower.includes('bộ') || lower === 'bo') return 'BO';
  if (lower.includes('md') || lower.includes('mét dài')) return 'METER';
  if (lower.includes('m2') || lower.includes('m²') || lower.includes('m²')) return 'M2';
  return fallback;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `imp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface ParsedProduct {
  code: string;
  name: string;
  unit: ProductUnit;
  unitPriceVnd: number;
  description: string;
  dimensions: DimensionInput[];
  accessories: AccessoryInput[];
  extra: QuoteExtraAccessory[];
}

function extractGrid(xml: string): string[][] {
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  return rows.map((row) => {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    return cells.map((cell) => joinCellText(cell).trim());
  });
}

/** Parse an OWIN quote .docx into a draft ready for the quote form / upsert. */
export async function importQuoteFromDocx(
  file: File | ArrayBuffer,
  options?: { code?: string },
): Promise<ImportedQuoteDraft> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const zip = new PizZip(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('File Word không hợp lệ (thiếu word/document.xml).');
  const xml = docEntry.asText();
  const grid = extractGrid(xml);

  let customerName = '';
  let address = '';
  let quoteDate = '';

  for (const row of grid.slice(0, 6)) {
    for (const cell of row) {
      const customerMatch = cell.match(/Tên khách hàng:\s*(.+)/i);
      if (customerMatch) customerName = customerMatch[1].split('\n')[0].trim();
      const addressMatch = cell.match(/Địa chỉ:\s*(.+)/i);
      if (addressMatch) address = addressMatch[1].split('\n')[0].trim();
      const dateMatch = cell.match(/ngày\s*(\d+).*?tháng\s*(\d+).*?năm\s*(\d+)/i);
      if (dateMatch) {
        const d = dateMatch[1];
        const mo = dateMatch[2];
        let y = dateMatch[3];
        if (y.length === 2) y = `20${y}`;
        const year = Number(y);
        const month = Number(mo);
        const day = Number(d);
        if (year && month && day) {
          quoteDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  const headerIndex = grid.findIndex((row) => row.some((cell) => cell.includes('Mô tả')));
  const body = grid.slice(headerIndex >= 0 ? headerIndex + 1 : 1);

  const products: ParsedProduct[] = [];

  for (const row of body) {
    if (row.length < 8) continue;
    const stt = (row[0] || '').trim();
    const code = (row[1] || '').trim();
    const desc = (row[3] || '').trim();
    const unitRaw = (row[4] || '').trim();
    const widthM = parseDim(row[5]);
    const heightM = parseDim(row[6]);
    const qty = parseIntSafe(row[7]);
    const weight = parseDim(row[8]);
    const price = parseMoney(row[9]);

    const isProduct = Boolean(stt && code);
    const low = desc.toLowerCase();
    const isAcc = low.includes('bộ phụ kiện') || low.includes('phụ kiện');
    const isPhao = low.startsWith('phào');

    if (isProduct) {
      const name =
        desc.split('\n')[0].split('- ')[0].trim() || desc.split('\n')[0].trim() || code;
      const unit = normalizeUnit(unitRaw, 'M2');
      const dimensions: DimensionInput[] =
        widthM || heightM
          ? [
              {
                unit,
                widthM,
                heightM,
                quantity: qty || 1,
                unitPriceVnd: price,
                description: null,
              },
            ]
          : [];
      products.push({
        code,
        name,
        unit,
        unitPriceVnd: price,
        description: desc,
        dimensions,
        accessories: [],
        extra: [],
      });
      continue;
    }

    if (products.length === 0) continue;
    const current = products[products.length - 1];

    if (isAcc) {
      const { packageName, itemNames } = parsePackageDescription(desc);
      if (itemNames.length > 0) {
        // Expand bullet list into individual package items (qty on package row is package count).
        for (const itemName of itemNames) {
          current.accessories.push({
            name: itemName,
            note: packageName,
            quantityPerSet: 0,
            unitPriceVnd: 0,
            isEnabled: true,
          });
        }
        // Keep package unit price on a synthetic first row marker via note + trailing price row.
        current.accessories.push({
          name: packageName,
          note: '__PACKAGE_PRICE__',
          quantityPerSet: qty || 1,
          unitPriceVnd: price,
          isEnabled: true,
        });
      } else {
        current.accessories.push({
          name: packageName,
          note: null,
          quantityPerSet: qty || 1,
          unitPriceVnd: price,
          isEnabled: true,
        });
      }
      continue;
    }

    if (isPhao) {
      const quantity = qty || weight || 1;
      const amount = Math.round(price * quantity);
      current.extra.push({
        id: newId(),
        name: desc.split('\n')[0].trim(),
        unit: normalizeUnit(unitRaw, 'BO'),
        quantity,
        weight: 0,
        unitPrice: price,
        amount,
        sortOrder: current.extra.length,
      });
      continue;
    }

    if (widthM || heightM) {
      current.dimensions.push({
        unit: normalizeUnit(unitRaw, current.unit),
        widthM,
        heightM,
        quantity: qty || 1,
        unitPriceVnd: price || current.unitPriceVnd,
        description: null,
      });
    }
  }

  if (products.length === 0) {
    throw new Error('Không tìm thấy hạng mục sản phẩm trong file Word. Kiểm tra đúng mẫu báo giá OWIN.');
  }

  const items: QuoteItemInput[] = products.map((product, index) => {
    const base = createCustomQuoteItem(product.code || `IMP-${index + 1}`);
    const priceMarker = product.accessories.find((acc) => acc.note === '__PACKAGE_PRICE__');
    const itemRows = product.accessories.filter((acc) => acc.note !== '__PACKAGE_PRICE__');
    const packageUnitPrice =
      priceMarker?.unitPriceVnd ||
      product.accessories.reduce((sum, acc) => sum + (acc.unitPriceVnd || 0), 0);
    const packageQuantity = Math.max(1, Number(priceMarker?.quantityPerSet || 1));
    const packageName =
      priceMarker?.name ||
      itemRows.find((acc) => /bộ/i.test(acc.name))?.name ||
      (itemRows.length > 0 ? 'Bộ phụ kiện đi kèm' : '');
    const packageItems = itemRows
      .filter((acc) => acc.name && acc.name !== packageName)
      .map((acc) => ({
        name: acc.name,
        quantity: Number(acc.quantityPerSet) || 0,
      }));
    const fixedFromAccessories =
      packageName || packageItems.length > 0 || packageUnitPrice > 0
        ? JSON.stringify({
            name: packageName || 'Bộ phụ kiện đi kèm',
            items: packageItems.length > 0
              ? packageItems
              : itemRows.map((acc) => ({ name: acc.name, quantity: Number(acc.quantityPerSet) || 0 })),
            packageQuantity,
            unit: 'BO',
            unitPrice: packageUnitPrice,
            unitPriceVnd: packageUnitPrice,
            total: packageQuantity * packageUnitPrice,
            totalVnd: packageQuantity * packageUnitPrice,
          })
        : null;

    return {
      ...base,
      sourceType: 'CUSTOM' as const,
      productCode: product.code,
      quoteItemCode: product.code,
      itemName: product.name,
      productName: product.name,
      unit: product.unit,
      unitPriceVnd: product.unitPriceVnd,
      description: product.description,
      dimensions:
        product.dimensions.length > 0
          ? product.dimensions.map((dim) => ({
              ...dim,
              unit: dim.unit || product.unit,
              unitPriceVnd: dim.unitPriceVnd ?? product.unitPriceVnd,
            }))
          : [{ unit: product.unit, widthM: null, heightM: null, quantity: 1, unitPriceVnd: product.unitPriceVnd }],
      accessories: [],
      fixedAccessoryPackage: fixedFromAccessories,
      extraAccessories:
        product.extra.length > 0 ? JSON.stringify(product.extra) : null,
      numericId: index + 1,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const stamp = Date.now().toString(36).toUpperCase();
  return {
    customerName,
    customerAddress: address,
    quoteDate: quoteDate || today,
    items,
    suggestedCode: options?.code || `OWIN-IMP-${today.replace(/-/g, '')}-${stamp.slice(-4)}`,
  };
}
