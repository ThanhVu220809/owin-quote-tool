import type { ProductRecord, ProductUnit, QuoteItemInput } from '@/types/models';
import { calculateExtraAccessoryLineTotal, normalizeUnit, roundQuantity3 } from '@/lib/quote-engine';
import { parseFixedAccessoriesJson, serializeFixedAccessoriesJson } from './accessoryDrafts';

export function parseProductSizeText(rawSizeText: string | null | undefined): {
  width: number | null;
  height: number | null;
} {
  if (!rawSizeText) return { width: null, height: null };
  const parts = rawSizeText.split(/\s*[xX*]\s*/);
  if (parts.length < 2) return { width: null, height: null };
  const width = Number(String(parts[0]).replace(',', '.'));
  const height = Number(String(parts[1]).replace(',', '.'));
  return {
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

function hasPerUnitPriceMarker(rawPriceText: string | null | undefined): boolean {
  if (!rawPriceText) return false;
  const normalized = rawPriceText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized.includes('/') || normalized.includes('1m2') || normalized.includes('1m²') || normalized.includes('1m dai');
}

function normalizeProductPriceForQuote(
  product: ProductRecord,
  widthM: number | null,
  heightM: number | null,
): number {
  const rawPrice = Number(product.unitPriceVnd || 0);
  const unit = normalizeUnit(product.unit);
  if (!rawPrice || !product.rawPriceText || hasPerUnitPriceMarker(product.rawPriceText) || unit === 'BO') {
    return rawPrice;
  }
  const width = Number(widthM || 0);
  const height = Number(heightM || 0);
  if (unit === 'M2' && width > 0 && height > 0) return Math.round(rawPrice / (width * height));
  if (unit === 'METER' && width + height > 0) return Math.round(rawPrice / (width + height));
  return rawPrice;
}

function normalizeExtraAccessoriesJson(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed
      .filter((acc) => acc && String(acc.name || '').trim())
      .map((acc, index) => {
        const unit = normalizeUnit(acc.unit || 'BO');
        const quantity = Number(acc.quantity || 1);
        const weight = roundQuantity3(Number(acc.weight ?? acc.kl ?? 0));
        const unitPrice = Number(acc.unitPrice ?? acc.unitPriceVnd ?? 0);
        const amount = calculateExtraAccessoryLineTotal({
          unit,
          quantity,
          weight,
          unitPriceVnd: unitPrice,
        });
        return {
          id: acc.id || crypto.randomUUID(),
          name: acc.name || '',
          unit,
          quantity,
          weight: unit === 'BO' ? 0 : weight,
          unitPrice,
          amount,
          total: amount,
          sortOrder: Number(acc.sortOrder ?? index),
        };
      });
    return normalized.length > 0 ? JSON.stringify(normalized) : null;
  } catch {
    return null;
  }
}

export function createQuoteItemFromProduct(
  product: ProductRecord,
  quoteItemCode: string,
): QuoteItemInput {
  const unit = normalizeUnit(product.unit);
  const size = parseProductSizeText(product.rawSizeText);
  const widthM = unit === 'BO' ? null : size.width ?? 1.5;
  const heightM = unit === 'BO' ? null : size.height ?? 1.5;
  const unitPriceVnd = normalizeProductPriceForQuote(product, widthM, heightM);

  return {
    sourceType: 'PRODUCT',
    productId: product.id,
    productCode: quoteItemCode,
    quoteItemCode,
    itemName: product.name,
    productType: null,
    category: product.category,
    groupName: product.category,
    coverImagePath: product.coverImagePath,
    image: product.coverImagePath,
    unit: unit as ProductUnit,
    description: '',
    unitPriceVnd,
    specs: product.specs.map((spec) => ({ key: spec.key, value: spec.value, sortOrder: spec.sortOrder })),
    dimensions: [
      {
        unit,
        widthM,
        heightM,
        quantity: 1,
        unitPriceVnd,
      },
    ],
    accessories: product.accessories.map((accessory) => ({
      name: accessory.name,
      quantityPerSet: Number(accessory.quantityPerSet || 0),
      unitPriceVnd: Number(accessory.unitPriceVnd || 0),
      note: accessory.note,
      isEnabled: true,
    })),
    fixedAccessoryPackage: product.fixedAccessoryPackage
      ? serializeFixedAccessoriesJson(parseFixedAccessoriesJson(product.fixedAccessoryPackage, 1))
      : null,
    extraAccessories: normalizeExtraAccessoriesJson(product.extraAccessories),
    numericId: product.numericId,
  };
}

export function createCustomQuoteItem(code: string): QuoteItemInput {
  return {
    sourceType: 'CUSTOM',
    productId: null,
    productCode: code,
    quoteItemCode: code,
    itemName: 'Hạng mục tùy chỉnh',
    productType: null,
    category: 'Khác',
    groupName: 'Khác',
    coverImagePath: null,
    image: null,
    unit: 'M2',
    description: '',
    unitPriceVnd: 0,
    specs: [],
    dimensions: [{ unit: 'M2', widthM: 1, heightM: 1, quantity: 1, unitPriceVnd: 0 }],
    accessories: [],
    fixedAccessoryPackage: null,
    extraAccessories: null,
    numericId: null,
  };
}
