import type { DimensionInput, ProductUnit, QuoteItemInput } from '@/types/models';
import { calculateDimensionLine } from '@/lib/quote/quoteCalculator';
import {
  calculateExtraAccessoryLineTotal,
  calculateLegacyAccessoryLineTotal,
  normalizeUnit,
  roundMoneyToVnd,
  roundQuantity3,
} from '@/lib/quoteEngine/index';

/** Tổng SL (số cái) của mọi dòng kích thước trong 1 hạng mục. */
export function sumItemDimensionQuantity(item: Pick<QuoteItemInput, 'dimensions'>): number {
  return (item.dimensions || []).reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)), 0);
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

/** Tiền bộ PK cố định = SL_PK × đơn giá (hoặc total đã lưu). */
export function fixedPackageTotalVnd(item: Pick<QuoteItemInput, 'fixedAccessoryPackage'>): number {
  const raw = item.fixedAccessoryPackage;
  if (raw == null || raw === '') return 0;
  const pkg = parseJsonMaybe<Record<string, unknown> | null>(raw, null);
  if (!pkg || typeof pkg !== 'object') return 0;
  const qty = Math.max(0, Number(pkg.packageQuantity ?? pkg.quantity ?? 0));
  const unitPrice = Number(pkg.unitPrice ?? pkg.unitPriceVnd ?? 0);
  const stored = Number(pkg.total ?? pkg.totalVnd ?? 0);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
  return roundMoneyToVnd(qty * unitPrice);
}

/** Tiền phụ kiện phát sinh (extra). */
export function extraAccessoriesTotalVnd(item: Pick<QuoteItemInput, 'extraAccessories'>): number {
  const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
  if (!Array.isArray(extras)) return 0;
  return extras.reduce<number>((sum, row) => {
    const acc = row as Record<string, unknown>;
    if (!String(acc?.name || '').trim()) return sum;
    const unit = normalizeUnit(String(acc.unit || 'BO'));
    const quantity = Number(acc.quantity || 0);
    const weight = roundQuantity3(Number(acc.weight ?? acc.kl ?? 0));
    const unitPrice = Number(acc.unitPriceVnd ?? acc.unitPrice ?? 0);
    const amount = Number(acc.amount ?? acc.total);
    if (Number.isFinite(amount) && amount > 0) return sum + Math.round(amount);
    return (
      sum +
      calculateExtraAccessoryLineTotal({
        unit,
        quantity,
        weight,
        unitPriceVnd: unitPrice,
      })
    );
  }, 0);
}

/** Tiền phụ kiện legacy (quantityPerSet × tổng SL). */
export function legacyAccessoriesTotalVnd(
  item: Pick<QuoteItemInput, 'accessories' | 'dimensions'>,
): number {
  const totalSet = sumItemDimensionQuantity(item);
  return (item.accessories || []).reduce((sum, acc) => {
    if (acc.isEnabled === false) return sum;
    return sum + calculateLegacyAccessoryLineTotal(acc, totalSet);
  }, 0);
}

/**
 * Toàn bộ tiền PK/PS gán cho hạng mục (bộ cố định + extra + legacy).
 * Dùng để phân bổ theo SL từng dòng.
 */
export function itemAccessoryPoolVnd(item: QuoteItemInput): number {
  // Prefer fixed/extra package path when present (matches quote calculator).
  const hasPackagePath =
    (item.fixedAccessoryPackage != null && item.fixedAccessoryPackage !== '') ||
    Boolean(String(item.extraAccessories || '').trim() && item.extraAccessories !== '[]');
  if (hasPackagePath) {
    return fixedPackageTotalVnd(item) + extraAccessoriesTotalVnd(item);
  }
  return legacyAccessoriesTotalVnd(item);
}

/**
 * PK phân bổ cho 1 dòng:
 *   (SL_PK_tiền_tổng / tổng_SL_SP) × SL_dòng
 * = (SL_dòng / tổng_SL_SP) × tiền_PK_tổng
 *
 * Ví dụ: bộ PK 2tr, tổng SL cửa 4, dòng SL=2 → PK dòng = 1tr.
 */
export function packageShareForLine(lineQuantity: number, totalDoorSl: number, packagePoolVnd: number): number {
  const lineSl = Math.max(0, Number(lineQuantity || 0));
  const totalSl = Math.max(0, Number(totalDoorSl || 0));
  const pool = Math.max(0, Number(packagePoolVnd || 0));
  if (pool === 0) return 0;
  if (totalSl <= 0) return roundMoneyToVnd(pool);
  return roundMoneyToVnd((lineSl / totalSl) * pool);
}

/**
 * Điểm xếp 1 hạng mục = max trên các dòng của (tiền dòng SP + PK phân bổ dòng).
 * Một dòng: = tiền SP dòng + full PK ≈ giá tổng hạng mục (chưa làm tròn).
 * Nhiều dòng: lấy dòng có (SP+PK) lớn nhất — không cộng gộp cả hạng mục.
 */
export function rankingAmountForQuoteItem(item: QuoteItemInput): number {
  const unit = (item.unit || 'M2') as ProductUnit;
  const price = Number(item.unitPriceVnd || 0);
  const dims = item.dimensions || [];
  const totalDoorSl = sumItemDimensionQuantity(item);
  const packagePool = itemAccessoryPoolVnd(item);

  if (dims.length === 0) {
    return packagePool;
  }

  let max = 0;
  for (const line of dims) {
    const calculated = calculateDimensionLine(unit, line as DimensionInput, price);
    const lineProduct = calculated.lineTotalVnd;
    const linePk = packageShareForLine(Number(line.quantity || 0), totalDoorSl, packagePool);
    const combined = lineProduct + linePk;
    if (combined > max) max = combined;
  }
  return max;
}

/** @deprecated dùng rankingAmountForQuoteItem — giữ alias cho test/import cũ */
export function maxDimensionLineAmount(item: QuoteItemInput): number {
  return rankingAmountForQuoteItem(item);
}

/**
 * Xếp hạng mục báo giá theo điểm (SP dòng + PK phân bổ) cao → thấp.
 */
export function sortQuoteItemsByMaxLineAmount<T extends QuoteItemInput>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, amount: rankingAmountForQuoteItem(item) }))
    .sort((a, b) => b.amount - a.amount || a.index - b.index)
    .map((entry) => entry.item);
}

/** Sắp items + mảng song song (ui keys) theo cùng comparator. */
export function sortQuoteItemsWithKeys<T extends QuoteItemInput, K>(
  items: T[],
  keys: K[],
): { items: T[]; keys: K[] } {
  const paired = items.map((item, index) => ({
    item,
    key: keys[index],
    index,
    amount: rankingAmountForQuoteItem(item),
  }));
  paired.sort((a, b) => b.amount - a.amount || a.index - b.index);
  return {
    items: paired.map((row) => row.item),
    keys: paired.map((row) => row.key as K),
  };
}
