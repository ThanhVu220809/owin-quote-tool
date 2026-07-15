/**
 * Build accessory package catalogs from existing products.
 * Goal: suggest item NAMES by package set name; never force unit prices
 * (prices vary per entry / job).
 */
import type { ProductRecord } from '@/types/models';
import { normalizeSuggestionText } from './suggestionEngine';
import { suggestFixedAccessories } from './quote-engine/fixed-accessory-rules';

export interface PackageItemTemplate {
  name: string;
  /** Typical quantity when known from history; never a price. */
  quantity: number;
  usedCount: number;
}

export interface AccessoryPackageTemplate {
  name: string;
  items: PackageItemTemplate[];
  usedCount: number;
}

function parsePackage(raw: string | null | undefined): { name: string; items: Array<{ name: string; quantity: number }> } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      items?: Array<{ name?: unknown; quantity?: unknown }>;
    };
    const name = String(parsed.name || '').trim();
    if (!name) return null;
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => ({
            name: String(item.name || '').trim(),
            quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
          }))
          .filter((item) => item.name)
      : [];
    return { name, items };
  } catch {
    return null;
  }
}

/** Canonical package templates learned from the catalogue (most frequent item names). */
export function buildAccessoryPackageCatalog(products: readonly ProductRecord[]): AccessoryPackageTemplate[] {
  type Acc = {
    name: string;
    usedCount: number;
    items: Map<string, { name: string; quantityVotes: Map<number, number>; usedCount: number }>;
  };
  const byKey = new Map<string, Acc>();

  for (const product of products) {
    const pkg = parsePackage(product.fixedAccessoryPackage);
    if (!pkg) continue;
    const key = normalizeSuggestionText(pkg.name);
    let acc = byKey.get(key);
    if (!acc) {
      acc = { name: pkg.name, usedCount: 0, items: new Map() };
      byKey.set(key, acc);
    }
    acc.usedCount += 1;
    // Prefer the most common display casing/spacing of the package name.
    if (pkg.name.length > acc.name.length) acc.name = pkg.name;

    for (const item of pkg.items) {
      const itemKey = normalizeSuggestionText(item.name);
      let row = acc.items.get(itemKey);
      if (!row) {
        row = { name: item.name, quantityVotes: new Map(), usedCount: 0 };
        acc.items.set(itemKey, row);
      }
      row.usedCount += 1;
      if (item.name.length > row.name.length) row.name = item.name;
      row.quantityVotes.set(item.quantity, (row.quantityVotes.get(item.quantity) || 0) + 1);
    }
  }

  return Array.from(byKey.values())
    .map((pkg) => {
      const items = Array.from(pkg.items.values())
        .map((item) => {
          let bestQty = 0;
          let bestVotes = -1;
          for (const [qty, votes] of item.quantityVotes) {
            if (votes > bestVotes) {
              bestVotes = votes;
              bestQty = qty;
            }
          }
          return {
            name: item.name,
            quantity: bestQty,
            usedCount: item.usedCount,
          } satisfies PackageItemTemplate;
        })
        // Keep items that appear in ≥30% of packages with this name (or at least once if rare).
        .filter((item) => item.usedCount >= Math.max(1, Math.ceil(pkg.usedCount * 0.3)))
        .sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name, 'vi'));

      return {
        name: pkg.name,
        items,
        usedCount: pkg.usedCount,
      } satisfies AccessoryPackageTemplate;
    })
    .sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name, 'vi'));
}

/** Lookup items for a package name: catalogue first, then built-in rules. NAMES only. */
export function resolvePackageItemsByName(
  packageName: string,
  catalog: readonly AccessoryPackageTemplate[],
): Array<{ name: string; quantity: number }> {
  const name = packageName.trim();
  if (!name) return [];
  const key = normalizeSuggestionText(name);

  const fromCatalog = catalog.find((pkg) => normalizeSuggestionText(pkg.name) === key);
  if (fromCatalog && fromCatalog.items.length > 0) {
    return fromCatalog.items.map((item) => ({ name: item.name, quantity: item.quantity }));
  }

  // Partial match: package name contains catalog name or vice versa.
  const partial = catalog
    .filter((pkg) => {
      const pkgKey = normalizeSuggestionText(pkg.name);
      return pkgKey.includes(key) || key.includes(pkgKey);
    })
    .sort((a, b) => b.usedCount - a.usedCount)[0];
  if (partial?.items.length) {
    return partial.items.map((item) => ({ name: item.name, quantity: item.quantity }));
  }

  const rules = suggestFixedAccessories(name);
  return rules.map((item) => ({ name: item.name, quantity: Number(item.quantity) || 0 }));
}

/**
 * Accessory names that appear outside any known package set ("lạc loài")
 * — useful to fold back into a standard package.
 */
export function findOrphanAccessoryNames(
  products: readonly ProductRecord[],
  catalog: readonly AccessoryPackageTemplate[],
): string[] {
  const known = new Set<string>();
  // Package titles themselves are not orphan item names.
  for (const pkg of catalog) {
    known.add(normalizeSuggestionText(pkg.name));
    for (const item of pkg.items) {
      known.add(normalizeSuggestionText(item.name));
    }
  }
  for (const ruleName of [
    'Bản Lề Sàn Alder',
    'Bản Lề Sàn',
    'Ngỗng Trên Dưới',
    'Tay Nắm KOLN',
    'Tay Nắm',
    'Khóa Bi Ngang',
    'Chốt Cánh Phụ',
    'Vật Tư Phụ',
    'Vật tư phụ',
    'Khóa Đơn Điểm',
    'Bản Lề',
    'Bản Lề Cối',
    'Khóa Đa Điểm',
    'Bánh Xe',
    'Chốt Sập',
    'Khóa',
    'Tay Đa Điểm',
    'Thanh Chuyển Động Đa Điểm',
    'Bộ Chuyển Động 5 Thứ',
    'Bản Lề Chữ A',
    'Tay Đơn Điểm',
  ]) {
    known.add(normalizeSuggestionText(ruleName));
  }

  const looksLikePackageTitle = (name: string) =>
    /^b[oộ]\s+ph[uụ]\s*ki[eệ]n/i.test(name) || /^bộ\s+/i.test(name);

  const orphanCounts = new Map<string, { name: string; count: number }>();
  for (const product of products) {
    const pkg = parsePackage(product.fixedAccessoryPackage);
    const names = [
      ...(pkg?.items.map((i) => i.name) ?? []),
      ...product.accessories.map((a) => a.name),
    ];
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name || looksLikePackageTitle(name)) continue;
      const key = normalizeSuggestionText(name);
      if (known.has(key)) continue;
      const prev = orphanCounts.get(key);
      if (prev) prev.count += 1;
      else orphanCounts.set(key, { name, count: 1 });
    }
  }

  return Array.from(orphanCounts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
    .map((row) => row.name);
}

/** True when the draft only has blank / default placeholder items (safe to replace). */
export function isBlankOrDefaultPackageItems(
  items: ReadonlyArray<{ name: string }>,
): boolean {
  const named = items.map((item) => item.name.trim()).filter(Boolean);
  if (named.length === 0) return true;
  if (named.length === 1 && normalizeSuggestionText(named[0]) === normalizeSuggestionText('Vật tư phụ')) {
    return true;
  }
  return false;
}
