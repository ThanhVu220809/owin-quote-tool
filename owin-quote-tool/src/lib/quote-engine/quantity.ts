import { normalizeUnit } from './units';
import type { DimensionQuantityInput } from './types';

function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundQuantity3(value: number | string | null | undefined): number {
  const parsed = asNumber(value);
  return Math.round((parsed + Number.EPSILON) * 1000) / 1000;
}

export function roundMoneyToVnd(value: number | string | null | undefined): number {
  const parsed = asNumber(value);
  return Math.round(parsed);
}

export function calculateM2Quantity(
  width: number | string | null | undefined,
  height: number | string | null | undefined,
  quantity: number | string,
): number {
  return roundQuantity3(asNumber(width) * asNumber(height) * asNumber(quantity));
}

export function calculateMeterQuantity(
  width: number | string | null | undefined,
  height: number | string | null | undefined,
  quantity: number | string,
): number {
  const w = asNumber(width);
  const h = asNumber(height);
  const q = asNumber(quantity);
  // Có R/C → (R+C)×SL; không kích thước → dùng SL (mét dài gõ thẳng vào SL hiếm)
  if (w + h > 0) return roundQuantity3((w + h) * q);
  return roundQuantity3(q);
}

export function calculateBoQuantity(quantity: number | string): number {
  return asNumber(quantity);
}

export function calculateDimensionQuantity(input: DimensionQuantityInput): number {
  const unit = normalizeUnit(input.unit);
  if (unit === 'M2') return calculateM2Quantity(input.widthM, input.heightM, input.quantity);
  if (unit === 'METER') return calculateMeterQuantity(input.widthM, input.heightM, input.quantity);
  return calculateBoQuantity(input.quantity);
}
