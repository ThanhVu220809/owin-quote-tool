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
  compareAndSwapProduct,
  getProductById,
  adjustHostedProductPrices,
  listProducts,
  listProductsRaw,
  upsertProduct,
  upsertProductsBatch,
  setHostedProductOrder,
} from '@/features/supabase/productsRepo';
import { mergeTopLevel } from '@/features/supabase/threeWayMerge';

const DEFAULT_CATEGORY = 'Khác';

export type ProductInput = {
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
  revision?: number;
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

function imageIdToPath(value: unknown): string | null {
  return normalizeNullableString(value);
}

function imageIdFromPath(value: string | null): string | undefined {
  return value || undefined;
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
    normalizeNullableString(input.coverImagePath) ?? imageIdToPath(input.imageId);

  const revision = Number(input.revision);
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
    revision: Number.isSafeInteger(revision) && revision > 0 ? revision : undefined,
    deleted: Boolean(input.deleted) || undefined,
    deletedAt: normalizeNullableString(input.deletedAt),
  };
}

export function toLegacyProduct(record: ProductRecord): Product {
  const { width, height } = parseRawSize(record.rawSizeText);
  return {
    id: record.id,
    updatedAt: record.updatedAt,
    revision: record.revision,
    deleted: record.deleted,
    deletedAt: record.deletedAt,
    dvt: unitToLegacyDvt(record.unit),
    ten: record.name,
    ma: record.code,
    donGiaGoc: record.unitPriceVnd,
    rongMacDinh: width,
    caoMacDinh: height,
    imageId: imageIdFromPath(record.coverImagePath),
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

/**
 * Allocate a display-only numeric id without listing the whole catalogue.
 * Primary identity is UUID; this value only needs to be unique enough for UI/export.
 */
async function getNextNumericId(): Promise<number> {
  // Prefer a short random+time mix over downloading 100+ product rows per save.
  const timePart = Date.now() % 1_000_000_000;
  const randPart = Math.floor(Math.random() * 900) + 100;
  return timePart * 1000 + randPart;
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
  await setHostedProductOrder(orderedIds);
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

export interface SaveProductOptions {
  /** Document acknowledged when this editor started (or after its previous save). */
  baseRecord?: ProductRecord | null;
}

export type SavedProduct = Product & { record: ProductRecord };

const MAX_CAS_ATTEMPTS = 6;

/** Product-specific 3-way merge: catalogue ordering and identity are server-owned here. */
export function mergeProductDocuments(
  base: ProductRecord | null,
  local: ProductRecord,
  remote: ProductRecord,
): ProductRecord {
  const merged = mergeTopLevel(
    base as unknown as Record<string, unknown> | null,
    local as unknown as Record<string, unknown>,
    remote as unknown as Record<string, unknown>,
    {
      remoteWins: ['id', 'revision', 'numericId', 'createdAt', 'sortOrder', 'deleted', 'deletedAt'],
    },
  ) as unknown as ProductRecord;
  return {
    ...merged,
    id: remote.id,
    numericId: remote.numericId,
    createdAt: remote.createdAt,
    sortOrder: remote.sortOrder,
    deleted: undefined,
    deletedAt: null,
    revision: remote.revision,
    updatedAt: nowIso(),
  };
}

async function persistProductCas(
  initialLocal: ProductRecord,
  initialBase: ProductRecord | null,
): Promise<ProductRecord> {
  let local = initialLocal;
  let base = initialBase;
  let expectedRevision = base?.revision ?? null;

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const result = await compareAndSwapProduct(local, expectedRevision);
    if (result.status === 'applied' && result.record) return result.record;
    if (result.status === 'deleted') {
      throw new Error('Sản phẩm đã bị xoá trên một máy khác và không thể khôi phục từ bản cũ.');
    }
    if (result.status === 'missing') {
      throw new Error('Sản phẩm không còn tồn tại trên Supabase.');
    }
    if (!result.record?.revision) {
      throw new Error('Không nhận được phiên bản sản phẩm mới nhất từ Supabase.');
    }
    local = mergeProductDocuments(base, local, result.record);
    base = result.record;
    expectedRevision = result.record.revision;
  }
  throw new Error('Sản phẩm được sửa liên tục trên máy khác. Vui lòng thử lưu lại.');
}

/** Tạo/sửa sản phẩm bằng CAS; trả cả compatibility view và server ACK document. */
export async function saveProduct(
  p: ProductInput & { id?: string; updatedAt?: string },
  options: SaveProductOptions = {},
): Promise<SavedProduct> {
  const id = normalizeString(p.id, crypto.randomUUID());
  const hasExplicitBase = Object.prototype.hasOwnProperty.call(options, 'baseRecord');
  // Fast path: ProductForm already holds the last ACK as baseRecord — skip an extra GET.
  let current: ProductRecord | null;
  if (hasExplicitBase) {
    current = options.baseRecord && options.baseRecord.id === id
      ? normalizeProductRecord(options.baseRecord as ProductInput)
      : null;
  } else {
    const currentValue = await getProductById(id);
    current = currentValue ? normalizeProductRecord(currentValue as ProductInput) : null;
  }
  if (current?.deleted || current?.deletedAt) {
    throw new Error('Sản phẩm đã bị xoá trên một máy khác và không thể khôi phục từ bản cũ.');
  }
  const base = hasExplicitBase
    ? (options.baseRecord ? normalizeProductRecord(options.baseRecord as ProductInput) : null)
    : current;
  const identitySource = current ?? base;
  const numericId = p.numericId ?? identitySource?.numericId ?? (await getNextNumericId());
  const local = normalizeProductRecord(
    {
      ...(base ?? current ?? {}),
      ...p,
      id,
      numericId,
      // Ordering is changed only by set_product_order; an open form never owns it.
      sortOrder: current?.sortOrder ?? base?.sortOrder ?? p.sortOrder,
      createdAt: current?.createdAt ?? base?.createdAt ?? p.createdAt,
      updatedAt: nowIso(),
    },
    numericId,
  );
  const saved = await persistProductCas(local, base);
  notifyProductsChanged();
  return { ...toLegacyProduct(saved), record: saved };
}

/** Xoá mềm trực tiếp trên Supabase. */
export async function deleteProduct(id: string): Promise<void> {
  const existing = await getProductRecord(id);
  if (!existing) return;
  if (existing.deleted || existing.deletedAt) return;
  const deletedAt = existing.deletedAt ?? nowIso();
  let proposal: ProductRecord = {
    ...existing,
    deleted: true,
    deletedAt,
    updatedAt: deletedAt,
  };
  let expectedRevision = existing.revision ?? null;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const result = await compareAndSwapProduct(proposal, expectedRevision);
    if (result.status === 'applied' || result.status === 'deleted' || result.status === 'missing') {
      notifyProductsChanged();
      return;
    }
    if (!result.record?.revision) throw new Error('Không nhận được phiên bản sản phẩm mới nhất.');
    proposal = {
      ...result.record,
      deleted: true,
      deletedAt,
      updatedAt: deletedAt,
    };
    expectedRevision = result.record.revision;
  }
  throw new Error('Sản phẩm được sửa liên tục trên máy khác. Vui lòng thử xoá lại.');
}

/**
 * Adjust active product prices in one batched Supabase operation.
 * Tombstones are deliberately skipped so deleted products are never revived
 * or mutated by a catalogue-wide price operation.
 */
export async function bulkAdjustProductPrices(percent: number): Promise<ProductRecord[]> {
  if (!Number.isFinite(percent)) throw new Error('Phần trăm điều chỉnh không hợp lệ.');
  await adjustHostedProductPrices(percent);
  notifyProductsChanged();
  return (await getAllProductsRaw()).filter((product) => !product.deleted && !product.deletedAt);
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
