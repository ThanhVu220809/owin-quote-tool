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

export function calculateExtraAccessoryLineTotal(input: ExtraAccessoryPricingInput): number {
  const quantity = parseQuoteNumber(input.quantity, 1);
  const weight = roundQuantity3(parseQuoteNumber(input.weight, 0));
  const unitPrice = parseQuoteNumber(
    input.unitPriceVnd !== undefined ? input.unitPriceVnd : input.unitPrice,
    0,
  );
  const basis = isWeightBasedAccessoryUnit(input.unit) ? weight : quantity;
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
