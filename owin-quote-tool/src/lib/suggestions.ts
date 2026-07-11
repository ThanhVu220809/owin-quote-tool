import localforage from 'localforage';
import { notifyLocalDataChanged } from './dataChangeEvents';
import type { ProductRecord, QuoteInput, SuggestionRecord } from '@/types/models';
import importedProducts from '@/data/imported/products.json';
import importedQuotes from '@/data/imported/quotes.json';
import importedSuggestions from '@/data/imported/suggestions.json';
import { normalizeSuggestionText, rankSuggestionCandidates } from './suggestionEngine';

export const SUGGESTION_TYPES = [
  'accessory_name',
  'accessory_package_name',
  /** Fixed package item names (Khóa, Bản lề…) — not mixed with extras. */
  'fixed_accessory_item',
  /** Extra/phụ kiện phát sinh names (Phào, Nẹp…) — not mixed with fixed package. */
  'extra_accessory_name',
  'jamb',
  'category',
  'color',
  'customer_address',
  'customer_name',
  'frame',
  'glass',
  'item_name',
  'molding',
  'product_name',
  'product_type',
  'protection_bar',
  'sash',
  'spec_label',
  'spec_value_color',
  'spec_value_frame',
  'spec_value_jamb',
  'spec_value_glass',
  'spec_value_molding',
  'spec_value_protection_bar',
  'spec_value_sash',
  'spec_value_thickness',
  'spec_value',
  'thickness',
  'unit',
] as const;

export type SuggestionType = (typeof SUGGESTION_TYPES)[number] | string;

/** Field-specific type aliases so dropdowns never fall into one noisy global bucket. */
export const SUGGESTION_TYPE_ALIASES: Record<string, string[]> = {
  category: ['category'],
  product_name: ['product_name', 'item_name'],
  item_name: ['item_name', 'product_name'],
  unit: ['unit'],
  color: ['color', 'spec_value_color'],
  spec_value_color: ['spec_value_color', 'color'],
  frame: ['frame', 'spec_value_frame'],
  spec_value_frame: ['spec_value_frame', 'frame'],
  sash: ['sash', 'spec_value_sash'],
  spec_value_sash: ['spec_value_sash', 'sash'],
  thickness: ['thickness', 'spec_value_thickness'],
  spec_value_thickness: ['spec_value_thickness', 'thickness'],
  glass: ['glass', 'spec_value_glass'],
  spec_value_glass: ['spec_value_glass', 'glass'],
  molding: ['molding', 'spec_value_molding'],
  spec_value_molding: ['spec_value_molding', 'molding'],
  protection_bar: ['protection_bar', 'spec_value_protection_bar'],
  spec_value_protection_bar: ['spec_value_protection_bar', 'protection_bar'],
  // Fixed package items: never mix with extra accessories or package title.
  accessory_name: ['accessory_name', 'fixed_accessory_item'],
  fixed_accessory_item: ['fixed_accessory_item', 'accessory_name'],
  accessory_package_name: ['accessory_package_name'],
  jamb: ['jamb', 'spec_value_jamb'],
  spec_value_jamb: ['spec_value_jamb', 'jamb'],
  // Extra accessories: isolated bucket only.
  extra_accessory_name: ['extra_accessory_name'],
  customer_name: ['customer_name'],
  customer_address: ['customer_address'],
  // Spec keys stay strict presets in UI — do not alias to noisy learned labels.
  spec_label: ['spec_label'],
  spec_value: ['spec_value'],
};

export function getSuggestionTypeAliases(type: string): string[] {
  const trimmed = type.trim();
  return Array.from(new Set([trimmed, ...(SUGGESTION_TYPE_ALIASES[trimmed] || [])].filter(Boolean)));
}

/** Canonical fixed list for technical-spec key dropdowns. Never mix random learned labels. */
export const DEFAULT_SPEC_KEYS = [
  'Màu',
  'Khung Bao',
  'Khuôn Bao',
  'Bản Cánh',
  'Độ Dày',
  'Loại Kính',
  'Phào',
  'Song Nhôm Bảo Vệ',
] as const;

const suggestionStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'suggestions',
  driver: localforage.INDEXEDDB,
  description: 'Suggestion/autocomplete values',
});

const SEED_KEY = '__seeded__';
const REFERENCE_SEED_KEY = '__reference_suggestions_seed_v5__';
const seedModules = import.meta.glob('../data/suggestions/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, string[]>;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeValue(value: unknown): string {
  return String(value || '').trim();
}

function suggestionId(type: SuggestionType, value: string): string {
  return `${type}:${normalizeSuggestionText(value)}`;
}

function typeFromPath(path: string): string {
  return path.split('/').pop()?.replace(/\.json$/, '') || '';
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

function collectProductLikeSuggestionEntries(source: Record<string, unknown>): Array<[SuggestionType, unknown]> {
  const entries: Array<[SuggestionType, unknown]> = [
    ['category', source.category || source.groupName],
    ['item_name', source.itemName || source.productName || source.name],
    ['product_name', source.productName || source.name || source.itemName],
    ['product_type', source.productType],
    ['unit', source.unit],
  ];

  const specs = Array.isArray(source.specs) ? source.specs : [];
  specs.forEach((entry) => {
    const spec = entry as Record<string, unknown>;
    const key = String(spec.key || spec.label || '');
    // Learn into field-specific buckets only — not a noisy global value bag for known keys.
    const valueTypes = suggestionTypesForSpecKey(key);
    valueTypes.forEach((type) => entries.push([type, spec.value]));
  });

  const accessories = Array.isArray(source.accessories) ? source.accessories : [];
  accessories.forEach((entry) => {
    const accessory = entry as Record<string, unknown>;
    // Legacy product.accessories are fixed-package style, not extras.
    entries.push(['fixed_accessory_item', accessory.name || accessory.ten]);
    entries.push(['accessory_name', accessory.name || accessory.ten]);
  });

  entries.push(...collectAccessorySuggestionEntries(
    source.fixedAccessoryPackage as string | null | undefined,
    source.extraAccessories as string | null | undefined,
  ));

  return entries;
}

function collectImportedQuoteSuggestionEntries(): Array<[SuggestionType, unknown]> {
  const entries: Array<[SuggestionType, unknown]> = [];
  (importedQuotes as unknown[]).forEach((quoteValue) => {
    const quote = quoteValue as Record<string, unknown>;
    entries.push(['customer_name', quote.customerName]);
    entries.push(['customer_address', quote.customerAddress]);

    const snapshot = (quote.snapshot as Record<string, unknown> | undefined)
      || parseJsonMaybe<Record<string, unknown> | null>(quote.snapshotJson, null);
    const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
    snapshotItems.forEach((item) => entries.push(...collectProductLikeSuggestionEntries(item as Record<string, unknown>)));

    const quoteItems = Array.isArray(quote.items) ? quote.items : [];
    quoteItems.forEach((itemValue) => {
      const item = itemValue as Record<string, unknown>;
      entries.push(...collectProductLikeSuggestionEntries(item));
      const itemSnapshot = parseJsonMaybe<Record<string, unknown> | null>(item.snapshotJson, null);
      if (itemSnapshot) entries.push(...collectProductLikeSuggestionEntries(itemSnapshot));
    });
  });
  return entries;
}

async function seedSuggestionValue(
  type: string,
  value: unknown,
  usedCount: number,
  createdAt: string,
  overwriteExisting: boolean,
): Promise<void> {
  const text = normalizeValue(value);
  if (!type || !text) return;
  const id = suggestionId(type, text);
  if (!overwriteExisting && await suggestionStore.getItem<SuggestionRecord>(id)) return;
  await suggestionStore.setItem<SuggestionRecord>(id, {
    id,
    type,
    value: text,
    usedCount,
    createdAt,
    updatedAt: createdAt,
  });
}

async function seedSuggestionEntries(
  entries: Array<[SuggestionType, unknown]>,
  usedCount: number,
  createdAt: string,
  overwriteExisting: boolean,
): Promise<void> {
  const deduped = new Map<string, [SuggestionType, string]>();
  for (const [type, value] of entries) {
    const text = normalizeValue(value);
    if (!type || !text) continue;
    const id = suggestionId(type, text);
    if (!deduped.has(id)) deduped.set(id, [type, text]);
  }
  for (const [type, value] of deduped.values()) {
    await seedSuggestionValue(type, value, usedCount, createdAt, overwriteExisting);
  }
}

export async function seedSuggestionsIfEmpty(): Promise<void> {
  const seeded = await suggestionStore.getItem<boolean>(SEED_KEY);
  const referenceSeeded = await suggestionStore.getItem<boolean>(REFERENCE_SEED_KEY);
  const createdAt = nowIso();
  for (const [path, values] of Object.entries(seedModules)) {
    const type = typeFromPath(path);
    for (const value of values || []) {
      await seedSuggestionValue(type, value, 1, createdAt, false);
    }
  }
  for (const [type, values] of Object.entries(importedSuggestions as Record<string, string[]>)) {
    for (const value of values || []) {
      await seedSuggestionValue(type, value, 2, createdAt, !seeded);
    }
  }
  if (!referenceSeeded) {
    const importedEntries: Array<[SuggestionType, unknown]> = [
      ...(importedProducts as unknown[]).flatMap((product) =>
        collectProductLikeSuggestionEntries(product as Record<string, unknown>),
      ),
      ...collectImportedQuoteSuggestionEntries(),
    ];
    await seedSuggestionEntries(importedEntries, 3, createdAt, !seeded);
    await suggestionStore.setItem(REFERENCE_SEED_KEY, true);
  }
  await suggestionStore.setItem(SEED_KEY, true);
}

export async function getSuggestions(type: SuggestionType, query = ''): Promise<string[]> {
  await seedSuggestionsIfEmpty();
  const aliases = new Set(getSuggestionTypeAliases(String(type)));
  const out: SuggestionRecord[] = [];
  await suggestionStore.iterate<SuggestionRecord | boolean, void>((value, key) => {
    if (key === SEED_KEY || key === REFERENCE_SEED_KEY || !value || typeof value === 'boolean') return;
    if (aliases.has(value.type)) out.push(value);
  });
  return rankSuggestionCandidates(query, out, 60).map((item) => item.value);
}

export async function getSuggestionMap(types: SuggestionType[]): Promise<Record<string, string[]>> {
  const entries = await Promise.all(types.map(async (type) => [type, await getSuggestions(type)] as const));
  return Object.fromEntries(entries);
}

/** Merge field-specific pools (e.g. color + spec_value_color) without a global bucket. */
export function mergeSuggestionLists(...lists: Array<string[] | undefined>): string[] {
  const byNormalized = new Map<string, string>();
  for (const list of lists) {
    for (const value of list || []) {
      const text = String(value || '').trim();
      if (!text) continue;
      const key = normalizeSuggestionText(text);
      if (!byNormalized.has(key)) byNormalized.set(key, text);
    }
  }
  return Array.from(byNormalized.values());
}

export function suggestionTypesForSpecKey(key: string): SuggestionType[] {
  const normalized = key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('mau')) return ['color', 'spec_value_color'];
  if (normalized.includes('song') || normalized.includes('bao ve')) {
    return ['protection_bar', 'spec_value_protection_bar'];
  }
  if (normalized.includes('khuon')) return ['jamb', 'spec_value_jamb'];
  if (normalized.includes('khung')) return ['frame', 'spec_value_frame'];
  if (normalized.includes('canh')) return ['sash', 'spec_value_sash'];
  if (normalized.includes('day')) return ['thickness', 'spec_value_thickness'];
  if (normalized.includes('kinh')) return ['glass', 'spec_value_glass'];
  if (normalized.includes('phao')) return ['molding', 'spec_value_molding'];
  return ['spec_value'];
}

