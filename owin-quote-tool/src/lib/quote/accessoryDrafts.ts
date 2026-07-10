import type { ProductUnit } from '@/types/models';
import { calculateExtraAccessoryLineTotal, normalizeUnit } from '@/lib/quote-engine';

export interface FixedAccessoryItemDraft {
  name: string;
  quantity: number;
}

export interface FixedAccessoryDraft {
  name: string;
  items: FixedAccessoryItemDraft[];
  packageQuantity: number;
  unit: ProductUnit;
  unitPrice: number;
  total: number;
}

export interface ExtraAccessoryDraft {
  id: string;
  name: string;
  unit: ProductUnit;
  quantity: number;
  weight: number;
  unitPrice: number;
  amount: number;
  total: number;
  sortOrder: number;
}

export const DEFAULT_FIXED_ACCESSORY_ITEMS: FixedAccessoryItemDraft[] = [
  { name: 'Vật tư phụ', quantity: 0 },
];

export const DEFAULT_FIXED_ACCESSORY_NAME = 'Bộ phụ kiện đi kèm';

function numberOr(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function parseFixedItemsText(itemsText: unknown): FixedAccessoryItemDraft[] {
  if (typeof itemsText !== 'string') return [];
  return itemsText
    .split(/\r?\n|;/)
    .map((line) => {
      const cleaned = line.replace(/^[-+•\s]*/, '').trim();
      if (!cleaned) return null;
      const match = cleaned.match(/(.*?)\s+x\s*(\d+)$/i) || cleaned.match(/(.*?)\s+(\d+)$/);
      if (match) return { name: match[1].trim(), quantity: numberOr(match[2], 0) };
      return { name: cleaned, quantity: 0 };
    })
    .filter((item): item is FixedAccessoryItemDraft => item !== null);
}

export function calculateFixedAccessoryDraftTotal(
  draft: Pick<FixedAccessoryDraft, 'packageQuantity' | 'unitPrice'>,
): number {
  return Math.round(numberOr(draft.packageQuantity, 1) * numberOr(draft.unitPrice, 0));
}

export function parseFixedAccessoriesJson(
  value: string | null | undefined,
  defaultPackageQuantity = 1,
): FixedAccessoryDraft {
  const fallbackQuantity = Math.max(1, numberOr(defaultPackageQuantity, 1));
  const fallback: FixedAccessoryDraft = {
    name: DEFAULT_FIXED_ACCESSORY_NAME,
    items: DEFAULT_FIXED_ACCESSORY_ITEMS.map((item) => ({ ...item })),
    packageQuantity: fallbackQuantity,
    unit: 'BO',
    unitPrice: 0,
    total: 0,
  };
  const parsed = parseJsonMaybe<Record<string, unknown> | null>(value, null);
  if (!parsed || typeof parsed !== 'object') return fallback;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : parseFixedItemsText(parsed.itemsText);
  const parsedItems = rawItems
    .map((item) => {
      const row = item as Record<string, unknown>;
      return { name: String(row.name || '').trim(), quantity: numberOr(row.quantity, 0) };
    })
    .filter((item) => item.name);
  const hasOnlyPlaceholderOneQuantities =
    parsedItems.length > 1 && parsedItems.every((item) => item.quantity === 1);
  const items = hasOnlyPlaceholderOneQuantities
    ? parsedItems.map((item) => ({ ...item, quantity: 0 }))
    : parsedItems;
  const packageQuantity = numberOr(parsed.packageQuantity ?? parsed.quantity, fallbackQuantity);
  const unitPrice = numberOr(parsed.unitPrice ?? parsed.unitPriceVnd, 0);
  return {
    name: String(parsed.name || DEFAULT_FIXED_ACCESSORY_NAME).trim(),
    items,
    packageQuantity,
    unit: 'BO',
    unitPrice,
    total: numberOr(parsed.total ?? parsed.totalVnd, packageQuantity * unitPrice),
  };
}

export function serializeFixedAccessoriesJson(value: FixedAccessoryDraft): string | null {
  const cleanItems = value.items
    .map((item) => ({
      name: item.name.trim(),
      quantity: numberOr(item.quantity, 0),
    }))
    .filter((item) => item.name);
  const unitPrice = numberOr(value.unitPrice, 0);
  const packageQuantity = Math.max(1, numberOr(value.packageQuantity, 1));
  const total = packageQuantity * unitPrice;
  if (!value.name.trim() && cleanItems.length === 0 && unitPrice === 0) return null;
  return JSON.stringify({
    name: value.name.trim() || DEFAULT_FIXED_ACCESSORY_NAME,
    items: cleanItems,
    packageQuantity,
    unit: 'BO',
    unitPrice,
    unitPriceVnd: unitPrice,
    total,
    totalVnd: total,
  });
}

export function updateFixedAccessoryDraft(
  draft: FixedAccessoryDraft,
  patch: Partial<FixedAccessoryDraft>,
): FixedAccessoryDraft {
  const next = { ...draft, ...patch };
  next.total = calculateFixedAccessoryDraftTotal(next);
  return next;
}

export function calculateAccessoryDraftTotal(input: Pick<ExtraAccessoryDraft, 'unit' | 'quantity' | 'weight' | 'unitPrice'>): number {
  return calculateExtraAccessoryLineTotal({
    unit: input.unit,
    quantity: input.quantity,
    weight: input.weight,
    unitPriceVnd: input.unitPrice,
  });
}

export function normalizeAccessoryDraft(
  input: Partial<ExtraAccessoryDraft>,
  sortOrder = 0,
): ExtraAccessoryDraft {
  const unit = normalizeUnit(input.unit || 'BO') as ProductUnit;
  const quantity = Math.max(1, numberOr(input.quantity, 1));
  const weight = unit === 'BO' ? 0 : numberOr(input.weight, quantity);
  const unitPrice = numberOr(input.unitPrice, 0);
  const amount = calculateAccessoryDraftTotal({ unit, quantity, weight, unitPrice });
  return {
    id: input.id || crypto.randomUUID(),
    name: String(input.name || ''),
    unit,
    quantity,
    weight,
    unitPrice,
    amount,
    total: amount,
    sortOrder: numberOr(input.sortOrder, sortOrder),
  };
}

export function parseExtraAccessoriesJson(value: string | null | undefined): ExtraAccessoryDraft[] {
  const parsed = parseJsonMaybe<unknown[]>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    return normalizeAccessoryDraft(
      {
        id: String(row.id || ''),
        name: String(row.name || ''),
        unit: normalizeUnit(String(row.unit || 'BO')) as ProductUnit,
        quantity: numberOr(row.quantity ?? row.quantityPerSet, 1),
        weight: numberOr(row.weight ?? row.kl, 0),
        unitPrice: numberOr(row.unitPrice ?? row.unitPriceVnd, 0),
        sortOrder: numberOr(row.sortOrder, index),
      },
      index,
    );
  });
}

