import type { ProductRecord } from '@/types/models';
import {
  buildAccessoryPackageCatalog,
  findOrphanAccessoryNames,
  type AccessoryPackageTemplate,
} from '@/lib/quote/accessoryPackages';

/**
 * Gợi ý tự động của form sản phẩm.
 *
 * Nguyên tắc: mỗi field có pool RIÊNG, không trộn một rổ chung — "Khung Bao"
 * không bao giờ gợi ý giá trị của "Khuôn Bao", phụ kiện cố định không lẫn phụ
 * kiện phát sinh.
 */

export const PRODUCT_SUGGESTION_TYPES = [
  'accessory_package_name',
  'fixed_accessory_item',
  'extra_accessory_name',
  'category',
  'product_name',
  'item_name',
  'color',
  'frame',
  'sash',
  'thickness',
  'glass',
  'molding',
  'protection_bar',
  'spec_value',
  'spec_value_color',
  'spec_value_frame',
  'spec_value_glass',
  'spec_value_molding',
  'spec_value_protection_bar',
  'spec_value_sash',
  'spec_value_thickness',
  'accessory_name',
  'jamb',
  'spec_value_jamb',
] as const;

export interface ProductSuggestions {
  category: string[];
  productName: string[];
  specKey: string[];
  specValue: string[];
  specValueColor?: string[];
  specValueFrame?: string[];
  specValueJamb?: string[];
  specValueSash?: string[];
  specValueThickness?: string[];
  specValueGlass?: string[];
  specValueMolding?: string[];
  specValueProtectionBar?: string[];
  accessoryName: string[];
  accessoryPackageName?: string[];
  extraAccessoryName?: string[];
  packageCatalog?: AccessoryPackageTemplate[];
  orphanAccessoryNames?: string[];
}

function normalizeSpecKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function specValuesByKey(products: ProductRecord[], matcher: (key: string) => boolean): string[] {
  return products
    .flatMap((product) => product.specs.filter((spec) => matcher(normalizeSpecKey(spec.key))).map((spec) => spec.value))
    .filter(Boolean);
}

function parseJsonArray(value: string | null | undefined): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fixedPackageNames(products: ProductRecord[]): string[] {
  return products
    .map((product) => {
      if (!product.fixedAccessoryPackage) return '';
      try {
        return String((JSON.parse(product.fixedAccessoryPackage) as Record<string, unknown>).name || '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function fixedAccessoryItemNames(product: ProductRecord): string[] {
  if (!product.fixedAccessoryPackage) return [];
  try {
    const fixed = JSON.parse(product.fixedAccessoryPackage) as { items?: Array<{ name?: unknown }> };
    return Array.isArray(fixed.items) ? fixed.items.map((item) => String(item.name || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function fixedAccessoryNames(products: ProductRecord[]): string[] {
  return products.flatMap((product) => [
    ...product.accessories.map((accessory) => accessory.name),
    ...fixedAccessoryItemNames(product),
  ]).filter(Boolean);
}

function extraAccessoryNames(products: ProductRecord[]): string[] {
  return products
    .flatMap((product) => parseJsonArray(product.extraAccessories).map((item) => String(item.name || '')))
    .filter(Boolean);
}

/** Trộn gợi ý đã học (Supabase) với giá trị đang có trong danh mục sản phẩm. */
export function buildProductSuggestions(
  productRecords: ProductRecord[],
  seeded: Record<string, string[]>,
): ProductSuggestions {
  const packageCatalog = buildAccessoryPackageCatalog(productRecords);
  const orphanAccessoryNames = findOrphanAccessoryNames(productRecords, packageCatalog);

  return {
    category: [
      ...(seeded.category ?? []),
      ...productRecords.map((p) => p.category).filter(Boolean),
    ],
    productName: [
      ...(seeded.product_name ?? []),
      ...(seeded.item_name ?? []),
      ...productRecords.map((p) => p.name).filter(Boolean),
    ],
    // Spec keys are strict presets only — never mix random learned labels.
    specKey: [],
    specValue: [
      ...(seeded.spec_value ?? []),
    ],
    specValueColor: [
      ...(seeded.color ?? []),
      ...(seeded.spec_value_color ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('mau')),
    ],
    // Khung Bao ≠ Khuôn Bao — never mix these pools.
    specValueFrame: [
      ...(seeded.frame ?? []),
      ...(seeded.spec_value_frame ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('khung') && !key.includes('khuon')),
    ],
    specValueJamb: [
      ...(seeded.jamb ?? []),
      ...(seeded.spec_value_jamb ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('khuon')),
    ],
    specValueSash: [
      ...(seeded.sash ?? []),
      ...(seeded.spec_value_sash ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('canh')),
    ],
    specValueThickness: [
      ...(seeded.thickness ?? []),
      ...(seeded.spec_value_thickness ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('day')),
    ],
    specValueGlass: [
      ...(seeded.glass ?? []),
      ...(seeded.spec_value_glass ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('kinh')),
    ],
    specValueMolding: [
      ...(seeded.molding ?? []),
      ...(seeded.spec_value_molding ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('phao')),
    ],
    specValueProtectionBar: [
      ...(seeded.protection_bar ?? []),
      ...(seeded.spec_value_protection_bar ?? []),
      ...specValuesByKey(productRecords, (key) => key.includes('song') || key.includes('bao ve')),
    ],
    // Fixed package item names only (not extras).
    accessoryName: [
      ...(seeded.fixed_accessory_item ?? []),
      ...(seeded.accessory_name ?? []),
      ...fixedAccessoryNames(productRecords),
    ],
    accessoryPackageName: [
      ...(seeded.accessory_package_name ?? []),
      ...fixedPackageNames(productRecords),
      ...packageCatalog.map((pkg) => pkg.name),
    ],
    // Extra accessories only — separate from fixed package.
    extraAccessoryName: [
      ...(seeded.extra_accessory_name ?? []),
      ...extraAccessoryNames(productRecords),
    ],
    packageCatalog,
    orphanAccessoryNames,
  };
}
