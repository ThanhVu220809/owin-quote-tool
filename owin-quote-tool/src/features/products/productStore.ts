/**
 * KHO SẢN PHẨM GỐC — IndexedDB/localforage metadata only.
 *
 * The persisted shape is ProductRecord, matching the REFERENCE catalogue/price
 * table structure. Legacy TARGET fields are migrated at read/write boundaries
 * until later phases replace the old UI.
 */

import localforage from 'localforage';
import type {
  Accessory,
  DVT,
  Product,
  ProductAccessoryRecord,
  ProductRecord,
  ProductSpecRecord,
  ProductUnit,
} from '@/types/models';
import initialData from '@/data/initialData.json';
import importedProducts from '@/data/imported/products.json';
import { parseFixedAccessoriesJson, serializeFixedAccessoriesJson } from '@/lib/quote/accessoryDrafts';
import { notifyProductsChanged } from './productEvents';

const productStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'products',
  driver: localforage.INDEXEDDB,
  description: 'Sản phẩm gốc ProductRecord — ảnh nằm ở store riêng',
});

const SEED_FLAG = '__seeded__';
const REFERENCE_SEED_FLAG = '__reference_products_seed_v1__';
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

/** Nạp dữ liệu mẫu lần đầu (chỉ chạy 1 lần), migrate từ schema cũ sang ProductRecord. */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await productStore.getItem<boolean>(SEED_FLAG);
  if (!seeded) {
    let numericId = 1;
    const seedProducts = (importedProducts as ProductInput[]).length > 0
      ? (importedProducts as ProductInput[])
      : (initialData.products as ProductInput[]);
    for (const p of seedProducts) {
      const record = normalizeProductRecord(p, numericId++);
      await productStore.setItem(record.id, record);
    }
    await productStore.setItem(SEED_FLAG, true);
  }
  await importReferenceProductsIfNeeded();
}

async function importReferenceProductsIfNeeded(): Promise<void> {
  if ((importedProducts as ProductInput[]).length === 0) return;

  const existing = await getAllProductsRaw();
  const existingIds = new Set(existing.map((product) => product.id));
  const existingCodes = new Set(existing.map((product) => product.code));
  for (const input of importedProducts as ProductInput[]) {
    const record = normalizeProductRecord(input, existing.length + 1);
    if (existingIds.has(record.id) || existingCodes.has(record.code)) continue;
    await productStore.setItem(record.id, record);
    existingIds.add(record.id);
    existingCodes.add(record.code);
  }
  await productStore.setItem(REFERENCE_SEED_FLAG, true);
}

/** Tất cả sản phẩm CÒN SỐNG, compatibility view cho UI cũ. */
export async function getAllProducts(): Promise<Product[]> {
  const records = await getAllProductsRaw();
  return records
    .filter((value) => !value.deleted && !value.deletedAt)
    .map(toLegacyProduct)
    .sort((a, b) => a.ma.localeCompare(b.ma));
}

/** Tất cả ProductRecord kể cả tombstone — dùng cho sync/migration/test. */
export async function getAllProductsRaw(): Promise<ProductRecord[]> {
  const out: ProductRecord[] = [];
  await productStore.iterate<ProductRecord | ProductInput | boolean, void>((value, key) => {
    if (key === SEED_FLAG || key === REFERENCE_SEED_FLAG || !value || typeof value === 'boolean') return;
    out.push(normalizeProductRecord(value as ProductInput, out.length + 1));
  });
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export async function getProductRecord(id: string): Promise<ProductRecord | null> {
  if (id === SEED_FLAG) return null;
  const value = await productStore.getItem<ProductRecord | ProductInput>(id);
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
  const existing = await productStore.getItem<ProductRecord | ProductInput>(id);
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
  await productStore.setItem(id, saved);
  return toLegacyProduct(saved);
}

/** Xoá mềm: giữ tombstone để sync không hồi sinh. */
export async function deleteProduct(id: string): Promise<void> {
  const existing = await getProductRecord(id);
  if (!existing) return;
  await productStore.setItem(id, {
    ...existing,
    deleted: true,
    deletedAt: existing.deletedAt ?? nowIso(),
    updatedAt: nowIso(),
  } satisfies ProductRecord);
}

/**
 * Adjust active product prices in one atomic-looking store pass.
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
  for (const product of updated) await productStore.setItem(product.id, product);
  notifyProductsChanged();
  return updated;
}

/** Ghi hàng loạt ProductRecord sau merge sync. */
export async function bulkPut(products: ProductRecord[]): Promise<void> {
  let fallback = 1;
  for (const p of products) {
    const record = normalizeProductRecord(p as ProductInput, p.numericId || fallback++);
    await productStore.setItem(record.id, record);
  }
}

/** Dùng cho test: xoá sạch store (kể cả seed flag). */
export async function _clearAll(): Promise<void> {
  await productStore.clear();
}

export { productStore };
