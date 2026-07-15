import { describe, expect, it } from 'vitest';
import type { ProductRecord } from '@/types/models';
import {
  buildAccessoryPackageCatalog,
  findOrphanAccessoryNames,
  isBlankOrDefaultPackageItems,
  resolvePackageItemsByName,
} from './accessoryPackages';

function product(partial: Partial<ProductRecord> & { fixedAccessoryPackage?: string | null }): ProductRecord {
  return {
    id: partial.id || 'p1',
    numericId: 1,
    code: 'P1',
    name: partial.name || 'Sản phẩm',
    slug: 'sp',
    category: 'Cửa',
    unit: 'M2',
    unitPriceVnd: 1_000_000,
    shortDesc: null,
    coverImagePath: null,
    gallery: [],
    rawSizeText: null,
    rawPriceText: null,
    specs: [],
    accessories: partial.accessories || [],
    fixedAccessoryPackage: partial.fixedAccessoryPackage ?? null,
    extraAccessories: '[]',
    isFeatured: false,
    isPublic: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('accessoryPackages', () => {
  it('builds catalog by package name and keeps most common item names (no prices)', () => {
    const products = [
      product({
        fixedAccessoryPackage: JSON.stringify({
          name: 'Bộ Phụ Kiện Cửa Thủy Lực',
          items: [
            { name: 'Khóa Bi Ngang', quantity: 0 },
            { name: 'Bản Lề Sàn', quantity: 0 },
            { name: 'Vật Tư Phụ', quantity: 0 },
          ],
          unitPrice: 10_000_000,
        }),
      }),
      product({
        id: 'p2',
        fixedAccessoryPackage: JSON.stringify({
          name: 'Bộ Phụ Kiện Cửa Thủy Lực',
          items: [
            { name: 'Khóa Bi Ngang', quantity: 0 },
            { name: 'Bản Lề Sàn', quantity: 0 },
            { name: 'Tay Nắm', quantity: 0 },
            { name: 'Vật Tư Phụ', quantity: 0 },
          ],
          unitPrice: 9_000_000,
        }),
      }),
    ];

    const catalog = buildAccessoryPackageCatalog(products);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].name).toMatch(/Thủy Lực/i);
    expect(catalog[0].items.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Khóa Bi Ngang', 'Bản Lề Sàn', 'Vật Tư Phụ']),
    );
    // Price must never appear on the template.
    expect(JSON.stringify(catalog[0])).not.toMatch(/9000000|10000000/);
  });

  it('resolves package items from catalog then built-in rules', () => {
    const catalog = buildAccessoryPackageCatalog([
      product({
        fixedAccessoryPackage: JSON.stringify({
          name: 'Bộ Phụ Kiện Kinlong Chính Hãng',
          items: [
            { name: 'Tay Đa Điểm', quantity: 0 },
            { name: 'Bản Lề Chữ A', quantity: 0 },
          ],
        }),
      }),
    ]);

    const fromCatalog = resolvePackageItemsByName('Bộ Phụ Kiện Kinlong Chính Hãng', catalog);
    expect(fromCatalog.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Tay Đa Điểm', 'Bản Lề Chữ A']),
    );

    const fromRules = resolvePackageItemsByName('Cửa Thủy Lực VIP', []);
    expect(fromRules.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Bản Lề Sàn Alder', 'Tay Nắm KOLN']),
    );
  });

  it('detects orphan accessory names not in any package set', () => {
    const products = [
      product({
        fixedAccessoryPackage: JSON.stringify({
          name: 'Bộ A',
          items: [{ name: 'Khóa', quantity: 0 }, { name: 'Phụ kiện lạ XYZ', quantity: 0 }],
        }),
      }),
    ];
    const catalog = buildAccessoryPackageCatalog(products);
    // "Phụ kiện lạ XYZ" is in the only package, so it is known in catalog.
    // Seed an orphan via legacy accessories list.
    const withOrphan = [
      ...products,
      product({
        id: 'p3',
        accessories: [{ name: 'Ray trượt custom 999', quantityPerSet: 1, unitPriceVnd: 1, note: null }],
        fixedAccessoryPackage: null,
      }),
    ];
    const orphans = findOrphanAccessoryNames(withOrphan, catalog);
    expect(orphans.some((name) => /Ray trượt custom/i.test(name))).toBe(true);
  });

  it('recognizes blank/default package items', () => {
    expect(isBlankOrDefaultPackageItems([])).toBe(true);
    expect(isBlankOrDefaultPackageItems([{ name: '' }, { name: '  ' }])).toBe(true);
    expect(isBlankOrDefaultPackageItems([{ name: 'Vật tư phụ' }])).toBe(true);
    expect(isBlankOrDefaultPackageItems([{ name: 'Khóa' }, { name: 'Bản lề' }])).toBe(false);
  });
});
