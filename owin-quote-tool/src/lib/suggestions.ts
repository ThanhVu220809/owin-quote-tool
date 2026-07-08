import localforage from 'localforage';
import type { ProductRecord, QuoteInput, SuggestionRecord } from '@/types/models';

export const SUGGESTION_TYPES = [
  'accessory_name',
  'accessory_package_name',
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
  'spec_value_color',
  'spec_value_frame',
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

const suggestionStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'suggestions',
  driver: localforage.INDEXEDDB,
  description: 'Suggestion/autocomplete values',
});

const SEED_KEY = '__seeded__';
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
  return `${type}:${value.toLocaleLowerCase('vi')}`;
}

function typeFromPath(path: string): string {
  return path.split('/').pop()?.replace(/\.json$/, '') || '';
}

export async function seedSuggestionsIfEmpty(): Promise<void> {
  const seeded = await suggestionStore.getItem<boolean>(SEED_KEY);
  if (seeded) return;
  const createdAt = nowIso();
  for (const [path, values] of Object.entries(seedModules)) {
    const type = typeFromPath(path);
    for (const value of values || []) {
      const text = normalizeValue(value);
      if (!type || !text) continue;
      await suggestionStore.setItem<SuggestionRecord>(suggestionId(type, text), {
        id: suggestionId(type, text),
        type,
        value: text,
        usedCount: 1,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }
  await suggestionStore.setItem(SEED_KEY, true);
}

export async function getSuggestions(type: SuggestionType): Promise<string[]> {
  await seedSuggestionsIfEmpty();
  const out: SuggestionRecord[] = [];
  await suggestionStore.iterate<SuggestionRecord | boolean, void>((value, key) => {
    if (key === SEED_KEY || !value || typeof value === 'boolean') return;
    if (value.type === type) out.push(value);
  });
  return out
    .sort((a, b) => b.usedCount - a.usedCount || a.value.localeCompare(b.value, 'vi'))
    .map((item) => item.value);
}

export async function getSuggestionMap(types: SuggestionType[]): Promise<Record<string, string[]>> {
  const entries = await Promise.all(types.map(async (type) => [type, await getSuggestions(type)] as const));
  return Object.fromEntries(entries);
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
}

export async function rememberSuggestions(entries: Array<[SuggestionType, unknown]>): Promise<void> {
  for (const [type, value] of entries) {
    await rememberSuggestion(type, value);
  }
}

function suggestionTypeForSpecKey(key: string): SuggestionType {
  const normalized = key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('mau')) return 'spec_value_color';
  if (normalized.includes('khung')) return 'spec_value_frame';
  if (normalized.includes('canh')) return 'spec_value_sash';
  if (normalized.includes('day')) return 'spec_value_thickness';
  if (normalized.includes('kinh')) return 'spec_value_glass';
  if (normalized.includes('phao')) return 'spec_value_molding';
  if (normalized.includes('song') || normalized.includes('bao ve')) return 'spec_value_protection_bar';
  return 'spec_value';
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
      fixed.items?.forEach((item) => entries.push(['accessory_name', item.name]));
    } catch {
      // Malformed JSON should not block suggestion learning.
    }
  }
  if (extraAccessories) {
    try {
      const extras = JSON.parse(extraAccessories) as Array<{ name?: unknown }>;
      if (Array.isArray(extras)) {
        extras.forEach((item) => entries.push(['accessory_name', item.name]));
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
    ['unit', product.unit],
  ];
  product.specs.forEach((spec) => {
    entries.push(['spec_value', spec.value]);
    entries.push([suggestionTypeForSpecKey(spec.key), spec.value]);
  });
  product.accessories.forEach((accessory) => entries.push(['accessory_name', accessory.name]));
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
    entries.push(['category', item.category || item.groupName]);
    item.accessories.forEach((accessory) => entries.push(['accessory_name', accessory.name]));
    item.specs?.forEach((spec) => entries.push([suggestionTypeForSpecKey(spec.key), spec.value]));
    entries.push(...collectAccessorySuggestionEntries(item.fixedAccessoryPackage, item.extraAccessories));
  });
  await rememberSuggestions(entries);
}

export async function getAllSuggestionRecords(): Promise<SuggestionRecord[]> {
  await seedSuggestionsIfEmpty();
  const out: SuggestionRecord[] = [];
  await suggestionStore.iterate<SuggestionRecord | boolean, void>((value, key) => {
    if (key === SEED_KEY || !value || typeof value === 'boolean') return;
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