export async function rememberSuggestion(type: SuggestionType, value: unknown): Promise<void> {
  const text = normalizeValue(value);
  if (!text) return;
  await seedSuggestionsIfEmpty();
  const id = suggestionId(type, text);
  const existing = await suggestionStore.getItem<SuggestionRecord>(id);
  const timestamp = nowIso();
  await suggestionStore.setItem<SuggestionRecord>(id, {
    id,
    type,
    value: text,
    usedCount: (existing?.usedCount || 0) + 1,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  });
  notifyLocalDataChanged();
}

export async function rememberSuggestions(entries: Array<[SuggestionType, unknown]>): Promise<void> {
  for (const [type, value] of entries) {
    await rememberSuggestion(type, value);
  }
}

function collectAccessorySuggestionEntries(
  fixedAccessoryPackage: string | null | undefined,
  extraAccessories: string | null | undefined,
): Array<[SuggestionType, unknown]> {
  const entries: Array<[SuggestionType, unknown]> = [];
  if (fixedAccessoryPackage) {
    try {
      const fixed = JSON.parse(fixedAccessoryPackage) as {
        name?: unknown;
        items?: Array<{ name?: unknown }>;
      };
      entries.push(['accessory_package_name', fixed.name]);
      fixed.items?.forEach((item) => {
        entries.push(['fixed_accessory_item', item.name]);
        entries.push(['accessory_name', item.name]);
      });
    } catch {
      // Malformed JSON should not block suggestion learning.
    }
  }
  if (extraAccessories) {
    try {
      const extras = JSON.parse(extraAccessories) as Array<{ name?: unknown }>;
      if (Array.isArray(extras)) {
        // Extras only learn into extra_accessory_name — never pollute fixed package.
        extras.forEach((item) => entries.push(['extra_accessory_name', item.name]));
      }
    } catch {
      // Malformed JSON should not block suggestion learning.
    }
  }
  return entries;
}

