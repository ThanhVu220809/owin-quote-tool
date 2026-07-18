import type { ProductRecord } from '@/types/models';
import { normalizeUnit, roundMoneyToVnd } from '@/lib/quote-engine';

interface CatalogueAccessoryInput {
  name?: unknown;
  unit?: unknown;
  quantity?: unknown;
  quantityPerSet?: unknown;
  unitPrice?: unknown;
  unitPriceVnd?: unknown;
  weight?: unknown;
  kl?: unknown;
}

interface CatalogueFixedAccessoryPackageInput {
  quantity?: unknown;
  packageQuantity?: unknown;
  unitPrice?: unknown;
  unitPriceVnd?: unknown;
}

function parseDimensionInput(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function parseSizeToMeters(sizeText: string | null | undefined): { width: number; height: number } {
  if (!sizeText) return { width: 0, height: 0 };
  const parts = sizeText.split(/\s*[xX*]\s*/);
  if (parts.length >= 2) {
    let width = parseDimensionInput(parts[0]);
    let height = parseDimensionInput(parts[1]);
    if (width > 10) width /= 1000;
    if (height > 10) height /= 1000;
    return { width, height };
  }
  return { width: 0, height: 0 };
}

/**
 * Format dimension/weight for catalogue display.
 * - Rộng/Cao: max 2 decimals
 * - KL (khối lượng): max 3 decimals
 * Trailing zeros are stripped (2.700 → "2,7"; 2.511 → "2,511").
 */
export function formatCatalogueDecimal(value: number, digits = 2): string {
  if (!Number.isFinite(value) || value === 0) return '';
  const factor = 10 ** Math.max(0, digits);
  // Round half-up to the allowed precision before display.
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
  const signed = value < 0 ? -rounded : rounded;
  if (Number.isInteger(signed)) return String(signed);
  return signed
    .toFixed(digits)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
    .replace('.', ',');
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

export function getCatalogueLineWeight(unit: string, width: number, height: number, quantity = 1): number {
  const normalizedUnit = normalizeUnit(unit);
  // Full precision for money; display truncates via formatCatalogueDecimal (W/H ≤2, KL ≤3).
  if (normalizedUnit === 'M2') return width > 0 && height > 0 ? width * height * quantity : quantity;
  if (normalizedUnit === 'METER') return width + height > 0 ? (width + height) * quantity : quantity;
  return quantity;
}

export function buildCatalogueMoneyBlocks(product: ProductRecord) {
  const { width, height } = parseSizeToMeters(product.rawSizeText);
  const productUnitPrice = Number(product.unitPriceVnd || 0);
  const productWeight = getCatalogueLineWeight(product.unit, width, height, 1);
  // Dòng tiền: làm tròn đồng (KHÔNG floor 100.000 — rule 100k chỉ cho tổng báo giá).
  const productAmount = roundMoneyToVnd(productWeight * productUnitPrice);

  const fixedPkg = parseJsonMaybe<CatalogueFixedAccessoryPackageInput | null>(product.fixedAccessoryPackage, null);
  const fixedQuantity = fixedPkg ? Number(fixedPkg.packageQuantity ?? fixedPkg.quantity ?? 1) || 1 : 0;
  const fixedUnitPrice = fixedPkg ? Number(fixedPkg.unitPrice ?? fixedPkg.unitPriceVnd ?? 0) || 0 : 0;
  const fixedAmount = roundMoneyToVnd(fixedQuantity * fixedUnitPrice);

  const legacyAccessories = !fixedPkg && Array.isArray(product.accessories) ? product.accessories : [];
  const legacyAmount = legacyAccessories.reduce((sum, item) => {
    const qty = Number(item.quantityPerSet ?? 1) || 1;
    const unitPrice = Number(item.unitPriceVnd ?? 0) || 0;
    return sum + roundMoneyToVnd(qty * unitPrice);
  }, 0);

  const extraAccessories = parseJsonMaybe<CatalogueAccessoryInput[]>(product.extraAccessories, []);
  const extraRows = Array.isArray(extraAccessories)
    ? extraAccessories
        .filter((item) => item && String(item.name || '').trim())
        .map((item) => {
          const unit = normalizeUnit(String(item.unit || 'BO'));
          const quantity = Number(item.quantity ?? item.quantityPerSet ?? 1) || 1;
          const weight = unit === 'BO' ? 0 : Number(item.weight ?? item.kl ?? 0) || 0;
          const unitPrice = Number(item.unitPrice ?? item.unitPriceVnd ?? 0) || 0;
          // BO: SL × giá; m²/md: KL (fallback SL nếu KL trống)
          const basis = unit === 'BO' ? quantity : weight > 0 ? weight : quantity;
          const amount = roundMoneyToVnd(basis * unitPrice);
          return { item, unit, quantity, weight: unit === 'BO' ? 0 : weight || quantity, unitPrice, amount };
        })
    : [];

  const accessoryAmount = fixedAmount + legacyAmount;
  const extraAmount = extraRows.reduce((sum, row) => sum + row.amount, 0);

  return {
    width,
    height,
    productUnitPrice,
    productWeight,
    productAmount,
    fixedPkg,
    fixedQuantity,
    fixedUnitPrice,
    fixedAmount,
    legacyAccessories,
    legacyAmount,
    accessoryAmount,
    extraRows,
    extraAmount,
    completedTotal: productAmount + accessoryAmount + extraAmount,
  };
}
