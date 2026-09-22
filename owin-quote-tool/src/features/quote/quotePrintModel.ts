import type { ProductUnit } from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import { unitLabel } from '@/features/quote/quoteFormat';

/**
 * Dựng dòng phụ kiện cho bảng in / PDF của báo giá.
 * Đường in tự tính lại tiền phụ kiện (độc lập với quoteCalculator) nên thân hàm
 * phải giữ nguyên văn: lệch một ký tự là bảng in và file Word/Excel nói hai con số.
 */

function parseJsonMaybe<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function compactNumber(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return '';
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function accessoryItemText(name: unknown, quantity: unknown): string {
  const text = String(name || '').trim();
  if (!text) return '';
  const qty = Number(quantity ?? 0);
  return qty > 1 ? `${text} x${qty}` : text;
}

export interface QuotePrintAccessoryRow {
  descriptionLines: string[];
  unit: string;
  quantity: string;
  weight: string;
  unitPriceVnd: number;
  amountVnd: number;
}

export function buildQuotePrintAccessoryRows(item: ReturnType<typeof calculateQuote>['items'][number]): QuotePrintAccessoryRow[] {
  const rows: QuotePrintAccessoryRow[] = [];
  const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
  if (fixed) {
    const quantity = Number(fixed.packageQuantity ?? fixed.quantity ?? 1) || 1;
    const unitPrice = Number(fixed.unitPrice ?? fixed.unitPriceVnd ?? 0) || 0;
    const items = Array.isArray(fixed.items) ? fixed.items : [];
    rows.push({
      descriptionLines: [
        `${String(fixed.name || 'Bộ phụ kiện đi kèm').trim()}:`,
        ...items
          .map((entry) => {
            const row = entry as Record<string, unknown>;
            return accessoryItemText(row.name, row.quantity);
          })
          .filter(Boolean)
          .map((line) => `- ${line}`),
      ],
      unit: 'Bộ',
      quantity: compactNumber(quantity),
      weight: compactNumber(quantity),
      unitPriceVnd: unitPrice,
      amountVnd: Math.round(quantity * unitPrice),
    });
  }

  const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
  extras
    .filter((entry) => entry && String((entry as Record<string, unknown>).name || '').trim())
    .forEach((entry) => {
      const extra = entry as Record<string, unknown>;
      const unit = String(extra.unit || 'BO') as ProductUnit;
      const normalizedUnit = unit === 'M2' || unit === 'METER' || unit === 'BO' ? unit : 'BO';
      const quantity = Number(extra.quantity ?? extra.quantityPerSet ?? 1) || 1;
      const weight = normalizedUnit === 'BO' ? 0 : Number(extra.weight ?? extra.kl ?? 0) || 0;
      const unitPrice = Number(extra.unitPrice ?? extra.unitPriceVnd ?? 0) || 0;
      // SL = số cái; md/m²: thành tiền = KL × giá (KL trống → SL)
      const basis = normalizedUnit === 'BO' ? quantity : weight > 0 ? weight : quantity;
      rows.push({
        descriptionLines: [String(extra.name || 'Phụ kiện phát sinh').trim()],
        unit: unitLabel(normalizedUnit),
        quantity: compactNumber(quantity),
        weight: normalizedUnit === 'BO' ? '' : compactNumber(weight > 0 ? weight : quantity),
        unitPriceVnd: unitPrice,
        amountVnd: Math.round(basis * unitPrice),
      });
    });

  if (rows.length > 0) return rows;
  return item.accessories
    .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
    .map((accessory) => ({
      descriptionLines: [accessory.name, accessory.note].filter(Boolean) as string[],
      unit: 'Bộ',
      quantity: compactNumber(accessory.quantityPerSet),
      weight: compactNumber(accessory.totalSet),
      unitPriceVnd: accessory.unitPriceVnd,
      amountVnd: accessory.lineTotalVnd,
    }));
}
