import { isAreaUnit, isMeterUnit } from './units';
import { roundMoneyToVnd, roundQuantity3 } from './quantity';
import type { ExtraAccessoryPricingInput, LegacyAccessoryPricingInput } from './types';

function parseQuoteNumber(value: number | string | null | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isWeightBasedAccessoryUnit(unit: ExtraAccessoryPricingInput['unit']): boolean {
  return isAreaUnit(unit) || isMeterUnit(unit);
}

/**
 * Cơ sở nhân đơn giá phụ kiện phát sinh:
 * - Bộ (BO): luôn dùng SL
 * - m² / md: ưu tiên KL nếu > 0, không thì dùng SL
 *   (tránh nhập SL mà thành tiền = 0 vì KL đang 0)
 */
export function accessoryPricingBasis(input: ExtraAccessoryPricingInput): number {
  const quantity = Math.max(0, parseQuoteNumber(input.quantity, 0));
  const weight = Math.max(0, roundQuantity3(parseQuoteNumber(input.weight, 0)));
  if (isWeightBasedAccessoryUnit(input.unit)) {
    return weight > 0 ? weight : quantity;
  }
  return quantity;
}

export function calculateExtraAccessoryLineTotal(input: ExtraAccessoryPricingInput): number {
  const unitPrice = parseQuoteNumber(
    input.unitPriceVnd !== undefined ? input.unitPriceVnd : input.unitPrice,
    0,
  );
  const basis = accessoryPricingBasis(input);
  return roundMoneyToVnd(basis * unitPrice);
}

export function calculateLegacyAccessoryLineTotal(
  input: LegacyAccessoryPricingInput,
  totalSet: number | string,
): number {
  const enabled = input.isEnabled !== false;
  if (!enabled) return 0;
  const qtyPerSet = parseQuoteNumber(input.quantityPerSet, 0);
  const price = parseQuoteNumber(input.unitPriceVnd, 0);
  return roundMoneyToVnd(qtyPerSet * parseQuoteNumber(totalSet, 0) * price);
}

export function calculateAccessorySubtotal(lines: Array<{ lineTotalVnd: number }>): number {
  return lines.reduce((sum, line) => sum + line.lineTotalVnd, 0);
}
