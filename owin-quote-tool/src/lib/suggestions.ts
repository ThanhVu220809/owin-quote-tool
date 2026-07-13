import type { ProductRecord, QuoteInput, SuggestionRecord } from '@/types/models';
import importedProducts from '@/data/imported/products.json';
import importedQuotes from '@/data/imported/quotes.json';
import importedSuggestions from '@/data/imported/suggestions.json';
import {
  getHostedSuggestion,
  getHostedSuggestionsByIds,
  listHostedSuggestions,
  upsertHostedSuggestions,
} from '@/features/supabase/sharedDataRepo';
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

function seedSuggestionValue(
  records: Map<string, SuggestionRecord>,
  type: string,
  value: unknown,
  usedCount: number,
  createdAt: string,
): void {
  const text = normalizeValue(value);
  if (!type || !text) return;
  const id = suggestionId(type, text);
  const existing = records.get(id);
  if (existing && existing.usedCount >= usedCount) return;
  records.set(id, {
    id,
    type,
    value: text,
    usedCount,
    createdAt,
    updatedAt: createdAt,
  });
}

function seedSuggestionEntries(
  records: Map<string, SuggestionRecord>,
  entries: Array<[SuggestionType, unknown]>,
  usedCount: number,
  createdAt: string,
): void {
  const deduped = new Map<string, [SuggestionType, string]>();
  for (const [type, value] of entries) {
    const text = normalizeValue(value);
    if (!type || !text) continue;
    const id = suggestionId(type, text);
    if (!deduped.has(id)) deduped.set(id, [type, text]);
  }
  for (const [type, value] of deduped.values()) {
    seedSuggestionValue(records, type, value, usedCount, createdAt);
  }
}

function buildSeedSuggestionRecords(): SuggestionRecord[] {
  const records = new Map<string, SuggestionRecord>();
  const createdAt = nowIso();
  for (const [path, values] of Object.entries(seedModules)) {
    const type = typeFromPath(path);
    for (const value of values || []) {
      seedSuggestionValue(records, type, value, 1, createdAt);
    }
  }
  for (const [type, values] of Object.entries(importedSuggestions as Record<string, string[]>)) {
    for (const value of values || []) {
      seedSuggestionValue(records, type, value, 2, createdAt);
    }
  }
  const importedEntries: Array<[SuggestionType, unknown]> = [
    ...(importedProducts as unknown[]).flatMap((product) =>
      collectProductLikeSuggestionEntries(product as Record<string, unknown>),
    ),
    ...collectImportedQuoteSuggestionEntries(),
  ];
  seedSuggestionEntries(records, importedEntries, 3, createdAt);
  return Array.from(records.values());
}

let seedPromise: Promise<void> | null = null;

export async function seedSuggestionsIfEmpty(): Promise<void> {
  if (!seedPromise) {
    seedPromise = upsertHostedSuggestions(buildSeedSuggestionRecords(), { ignoreExisting: true })
      .catch((error: unknown) => {
        seedPromise = null;
        throw error;
      });
  }
  return seedPromise;
}

export async function getSuggestions(type: SuggestionType, query = ''): Promise<string[]> {
  await seedSuggestionsIfEmpty();
  const aliases = getSuggestionTypeAliases(String(type));
  const out = await listHostedSuggestions(aliases);
  return rankSuggestionCandidates(query, out, 60).map((item) => item.value);
}

export async function getSuggestionMap(types: SuggestionType[]): Promise<Record<string, string[]>> {
  if (types.length === 0) return {};
  await seedSuggestionsIfEmpty();
  const aliasesByType = new Map(types.map((type) => [type, getSuggestionTypeAliases(String(type))]));
  const allAliases = Array.from(new Set(Array.from(aliasesByType.values()).flat()));
  const allRecords = await listHostedSuggestions(allAliases);
  const entries = types.map((type) => {
    const aliases = new Set(aliasesByType.get(type) ?? []);
    const records = allRecords.filter((record) => aliases.has(record.type));
    return [type, rankSuggestionCandidates('', records, 60).map((item) => item.value)] as const;
  });
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
  await rememberSuggestions([[type, value]]);
}

export async function rememberSuggestions(entries: Array<[SuggestionType, unknown]>): Promise<void> {
  await seedSuggestionsIfEmpty();
  const pending = new Map<string, { type: SuggestionType; value: string; count: number }>();
  for (const [type, value] of entries) {
    const text = normalizeValue(value);
    if (!type || !text) continue;
    const id = suggestionId(type, text);
    const existing = pending.get(id);
    if (existing) existing.count += 1;
    else pending.set(id, { type, value: text, count: 1 });
  }
  if (pending.size === 0) return;

  const existing = await getHostedSuggestionsByIds(Array.from(pending.keys()));
  const timestamp = nowIso();
  const records = Array.from(pending, ([id, next]) => {
    const current = existing.get(id);
    return {
      id,
      type: String(next.type),
      value: next.value,
      usedCount: (current?.usedCount || 0) + next.count,
      createdAt: current?.createdAt || timestamp,
      updatedAt: timestamp,
    } satisfies SuggestionRecord;
  });
  await upsertHostedSuggestions(records);
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
  return listHostedSuggestions();
}

export async function bulkPutSuggestions(records: SuggestionRecord[]): Promise<void> {
  await upsertHostedSuggestions(records);
}

/** Supabase-backed compatibility surface retained for older callers. */
export const suggestionStore = {
  async getItem<T>(key: string): Promise<T | null> {
    return await getHostedSuggestion(key) as T | null;
  },
  async setItem<T>(key: string, value: T): Promise<T> {
    const record = value as SuggestionRecord;
    await upsertHostedSuggestions([{ ...record, id: key }]);
    return value;
  },
  async iterate<T, U>(
    iterator: (value: T, key: string, iterationNumber: number) => U,
  ): Promise<U | undefined> {
    const records = await listHostedSuggestions();
    for (let index = 0; index < records.length; index += 1) {
      const result = iterator(records[index] as T, records[index].id, index + 1);
      if (result !== undefined) return result;
    }
    return undefined;
  },
};