export async function rememberProductSuggestions(product: ProductRecord): Promise<void> {
  const entries: Array<[SuggestionType, unknown]> = [
    ['category', product.category],
    ['product_name', product.name],
    ['item_name', product.name],
    ['unit', product.unit],
  ];
  product.specs.forEach((spec) => {
    suggestionTypesForSpecKey(spec.key).forEach((type) => entries.push([type, spec.value]));
  });
  product.accessories.forEach((accessory) => {
    entries.push(['fixed_accessory_item', accessory.name]);
    entries.push(['accessory_name', accessory.name]);
  });
  entries.push(...collectAccessorySuggestionEntries(product.fixedAccessoryPackage, product.extraAccessories));
  await rememberSuggestions(entries);
}

export async function rememberQuoteSuggestions(quote: QuoteInput): Promise<void> {
  const entries: Array<[SuggestionType, unknown]> = [
    ['customer_name', quote.customerName],
    ['customer_address', quote.customerAddress],
  ];
  quote.items.forEach((item) => {
    entries.push(['item_name', item.itemName]);
    entries.push(['product_name', item.itemName]);
    entries.push(['product_type', item.productType]);
    entries.push(['category', item.category || item.groupName]);
    entries.push(['unit', item.unit]);
    item.dimensions.forEach((dimension) => entries.push(['unit', dimension.unit || item.unit]));
    item.accessories.forEach((accessory) => {
      entries.push(['fixed_accessory_item', accessory.name]);
      entries.push(['accessory_name', accessory.name]);
    });
    item.specs?.forEach((spec) => {
      // Learn values when present; keys themselves stay strict presets in UI.
      if (String(spec.value || '').trim()) {
        suggestionTypesForSpecKey(spec.key).forEach((type) => entries.push([type, spec.value]));
      }
    });
    entries.push(...collectAccessorySuggestionEntries(item.fixedAccessoryPackage, item.extraAccessories));
  });
  await rememberSuggestions(entries);
}

export async function getAllSuggestionRecords(): Promise<SuggestionRecord[]> {
  await seedSuggestionsIfEmpty();
  const out: SuggestionRecord[] = [];
  await suggestionStore.iterate<SuggestionRecord | boolean, void>((value, key) => {
    if (key === SEED_KEY || key === REFERENCE_SEED_KEY || !value || typeof value === 'boolean') return;
    out.push(value);
  });
  return out;
}

export async function bulkPutSuggestions(records: SuggestionRecord[]): Promise<void> {
  for (const record of records) {
    await suggestionStore.setItem(record.id, record);
  }
}

export { suggestionStore };
