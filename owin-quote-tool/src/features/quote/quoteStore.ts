import type {
  CalculatedQuoteItem,
  QuoteRecord,
  QuoteSnapshotData,
  QuoteStatus,
} from '@/types/models';
import { parseFixedAccessoriesJson, serializeFixedAccessoriesJson } from '@/lib/quote/accessoryDrafts';
import {
  compareAndSwapQuote,
  getQuoteById,
  listQuotes,
  listQuotesRaw,
  subscribeToQuotes,
  upsertQuote,
  upsertQuotesBatch,
} from '@/features/supabase/quotesRepo';
import {
  documentsEqual,
  mergeAppendOnlyById,
  mergeTopLevel,
} from '@/features/supabase/threeWayMerge';

type QuoteInput = Partial<QuoteRecord>;

export const QUOTES_CHANGED_EVENT = 'owin-quotes-changed';

const COMPANY_DEFAULT = {
  name: 'HOÀNG ANH OWIN',
  phone: '0799040616',
  email: '',
  address: 'Tiên Điền – Nghi Xuân – Hà Tĩnh',
  logo: 'owin-user-assets/logo/logo.webp',
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  const text = safeString(value);
  return text ? text : null;
}

function parseSnapshot(value: unknown): QuoteSnapshotData | null {
  if (!value) return null;
  if (typeof value === 'object' && 'quoteCode' in value && 'summary' in value) {
    return value as QuoteSnapshotData;
  }
  if (typeof value !== 'string') return null;
  try {
    return parseSnapshot(JSON.parse(value));
  } catch {
    return null;
  }
}

function quoteFolderPath(code: string): string | null {
  const parts = code.split('-');
  const datePart = parts[2];
  if (!datePart || datePart.length < 6) return null;
  return `quotes/${datePart.slice(0, 4)}/${datePart.slice(4, 6)}/${code}`;
}

function normalizeFixedAccessoryPackage(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;
  return serializeFixedAccessoriesJson(parseFixedAccessoriesJson(value, 1));
}

function snapshotItemAliases(item: CalculatedQuoteItem): CalculatedQuoteItem {
  return {
    ...item,
    quoteItemCode: item.quoteItemCode || item.productCode,
    productName: item.productName || item.itemName,
    groupName: item.groupName || item.category || '',
    image: item.image || item.coverImagePath || null,
    coverImagePath: item.coverImagePath || item.image || null,
    categoryImagePath: item.categoryImagePath || item.categoryImage || null,
    categoryImage: item.categoryImage || item.categoryImagePath || null,
    companyLogo: item.companyLogo || null,
    fixedAccessoryPackage: normalizeFixedAccessoryPackage(item.fixedAccessoryPackage),
    mainTotal: item.productSubtotalVnd,
    accessoryTotal: item.accessorySubtotalVnd,
    itemTotal: item.itemTotalVnd,
  };
}

function normalizeQuoteSnapshotData(snapshot: QuoteSnapshotData): QuoteSnapshotData {
  return {
    ...snapshot,
    items: snapshot.items.map(snapshotItemAliases),
  };
}

