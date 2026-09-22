/**
 * Product service backed directly by Supabase.
 *
 * ProductRecord remains the canonical shape and legacy fields are normalized at
 * the UI boundary, but no catalogue data is persisted in browser storage.
 */

import type {
  ProductAccessoryRecord,
  ProductRecord,
  ProductSpecRecord,
  ProductUnit,
} from '@/types/models';
import { parseFixedAccessoriesJson, serializeFixedAccessoriesJson } from '@/lib/quote/accessoryDrafts';
import { notifyProductsChanged } from '@/features/products/productEvents';
import { isProductPublic } from '@/features/products/productVisibility';
import {
  compareAndSwapProduct,
  getProductById,
  adjustHostedProductPrices,
  listProductsRaw,
  upsertProduct,
  upsertProductsBatch,
  setHostedProductOrder,
} from '@/services/supabase/productsRepo';
import { mergeTopLevel } from '@/services/supabase/threeWayMerge';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import { titleCaseVi } from '@/lib/format/titleCase';

const DEFAULT_CATEGORY = 'Khác';

export type ProductInput = {
  id?: string;
  numericId?: number;
  code?: string;
  name?: string;
  slug?: string;
  category?: string;
  unit?: ProductUnit | string;
  unitPriceVnd?: number;
  shortDesc?: string | null;
  coverImagePath?: string | null;
  gallery?: string[];
  rawSizeText?: string | null;
  rawPriceText?: string | null;
  specs?: ProductSpecRecord[];
  accessories?: Array<Partial<ProductAccessoryRecord>>;
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
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Chuẩn hoá mọi biến thể đơn vị (kể cả nhãn hiển thị cũ) về ProductUnit. */
function toProductUnit(value: unknown): ProductUnit {
  if (value === 'Bộ' || value === 'BO') return 'BO';
  if (value === 'md' || value === 'METER') return 'METER';
  return 'M2';
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

function normalizeRawSizeText(input: ProductInput): string | null {
  return hasText(input.rawSizeText) ? input.rawSizeText.trim() : null;
}

function normalizeSpecs(input: ProductInput): ProductSpecRecord[] {
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

  return [];
}

function normalizeAccessories(input: ProductInput): ProductAccessoryRecord[] {
  const items = Array.isArray(input.accessories) ? input.accessories : [];
  return items
    .map((item, index): ProductAccessoryRecord | null => {
      const raw = item as Partial<ProductAccessoryRecord>;
      const name = normalizeString(raw.name);
      if (!name) return null;
      return {
        name,
        quantityPerSet: normalizeNumber(raw.quantityPerSet, 0),
        unitPriceVnd: normalizeNumber(raw.unitPriceVnd, 0),
        note: normalizeNullableString(raw.note),
        sortOrder: normalizeNumber(raw.sortOrder, index),
      };
    })
    .filter((item): item is ProductAccessoryRecord => item !== null);
}

export function normalizeProductRecord(input: ProductInput, numericIdFallback = 1): ProductRecord {
  const name = normalizeString(input.name, 'Sản phẩm');
  const code = normalizeString(input.code ?? input.id, crypto.randomUUID()).toUpperCase();
  const createdAt = normalizeString(input.createdAt, normalizeString(input.updatedAt, nowIso()));
  const updatedAt = normalizeString(input.updatedAt, nowIso());
  const unit = toProductUnit(input.unit);
  const coverImagePath = normalizeNullableString(input.coverImagePath);

  const revision = Number(input.revision);
  return {
    id: normalizeString(input.id, code),
    numericId: normalizeNumber(input.numericId, numericIdFallback),
    code,
    name: titleCaseVi(name) || name,
    slug: normalizeString(input.slug, slugifyVi(name) || code.toLowerCase()),
    category: normalizeCategoryName(normalizeString(input.category, DEFAULT_CATEGORY) || DEFAULT_CATEGORY),
    unit,
    unitPriceVnd: normalizeNumber(input.unitPriceVnd, 0),
    shortDesc: normalizeNullableString(input.shortDesc),
    coverImagePath,
    gallery: Array.isArray(input.gallery) ? input.gallery.map(String).filter(Boolean) : [],
    rawSizeText: normalizeRawSizeText(input),
    rawPriceText: normalizeNullableString(input.rawPriceText),
    specs: normalizeSpecs(input),
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

export interface SaveProductOptions {
  /** Document acknowledged when this editor started (or after its previous save). */
  baseRecord?: ProductRecord | null;
}

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
): Promise<ProductRecord> {
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
  return saved;
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

/**
 * Bật/tắt hiển thị công khai cho toàn bộ sản phẩm đang hoạt động.
 *
 * Trả về số sản phẩm thật sự đổi trạng thái. Sản phẩm đã xoá mềm không bị chạm
 * tới — một thao tác toàn danh mục không được hồi sinh hay sửa tombstone.
 */
export async function bulkSetProductsPublic(isPublic: boolean): Promise<number> {
  // Đọc lại tài liệu mới nhất ngay trước khi ghi. `upsertProductsBatch` ghi đè
  // cả cột `data`, nên nếu dùng bản chụp mà màn hình đang giữ thì mọi sửa đổi
  // từ máy khác kể từ lúc người dùng mở trang sẽ bị xoá sạch. Đọc lại thu hẹp
  // cửa sổ đó về đúng thời gian chạy của thao tác.
  const active = (await getAllProductsRaw()).filter((product) => !product.deleted && !product.deletedAt);
  // Chỉ ghi những dòng thật sự đổi: bấm "ẩn tất cả" khi đã ẩn hết thì không nên
  // bơm ra vài trăm revision mới và vài trăm sự kiện realtime cho các máy khác.
  const changed = active.filter((product) => isProductPublic(product) !== isPublic);
  if (changed.length === 0) return 0;
  await upsertProductsBatch(
    changed.map((product) => normalizeProductRecord(
      { ...product, isPublic, updatedAt: nowIso() } as ProductInput,
      product.numericId,
    )),
  );
  notifyProductsChanged();
  return changed.length;
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
