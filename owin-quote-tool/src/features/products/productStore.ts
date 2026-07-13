/**
 * Product service backed directly by Supabase.
 *
 * ProductRecord remains the canonical shape and legacy fields are normalized at
 * the UI boundary, but no catalogue data is persisted in browser storage.
 */

import type {
  Accessory,
  DVT,
  Product,
  ProductAccessoryRecord,
  ProductRecord,
  ProductSpecRecord,
  ProductUnit,
} from '@/types/models';
import { parseFixedAccessoriesJson, serializeFixedAccessoriesJson } from '@/lib/quote/accessoryDrafts';
import { notifyProductsChanged } from './productEvents';
import {
  getProductById,
  listProducts,
  listProductsRaw,
  upsertProduct,
  upsertProductsBatch,
} from '@/features/supabase/productsRepo';

const DEFAULT_CATEGORY = 'Khác';

type ProductInput = {
  id?: string;
  numericId?: number;
  code?: string;
  name?: string;
  slug?: string;
  category?: string;
  unit?: ProductUnit | DVT | string;
  unitPriceVnd?: number;
  shortDesc?: string | null;
  coverImagePath?: string | null;
  gallery?: string[];
  rawSizeText?: string | null;
  rawPriceText?: string | null;
  specs?: ProductSpecRecord[];
  accessories?: Array<Partial<ProductAccessoryRecord> & Partial<Accessory>>;
  fixedAccessoryPackage?: string | null;
  extraAccessories?: string | null;
  isFeatured?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
  folderPath?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  dvt?: DVT | ProductUnit | string;
  ten?: string;
  ma?: string;
  donGiaGoc?: number;
  rongMacDinh?: number;
  caoMacDinh?: number;
  imageId?: string;
  mau?: string;
  heNhom?: string;
  khungBao?: string;
  banCanh?: string;
  kinh?: string;
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function legacyDvtToUnit(dvt: unknown): ProductUnit {
  if (dvt === 'Bộ' || dvt === 'BO') return 'BO';
  if (dvt === 'md' || dvt === 'METER') return 'METER';
  return 'M2';
}

function unitToLegacyDvt(unit: unknown): DVT {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function slugifyVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  const text = normalizeString(value);
  return text ? text : null;
}

function normalizeJsonString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  try {
    JSON.parse(value);
    return value;
  } catch {
    return fallback;
  }
}

function normalizeFixedAccessoryPackage(value: unknown): string | null {
  const text = normalizeNullableString(value);
  if (!text) return null;
  return serializeFixedAccessoriesJson(parseFixedAccessoriesJson(text, 1));
}

function rawSizeFromLegacy(input: ProductInput): string | null {
  if (hasText(input.rawSizeText)) return input.rawSizeText.trim();
  const width = normalizeNumber(input.rongMacDinh, 0);
  const height = normalizeNumber(input.caoMacDinh, 0);
  if (width > 0 && height > 0) return `${width} x ${height}`;
  return null;
}

function legacyImageToPath(value: unknown): string | null {
  if (!hasText(value)) return null;
  return `legacy-images/${value.trim()}`;
}

