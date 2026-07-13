import type {
  CalculatedQuoteItem,
  QuoteRecord,
  QuoteSnapshotData,
  QuoteStatus,
} from '@/types/models';
import { parseFixedAccessoriesJson, serializeFixedAccessoriesJson } from '@/lib/quote/accessoryDrafts';
import {
  getQuoteById,
  listQuotes,
  listQuotesRaw,
  subscribeToQuotes,
  upsertQuote,
  upsertQuotesBatch,
} from '@/features/supabase/quotesRepo';

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

export async function saveQuoteRecord(input: QuoteInput): Promise<QuoteRecord> {
  const existing = input.id ? await getQuote(input.id) : null;
  const updatedAt = nowIso();
  const record = normalizeQuoteRecord({
    ...existing,
    ...input,
    id: input.id || existing?.id || crypto.randomUUID(),
    createdAt: input.createdAt || existing?.createdAt || updatedAt,
    updatedAt,
  });
  await upsertQuote(record);
  notifyQuotesChanged();
  return record;
}

export async function deleteQuote(id: string): Promise<void> {
  const existing = await getQuote(id);
  if (!existing) return;
  const deletedAt = existing.deletedAt || nowIso();
  await upsertQuote({
    ...existing,
    deletedAt,
    deleted: true,
    updatedAt: deletedAt,
  } satisfies QuoteRecord);
  notifyQuotesChanged();
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
 * and never creates IndexedDB/localforage stores.
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
