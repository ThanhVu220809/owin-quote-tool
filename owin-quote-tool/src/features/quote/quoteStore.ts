import localforage from 'localforage';
import type {
  CalculatedQuoteItem,
  QuoteRecord,
  QuoteSnapshotData,
  QuoteStatus,
} from '@/types/models';

const quoteStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'quotes',
  driver: localforage.INDEXEDDB,
  description: 'QuoteRecord history with calculated snapshot data',
});

type QuoteInput = Partial<QuoteRecord>;

const COMPANY_DEFAULT = {
  name: 'HOÀNG ANH OWIN',
  phone: '0799040616',
  email: '',
  address: 'Tiên Điền – Nghi Xuân – Hà Tĩnh',
  logo: '/owin-user-assets/logo/logo.webp',
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
    mainTotal: item.productSubtotalVnd,
    accessoryTotal: item.accessorySubtotalVnd,
    itemTotal: item.itemTotalVnd,
  };
}

export function hydrateQuoteSnapshot(input: QuoteInput): QuoteSnapshotData {
  const existing = parseSnapshot(input.snapshot) ?? parseSnapshot(input.snapshotJson);
  if (existing) return existing;

  const code = safeString(input.code, 'OWIN-BG-DRAFT');
  const createdAt = safeString(input.createdAt, nowIso());
  const items = Array.isArray(input.items) ? input.items : [];
  const calculatedItems = items.map((item, index) =>
    snapshotItemAliases({
      sourceType: item.sourceType || 'PRODUCT',
      productId: item.productId || null,
      productCode: item.productCode || `HM-${String(index + 1).padStart(2, '0')}`,
      quoteItemCode: item.productCode || `HM-${String(index + 1).padStart(2, '0')}`,
      itemName: item.itemName || '',
      category: item.category || null,
      image: item.imagePath || null,
      coverImagePath: item.imagePath || null,
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
    items: Array.isArray(input.items) ? input.items : [],
    exports: Array.isArray(input.exports) ? input.exports : [],
    folderPath: nullableString(input.folderPath) ?? quoteFolderPath(code),
    deletedAt: nullableString(input.deletedAt),
    deleted: Boolean(input.deleted) || undefined,
    createdAt,
    updatedAt,
  };
}

export async function getAllQuotesRaw(): Promise<QuoteRecord[]> {
  const out: QuoteRecord[] = [];
  await quoteStore.iterate<QuoteInput, void>((value) => {
    if (value) out.push(normalizeQuoteRecord(value));
  });
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAllQuotes(): Promise<QuoteRecord[]> {
  return (await getAllQuotesRaw()).filter((quote) => !quote.deletedAt && !quote.deleted);
}

export async function getQuote(id: string): Promise<QuoteRecord | null> {
  const value = await quoteStore.getItem<QuoteInput>(id);
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
  await quoteStore.setItem(record.id, record);
  return record;
}

export async function deleteQuote(id: string): Promise<void> {
  const existing = await getQuote(id);
  if (!existing) return;
  await quoteStore.setItem(id, {
    ...existing,
    deletedAt: existing.deletedAt || nowIso(),
    deleted: true,
    updatedAt: nowIso(),
  } satisfies QuoteRecord);
}

export async function bulkPutQuotes(quotes: QuoteRecord[]): Promise<void> {
  for (const quote of quotes) {
    const record = normalizeQuoteRecord(quote);
    await quoteStore.setItem(record.id, record);
  }
}

export async function _clearQuotes(): Promise<void> {
  await quoteStore.clear();
}

export { quoteStore };