function legacyImageFromPath(value: string | null): string | undefined {
  if (!value) return undefined;
  const prefix = 'legacy-images/';
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function spec(key: string, value: unknown, sortOrder: number): ProductSpecRecord | null {
  const normalized = normalizeNullableString(value);
  return normalized ? { key, value: normalized, sortOrder } : null;
}

function specsFromLegacy(input: ProductInput): ProductSpecRecord[] {
  const direct = Array.isArray(input.specs) ? input.specs : null;
  if (direct) {
    return direct
      .map((item, index) => ({
        key: normalizeString((item as ProductSpecRecord).key),
        value: normalizeString((item as ProductSpecRecord).value),
        sortOrder: normalizeNumber((item as ProductSpecRecord).sortOrder, index),
      }))
      // Keep an explicitly named spec even when its value is empty. Exporters
      // render this as the key alone (for example, "Song Nhôm Bảo Vệ").
      .filter((item) => item.key);
  }

  return [
    spec('Màu', input.mau, 0),
    spec('Hệ Nhôm', input.heNhom, 1),
    spec('Khung Bao', input.khungBao, 2),
    spec('Bản Cánh', input.banCanh, 3),
    spec('Loại Kính', input.kinh, 4),
  ].filter((item): item is ProductSpecRecord => item !== null);
}

function normalizeAccessories(input: ProductInput): ProductAccessoryRecord[] {
  const items = Array.isArray(input.accessories) ? input.accessories : [];
  return items
    .map((item, index): ProductAccessoryRecord | null => {
      const raw = item as Partial<ProductAccessoryRecord> & Partial<Accessory>;
      const name = normalizeString(raw.name ?? raw.ten);
      if (!name) return null;
      return {
        name,
        quantityPerSet: normalizeNumber(raw.quantityPerSet ?? raw.sl, 0),
        unitPriceVnd: normalizeNumber(raw.unitPriceVnd ?? raw.donGia, 0),
        note: normalizeNullableString(raw.note),
        sortOrder: normalizeNumber(raw.sortOrder, index),
      };
    })
    .filter((item): item is ProductAccessoryRecord => item !== null);
}

function getSpecValue(record: ProductRecord, keys: string[]): string | undefined {
  const wanted = keys.map((key) => key.toLowerCase());
  return record.specs.find((item) => wanted.includes(item.key.toLowerCase()))?.value;
}

function parseRawSize(rawSizeText: string | null): { width?: number; height?: number } {
  if (!rawSizeText) return {};
  const [rawWidth, rawHeight] = rawSizeText.split(/\s*[xX*]\s*/);
  const width = normalizeNumber(String(rawWidth ?? '').replace(',', '.'), 0);
  const height = normalizeNumber(String(rawHeight ?? '').replace(',', '.'), 0);
  return {
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
  };
}

function isProductRecordLike(input: ProductInput): boolean {
  return hasText(input.code) && hasText(input.name) && hasText(input.unit);
}

export function normalizeProductRecord(input: ProductInput, numericIdFallback = 1): ProductRecord {
  const existingRecord = isProductRecordLike(input);
  const name = normalizeString(input.name ?? input.ten, 'Sản phẩm');
  const code = normalizeString(input.code ?? input.ma ?? input.id, crypto.randomUUID()).toUpperCase();
  const createdAt = normalizeString(input.createdAt, normalizeString(input.updatedAt, nowIso()));
  const updatedAt = normalizeString(input.updatedAt, nowIso());
  const unit = existingRecord ? legacyDvtToUnit(input.unit) : legacyDvtToUnit(input.dvt);
  const coverImagePath =
    normalizeNullableString(input.coverImagePath) ?? legacyImageToPath(input.imageId);

  return {
    id: normalizeString(input.id, code),
    numericId: normalizeNumber(input.numericId, numericIdFallback),
    code,
    name,
    slug: normalizeString(input.slug, slugifyVi(name) || code.toLowerCase()),
    category: normalizeString(input.category, DEFAULT_CATEGORY) || DEFAULT_CATEGORY,
    unit,
    unitPriceVnd: normalizeNumber(input.unitPriceVnd ?? input.donGiaGoc, 0),
    shortDesc: normalizeNullableString(input.shortDesc),
    coverImagePath,
    gallery: Array.isArray(input.gallery) ? input.gallery.map(String).filter(Boolean) : [],
    rawSizeText: rawSizeFromLegacy(input),
    rawPriceText: normalizeNullableString(input.rawPriceText),
    specs: specsFromLegacy(input),
    accessories: normalizeAccessories(input),
    fixedAccessoryPackage: normalizeFixedAccessoryPackage(input.fixedAccessoryPackage),
    extraAccessories: normalizeJsonString(input.extraAccessories, '[]'),
    isFeatured: Boolean(input.isFeatured),
    isPublic: input.isPublic !== false,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : undefined,
    folderPath: normalizeNullableString(input.folderPath),
    createdAt,
    updatedAt,
    deleted: Boolean(input.deleted) || undefined,
    deletedAt: normalizeNullableString(input.deletedAt),
  };
}

export function toLegacyProduct(record: ProductRecord): Product {
  const { width, height } = parseRawSize(record.rawSizeText);
  return {
    id: record.id,
    updatedAt: record.updatedAt,
    deleted: record.deleted,
    deletedAt: record.deletedAt,
    dvt: unitToLegacyDvt(record.unit),
    ten: record.name,
    ma: record.code,
    donGiaGoc: record.unitPriceVnd,
    rongMacDinh: width,
    caoMacDinh: height,
    imageId: legacyImageFromPath(record.coverImagePath),
    mau: getSpecValue(record, ['Màu', 'Mau']),
    heNhom: getSpecValue(record, ['Hệ Nhôm', 'He Nhom', 'Hệ nhôm']),
    khungBao: getSpecValue(record, ['Khung Bao', 'Khung bao']),
    banCanh: getSpecValue(record, ['Bản Cánh', 'Ban Canh', 'Bản cánh']),
    kinh: getSpecValue(record, ['Loại Kính', 'Kính', 'Loai Kinh']),
    accessories: record.accessories.map((item, index) => ({
      id: `${record.id}-pk-${index}`,
      ten: item.name,
      donGia: item.unitPriceVnd,
      sl: item.quantityPerSet,
      enabled: true,
    })),
  };
}

async function getNextNumericId(): Promise<number> {
  const records = await getAllProductsRaw();
  return records.reduce((max, item) => Math.max(max, item.numericId || 0), 0) + 1;
}

/**
 * Kept for old callers. Seeding is intentionally disabled: an empty Supabase
 * catalogue is a valid state and must not be silently repopulated by a browser.
 */
export async function seedIfEmpty(): Promise<void> {
  return Promise.resolve();
}

/** Tất cả sản phẩm CÒN SỐNG, compatibility view cho UI cũ. */
export async function getAllProducts(): Promise<Product[]> {
  const records = (await listProducts()).map((value, index) =>
    normalizeProductRecord(value as ProductInput, index + 1),
  );
  return records
    .filter((value) => !value.deleted && !value.deletedAt)
    .map(toLegacyProduct)
    .sort((a, b) => a.ma.localeCompare(b.ma));
}

/** Sort by manual drag order first (sortOrder), then code for any not yet ordered. */
function byManualOrder(a: ProductRecord, b: ProductRecord): number {
  const ao = Number.isFinite(a.sortOrder as number) ? (a.sortOrder as number) : Number.POSITIVE_INFINITY;
  const bo = Number.isFinite(b.sortOrder as number) ? (b.sortOrder as number) : Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.code.localeCompare(b.code);
}

/** Tất cả ProductRecord kể cả tombstone — compatibility cho migration/admin. */
export async function getAllProductsRaw(): Promise<ProductRecord[]> {
  return (await listProductsRaw())
    .map((value, index) => normalizeProductRecord(value as ProductInput, index + 1))
    .sort(byManualOrder);
}

/**
 * Persist a manual catalogue order. `orderedIds` is the full alive-product list in the
 * desired order; each gets sortOrder = its index (and a fresh updatedAt so the order syncs).
 */
export async function reorderProducts(orderedIds: string[]): Promise<void> {
  const stamp = nowIso();
  const byId = new Map((await listProducts()).map((product) => [product.id, product]));
  const reordered = orderedIds.flatMap((id, index) => {
    const value = byId.get(id);
    return value ? [{ ...normalizeProductRecord(value as ProductInput), sortOrder: index, updatedAt: stamp }] : [];
  });
  await upsertProductsBatch(reordered);
  notifyProductsChanged();
}

export async function getProductRecord(id: string): Promise<ProductRecord | null> {
  const value = await getProductById(id);
  return value ? normalizeProductRecord(value as ProductInput) : null;
}

export async function getProduct(id: string): Promise<Product | null> {
  const record = await getProductRecord(id);
  return record ? toLegacyProduct(record) : null;
}

/** Tạo/sửa sản phẩm. Persist ProductRecord; trả compatibility Product cho UI cũ. */
export async function saveProduct(
  p: ProductInput & { id?: string; updatedAt?: string },
): Promise<Product> {
  const id = normalizeString(p.id, crypto.randomUUID());
  const existing = await getProductById(id);
  const numericId = existing
    ? normalizeProductRecord(existing as ProductInput).numericId
    : await getNextNumericId();
  const saved = normalizeProductRecord(
    {
      ...p,
      id,
      numericId: p.numericId ?? numericId,
      updatedAt: nowIso(),
    },
    numericId,
  );
  await upsertProduct(saved);
  notifyProductsChanged();
  return toLegacyProduct(saved);
}

/** Xoá mềm trực tiếp trên Supabase. */
export async function deleteProduct(id: string): Promise<void> {
  const existing = await getProductRecord(id);
  if (!existing) return;
  const deletedAt = existing.deletedAt ?? nowIso();
  await upsertProduct({
    ...existing,
    deleted: true,
    deletedAt,
    updatedAt: deletedAt,
  } satisfies ProductRecord);
  notifyProductsChanged();
}

/**
 * Adjust active product prices in one batched Supabase operation.
 * Tombstones are deliberately skipped so deleted products are never revived
 * or mutated by a catalogue-wide price operation.
 */
export async function bulkAdjustProductPrices(percent: number): Promise<ProductRecord[]> {
  if (!Number.isFinite(percent)) throw new Error('Phần trăm điều chỉnh không hợp lệ.');
  const all = await getAllProductsRaw();
  const active = all.filter((product) => !product.deleted && !product.deletedAt);
  const updated = active.map((product) => ({
    ...product,
    unitPriceVnd: Math.max(0, Math.round(product.unitPriceVnd * (1 + percent / 100))),
    updatedAt: nowIso(),
  }));
  await upsertProductsBatch(updated);
  notifyProductsChanged();
  return updated;
}

/** Compatibility bulk write; persists directly to Supabase. */
export async function bulkPut(products: ProductRecord[]): Promise<void> {
  let fallback = 1;
  const records = products.map((product) =>
    normalizeProductRecord(product as ProductInput, product.numericId || fallback++),
  );
  await upsertProductsBatch(records);
  notifyProductsChanged();
}

/** @deprecated Browser persistence no longer exists. */
export async function _clearAll(): Promise<void> {
  return Promise.resolve();
}

/**
 * @deprecated Compatibility facade for older imports. It talks to Supabase and
 * never creates browser storage. New code should use the functions above.
 */
export const productStore = {
  async getItem<T>(id: string): Promise<T | null> {
    return (await getProductById(id)) as T | null;
  },
  async setItem<T>(id: string, value: T): Promise<T> {
    if (value && typeof value === 'object') {
      const record = normalizeProductRecord({ ...(value as ProductInput), id });
      await upsertProduct(record);
    }
    return value;
  },
  async iterate<T, U>(iterator: (value: T, key: string) => U | void): Promise<U | undefined> {
    for (const record of await listProductsRaw()) {
      const result = iterator(record as T, record.id);
      if (result !== undefined) return result;
    }
    return undefined;
  },
  async clear(): Promise<void> {
    await _clearAll();
  },
};