export function serializeExtraAccessoriesJson(value: ExtraAccessoryDraft[]): string | null {
  const clean = value
    .map((item, sortOrder) => {
      const normalized = normalizeAccessoryDraft({ ...item, sortOrder }, sortOrder);
      return {
        id: normalized.id,
        name: normalized.name.trim(),
        unit: normalized.unit,
        quantity: normalized.quantity,
        weight: normalized.weight,
        unitPrice: normalized.unitPrice,
        amount: normalized.amount,
        total: normalized.amount,
        sortOrder,
      };
    })
    .filter((item) => item.name);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

export function updateAccessoryDraftAtIndex(
  list: ExtraAccessoryDraft[],
  index: number,
  patch: Partial<ExtraAccessoryDraft>,
): ExtraAccessoryDraft[] {
  return list.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const next = { ...item, ...patch };
    if (patch.unit !== undefined) next.weight = normalizeUnit(patch.unit) === 'BO' ? 0 : next.weight || next.quantity;
    return normalizeAccessoryDraft(next, itemIndex);
  });
}

export function addEmptyAccessoryDraft(list: ExtraAccessoryDraft[]): ExtraAccessoryDraft[] {
  return [...list, normalizeAccessoryDraft({ id: crypto.randomUUID(), unit: 'BO', quantity: 1 }, list.length)];
}