export function hydrateQuoteSnapshot(input: QuoteInput): QuoteSnapshotData {
  const existing = parseSnapshot(input.snapshot) ?? parseSnapshot(input.snapshotJson);
  if (existing) return normalizeQuoteSnapshotData(existing);

  const code = safeString(input.code, 'OWIN-BG-DRAFT');
  const createdAt = safeString(input.createdAt, nowIso());
  const items = Array.isArray(input.items) ? input.items : [];
  const calculatedItems = items.map((item, index) =>
    snapshotItemAliases({
      sourceType: item.sourceType || 'PRODUCT',
      productId: item.productId || null,
      sourceProductId: item.sourceProductId || item.productId || null,
      productCode: item.productCode || `HM-${String(index + 1).padStart(2, '0')}`,
      quoteItemCode: item.productCode || `HM-${String(index + 1).padStart(2, '0')}`,
      itemName: item.itemName || '',
      category: item.category || null,
      image: item.imagePath || null,
      coverImagePath: item.imagePath || null,
      imageReference: item.imageReference || item.imagePath || null,
      imageOverridePath: item.imageOverridePath || null,
      unit: item.unit || 'M2',
      description: item.description || null,
      unitPriceVnd: safeNumber(item.unitPriceVnd),
      specs: [],
      dimensions: item.dimensions || [],
      accessories: (item.accessories || []).map((accessory) => ({
        enabled: true,
        isEnabled: true,
        name: accessory.name,
        quantityPerSet: accessory.quantityPerSet,
        totalSet: accessory.totalSet,
        unitPriceVnd: accessory.unitPriceVnd,
        lineTotalVnd: accessory.lineTotalVnd,
        note: accessory.note,
      })),
      fixedAccessoryPackage: item.fixedAccessoryPackage,
      extraAccessories: item.extraAccessories,
      productSubtotalVnd: safeNumber(item.productSubtotalVnd),
      accessorySubtotalVnd: safeNumber(item.accessorySubtotalVnd),
      itemTotalVnd: safeNumber(item.itemTotalVnd),
      sortOrder: item.sortOrder ?? index + 1,
    }),
  );

  const subtotalProductVnd = safeNumber(input.subtotalProductVnd);
  const subtotalAccessoryVnd = safeNumber(input.subtotalAccessoryVnd);
  const totalVnd = safeNumber(input.totalVnd, subtotalProductVnd + subtotalAccessoryVnd);
  const depositVnd = safeNumber(input.depositVnd);
  const roundedTotalVnd = safeNumber(input.roundedTotalVnd, totalVnd);
  const balanceVnd = safeNumber(input.balanceVnd, Math.max(0, roundedTotalVnd - depositVnd));

  return {
    quoteCode: code,
    createdAt,
    company: COMPANY_DEFAULT,
    customerId: input.customerId || null,
    customerName: safeString(input.customerName),
    customerPhone: safeString(input.customerPhone),
    customerEmail: nullableString(input.customerEmail),
    customerAddress: safeString(input.customerAddress),
    quoteDate: input.quoteDate || createdAt,
    depositVnd,
    items: calculatedItems,
    summary: {
      subtotalProductVnd,
      subtotalAccessoryVnd,
      totalVnd,
      roundedTotalVnd,
      depositVnd,
      balanceVnd,
    },
  };
}

export function normalizeQuoteRecord(input: QuoteInput): QuoteRecord {
  const id = safeString(input.id, crypto.randomUUID());
  const createdAt = safeString(input.createdAt, nowIso());
  const updatedAt = safeString(input.updatedAt, nowIso());
  const code = safeString(input.code, `OWIN-BG-${createdAt.slice(0, 10).replaceAll('-', '')}-DRAFT`);
  const snapshot = hydrateQuoteSnapshot({ ...input, id, code, createdAt, updatedAt });
  const subtotalProductVnd = safeNumber(input.subtotalProductVnd, snapshot.summary.subtotalProductVnd);
  const subtotalAccessoryVnd = safeNumber(input.subtotalAccessoryVnd, snapshot.summary.subtotalAccessoryVnd);
  const totalVnd = safeNumber(input.totalVnd, snapshot.summary.totalVnd);
  const roundedTotalVnd = safeNumber(input.roundedTotalVnd, snapshot.summary.roundedTotalVnd);
  const depositVnd = safeNumber(input.depositVnd, snapshot.depositVnd);
  const balanceVnd = safeNumber(input.balanceVnd, Math.max(0, roundedTotalVnd - depositVnd));

  const revision = Number(input.revision);
  return {
    id,
    code,
    customerId: input.customerId || null,
    customerName: safeString(input.customerName, snapshot.customerName),
    customerPhone: safeString(input.customerPhone, snapshot.customerPhone),
    customerEmail: nullableString(input.customerEmail ?? snapshot.customerEmail),
    customerAddress: safeString(input.customerAddress, snapshot.customerAddress),
    quoteDate: nullableString(input.quoteDate ?? snapshot.quoteDate),
    depositVnd,
    subtotalProductVnd,
    subtotalAccessoryVnd,
    totalVnd,
    roundedTotalVnd,
    balanceVnd,
    status: (input.status as QuoteStatus | undefined) ?? 'SAVED',
    snapshot,
    snapshotJson: JSON.stringify(snapshot),
    items: Array.isArray(input.items)
      ? input.items.map((item) => ({
          ...item,
          sourceProductId: item.sourceProductId || item.productId || null,
          imageReference: item.imageReference || item.imagePath || null,
          imageOverridePath: item.imageOverridePath || null,
          fixedAccessoryPackage: normalizeFixedAccessoryPackage(item.fixedAccessoryPackage),
        }))
      : [],
    exports: Array.isArray(input.exports) ? input.exports : [],
    folderPath: nullableString(input.folderPath) ?? quoteFolderPath(code),
    deletedAt: nullableString(input.deletedAt),
    deleted: Boolean(input.deleted) || undefined,
    createdAt,
    updatedAt,
    revision: Number.isSafeInteger(revision) && revision > 0 ? revision : undefined,
  };
}

function notifyQuotesChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(QUOTES_CHANGED_EVENT));
  }
}

export async function getAllQuotesRaw(): Promise<QuoteRecord[]> {
  return (await listQuotesRaw())
    .map((quote) => normalizeQuoteRecord(quote))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAllQuotes(): Promise<QuoteRecord[]> {
  return (await listQuotes())
    .map((quote) => normalizeQuoteRecord(quote))
    .filter((quote) => !quote.deletedAt && !quote.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getQuote(id: string): Promise<QuoteRecord | null> {
  const value = await getQuoteById(id);
  return value ? normalizeQuoteRecord(value) : null;
}

export interface SaveQuoteOptions {
  /** Document acknowledged when this editor opened or after its previous save. */
  baseRecord?: QuoteRecord | null;
}

const MAX_CAS_ATTEMPTS = 6;

function quoteSnapshotForMergedDocument(
  base: QuoteRecord | null,
  local: QuoteRecord,
  remote: QuoteRecord,
  merged: QuoteRecord,
): QuoteRecord['snapshot'] {
  const localChangedItems = base === null || !documentsEqual(local.items, base.items);
  const itemSnapshot = localChangedItems ? local.snapshot : remote.snapshot;
  return {
    ...itemSnapshot,
    quoteCode: merged.code,
    createdAt: merged.createdAt,
    customerId: merged.customerId,
    customerName: merged.customerName,
    customerPhone: merged.customerPhone,
    customerEmail: merged.customerEmail,
    customerAddress: merged.customerAddress,
    quoteDate: merged.quoteDate ?? merged.createdAt,
    depositVnd: merged.depositVnd,
    summary: {
      ...itemSnapshot.summary,
      subtotalProductVnd: merged.subtotalProductVnd,
      subtotalAccessoryVnd: merged.subtotalAccessoryVnd,
      totalVnd: merged.totalVnd,
      roundedTotalVnd: merged.roundedTotalVnd,
      depositVnd: merged.depositVnd,
      balanceVnd: merged.balanceVnd,
    },
  };
}

/** Merge independent quote fields and retain every append-only export audit entry. */
export function mergeQuoteDocuments(
  base: QuoteRecord | null,
  local: QuoteRecord,
  remote: QuoteRecord,
): QuoteRecord {
  const merged = mergeTopLevel(
    base as unknown as Record<string, unknown> | null,
    local as unknown as Record<string, unknown>,
    remote as unknown as Record<string, unknown>,
    { remoteWins: ['id', 'revision', 'createdAt', 'deleted', 'deletedAt'] },
  ) as unknown as QuoteRecord;
  const localChangedExports = base === null || !documentsEqual(local.exports, base.exports);
  if (localChangedExports) {
    merged.exports = mergeAppendOnlyById(remote.exports ?? [], local.exports ?? []);
  }
  merged.id = remote.id;
  merged.createdAt = remote.createdAt;
  merged.deleted = undefined;
  merged.deletedAt = null;
  merged.revision = remote.revision;
  merged.updatedAt = nowIso();
  merged.snapshot = quoteSnapshotForMergedDocument(base, local, remote, merged);
  merged.snapshotJson = JSON.stringify(merged.snapshot);
  return merged;
}

async function persistQuoteCas(
  initialLocal: QuoteRecord,
  initialBase: QuoteRecord | null,
): Promise<QuoteRecord> {
  let local = initialLocal;
  let base = initialBase;
  let expectedRevision = base?.revision ?? null;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const result = await compareAndSwapQuote(local, expectedRevision);
    if (result.status === 'applied' && result.record) return result.record;
    if (result.status === 'deleted') {
      throw new Error('Báo giá đã bị xoá trên một máy khác và không thể khôi phục từ bản cũ.');
    }
    if (result.status === 'missing') throw new Error('Báo giá không còn tồn tại trên Supabase.');
    if (!result.record?.revision) {
      throw new Error('Không nhận được phiên bản báo giá mới nhất từ Supabase.');
    }
    local = mergeQuoteDocuments(base, local, result.record);
    base = result.record;
    expectedRevision = result.record.revision;
  }
  throw new Error('Báo giá được sửa liên tục trên máy khác. Vui lòng thử lưu lại.');
}

export async function saveQuoteRecord(
  input: QuoteInput,
  options: SaveQuoteOptions = {},
): Promise<QuoteRecord> {
  const currentValue = input.id ? await getQuoteById(input.id) : null;
  const current = currentValue ? normalizeQuoteRecord(currentValue) : null;
  if (current?.deleted || current?.deletedAt) {
    throw new Error('Báo giá đã bị xoá trên một máy khác và không thể khôi phục từ bản cũ.');
  }
  const hasExplicitBase = Object.prototype.hasOwnProperty.call(options, 'baseRecord');
  const base = hasExplicitBase
    ? (options.baseRecord ? normalizeQuoteRecord(options.baseRecord) : null)
    : current;
  const updatedAt = nowIso();
  const record = normalizeQuoteRecord({
    ...(base ?? current ?? {}),
    ...input,
    id: input.id || base?.id || current?.id || crypto.randomUUID(),
    createdAt: current?.createdAt || base?.createdAt || input.createdAt || updatedAt,
    updatedAt,
  });
  const saved = await persistQuoteCas(record, base);
  notifyQuotesChanged();
  return saved;
}

export async function deleteQuote(id: string): Promise<void> {
  const existing = await getQuote(id);
  if (!existing) return;
  if (existing.deleted || existing.deletedAt) return;
  const deletedAt = existing.deletedAt || nowIso();
  let proposal: QuoteRecord = {
    ...existing,
    deletedAt,
    deleted: true,
    updatedAt: deletedAt,
  };
  let expectedRevision = existing.revision ?? null;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const result = await compareAndSwapQuote(proposal, expectedRevision);
    if (result.status === 'applied' || result.status === 'deleted' || result.status === 'missing') {
      notifyQuotesChanged();
      return;
    }
    if (!result.record?.revision) throw new Error('Không nhận được phiên bản báo giá mới nhất.');
    proposal = {
      ...result.record,
      deletedAt,
      deleted: true,
      updatedAt: deletedAt,
    };
    expectedRevision = result.record.revision;
  }
  throw new Error('Báo giá được sửa liên tục trên máy khác. Vui lòng thử xoá lại.');
}

export async function bulkPutQuotes(quotes: QuoteRecord[]): Promise<void> {
  await upsertQuotesBatch(quotes.map((quote) => normalizeQuoteRecord(quote)));
  notifyQuotesChanged();
}

/** @deprecated Browser persistence no longer exists. */
export async function _clearQuotes(): Promise<void> {
  return Promise.resolve();
}

/** Subscribe once and expose a DOM event that screens can use to refresh history. */
export function subscribeToQuoteChanges(onChange?: () => void): () => void {
  return subscribeToQuotes(() => {
    notifyQuotesChanged();
    onChange?.();
  });
}

/**
 * @deprecated Compatibility facade for older imports. It is Supabase-backed
 * and never creates browser-side database stores.
 */
export const quoteStore = {
  async getItem<T>(id: string): Promise<T | null> {
    return (await getQuoteById(id)) as T | null;
  },
  async setItem<T>(id: string, value: T): Promise<T> {
    if (value && typeof value === 'object') {
      await upsertQuote(normalizeQuoteRecord({ ...(value as QuoteInput), id }));
    }
    return value;
  },
  async iterate<T, U>(iterator: (value: T, key: string) => U | void): Promise<U | undefined> {
    for (const record of await listQuotesRaw()) {
      const result = iterator(record as T, record.id);
      if (result !== undefined) return result;
    }
    return undefined;
  },
  async clear(): Promise<void> {
    await _clearQuotes();
  },
};
