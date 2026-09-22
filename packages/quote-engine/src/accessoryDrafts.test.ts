import { describe, expect, it } from 'vitest';
import {
  addEmptyAccessoryDraft,
  addEmptyFixedAccessoryItem,
  computeAutoPackageQuantity,
  createEmptyFixedAccessoryDraft,
  DEFAULT_FIXED_ACCESSORY_ITEMS,
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  seedFixedPackageFromProduct,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
  syncFixedPackageQuantityToTotalSl,
} from './accessoryDrafts';

describe('fixed accessory draft normalization', () => {
  it('defaults fixed accessory item quantities to zero', () => {
    expect(DEFAULT_FIXED_ACCESSORY_ITEMS.every((item) => item.quantity === 0)).toBe(true);
    expect(DEFAULT_FIXED_ACCESSORY_ITEMS.map((item) => item.name)).toEqual(['Vật tư phụ']);
  });

  it('keeps empty package name while editing (does not collapse editor)', () => {
    const json = serializeFixedAccessoriesJson(
      {
        name: '',
        items: [{ id: 'a1', name: 'Khóa', quantity: 0 }],
        packageQuantity: 1,
        unit: 'BO',
        unitPrice: 0,
        total: 0,
      },
      { keepEmpty: true },
    );
    expect(json).toBeTruthy();
    expect(JSON.parse(json!).name).toBe('');
    expect(JSON.parse(json!).items[0].name).toBe('Khóa');
  });

  it('preserves blank fixed item rows while editing via keepEmpty', () => {
    const draft = createEmptyFixedAccessoryDraft(1);
    const withItem = addEmptyFixedAccessoryItem(draft);
    expect(withItem.items).toHaveLength(2);
    expect(withItem.items.every((item) => item.id)).toBe(true);
    expect(withItem.items.every((item) => item.quantity === 0)).toBe(true);

    const json = serializeFixedAccessoriesJson(withItem, { keepEmpty: true });
    const reparsed = parseFixedAccessoriesJson(json, 1);
    // Blank name rows kept during edit shell.
    expect(reparsed.items.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps a newly added blank món even when the package already has named items', () => {
    // Regression: "Thêm món" used to vanish because parse dropped blank rows when named ones existed.
    const existing = parseFixedAccessoriesJson(JSON.stringify({
      name: 'Bộ phụ kiện cửa',
      items: [
        { id: 'a', name: 'Khóa', quantity: 0 },
        { id: 'b', name: 'Bản lề', quantity: 0 },
      ],
      packageQuantity: 1,
      unitPrice: 800000,
    }));
    const added = addEmptyFixedAccessoryItem(existing);
    const json = serializeFixedAccessoriesJson(added, { keepEmpty: true });
    const reparsed = parseFixedAccessoriesJson(json, 1);
    expect(reparsed.items).toHaveLength(3);
    expect(reparsed.items.filter((item) => item.name === '')).toHaveLength(1);
  });

  it('adds blank extra accessory rows with quantity 0 and stable ids', () => {
    const next = addEmptyAccessoryDraft([]);
    expect(next).toHaveLength(1);
    expect(next[0].quantity).toBe(0);
    expect(next[0].name).toBe('');
    expect(next[0].id).toBeTruthy();
  });

  it('keepEmpty extra serialize preserves blank rows; clean serialize drops them', () => {
    const rows = addEmptyAccessoryDraft([]);
    const editing = serializeExtraAccessoriesJson(rows, { keepEmpty: true });
    expect(editing).toBeTruthy();
    expect(parseExtraAccessoriesJson(editing)).toHaveLength(1);

    const cleaned = serializeExtraAccessoriesJson(rows);
    expect(cleaned).toBeNull();
  });

  it('normalizes imported all-one placeholder item quantities to zero while keeping package pricing', () => {
    const draft = parseFixedAccessoriesJson(JSON.stringify({
      name: 'Bộ phụ kiện cửa',
      items: [
        { name: 'Khóa', quantity: 1 },
        { name: 'Bản lề', quantity: 1 },
        { name: 'Vật tư phụ', quantity: 1 },
      ],
      packageQuantity: 2,
      unitPrice: 500000,
      total: 1000000,
    }));

    expect(draft.items.map((item) => item.quantity)).toEqual([0, 0, 0]);
    expect(draft.packageQuantity).toBe(2);
    expect(draft.unitPrice).toBe(500000);
    expect(draft.total).toBe(1000000);
  });

  it('keeps explicit mixed item quantities from real packages', () => {
    const draft = parseFixedAccessoriesJson(JSON.stringify({
      name: 'Bộ phụ kiện cửa',
      items: [
        { name: 'Khóa', quantity: 0 },
        { name: 'Bản lề', quantity: 3 },
        { name: 'Vật tư phụ', quantity: 0 },
      ],
      packageQuantity: 1,
      unitPrice: 800000,
    }));

    expect(draft.items.map((item) => item.quantity)).toEqual([0, 3, 0]);
  });

  it('clearing item name does not remove the item id (row identity stable)', () => {
    const draft = parseFixedAccessoriesJson(JSON.stringify({
      name: 'Bộ',
      items: [{ id: 'stable-1', name: 'Khóa', quantity: 0 }],
      packageQuantity: 1,
      unitPrice: 0,
    }));
    const cleared = {
      ...draft,
      items: draft.items.map((item) => ({ ...item, name: '' })),
    };
    const json = serializeFixedAccessoriesJson(cleared, { keepEmpty: true });
    const reparsed = parseFixedAccessoriesJson(json, 1);
    expect(reparsed.items.some((item) => item.id === 'stable-1' || item.name === '')).toBe(true);
  });
});

describe('computeAutoPackageQuantity', () => {
  it('multiplies product base SL by door SL (3 × 2 = 6)', () => {
    expect(computeAutoPackageQuantity(3, 2)).toBe(6);
    expect(computeAutoPackageQuantity(1, 5)).toBe(5);
    expect(computeAutoPackageQuantity(3, 1)).toBe(3);
  });
});

describe('seedFixedPackageFromProduct', () => {
  it('uses product packageQuantity as per-unit base', () => {
    const productPkg = JSON.stringify({
      name: 'Bộ PK cửa 3 cánh',
      items: [{ name: 'Bản lề', quantity: 3 }],
      packageQuantity: 3,
      unitPrice: 500000,
    });
    const seeded = seedFixedPackageFromProduct(productPkg, 1);
    const draft = parseFixedAccessoriesJson(seeded, 1);
    expect(draft.packageQuantityPerUnit).toBe(3);
    expect(draft.packageQuantity).toBe(3);
    expect(draft.packageQuantityManual).toBeFalsy();
  });

  it('scales seeded base by door SL when seeding at qty>1', () => {
    const productPkg = JSON.stringify({
      name: 'Bộ PK',
      items: [{ name: 'Khóa', quantity: 1 }],
      packageQuantity: 3,
      unitPrice: 100000,
    });
    const seeded = seedFixedPackageFromProduct(productPkg, 2);
    const draft = parseFixedAccessoriesJson(seeded, 1);
    expect(draft.packageQuantityPerUnit).toBe(3);
    expect(draft.packageQuantity).toBe(6);
  });
});

describe('syncFixedPackageQuantityToTotalSl', () => {
  it('creates shell with package qty = total door SL when missing (perUnit=1)', () => {
    const json = syncFixedPackageQuantityToTotalSl(null, 3, { createIfMissing: true, keepEmpty: true });
    expect(json).toBeTruthy();
    const draft = parseFixedAccessoriesJson(json, 1);
    expect(draft.packageQuantity).toBe(3);
    expect(draft.packageQuantityPerUnit).toBe(1);
    expect(draft.packageQuantityManual).toBeFalsy();
  });

  it('updates non-manual package qty when door SL changes (perUnit × SL)', () => {
    const base = serializeFixedAccessoriesJson(
      {
        name: 'Bộ PK',
        items: [{ id: '1', name: 'Khóa', quantity: 0 }],
        packageQuantity: 1,
        packageQuantityPerUnit: 1,
        unit: 'BO',
        unitPrice: 100000,
        total: 100000,
      },
      { keepEmpty: true },
    );
    const next = syncFixedPackageQuantityToTotalSl(base, 5, { keepEmpty: true });
    expect(parseFixedAccessoriesJson(next, 1).packageQuantity).toBe(5);
  });

  it('scales product base 3 × door SL 2 → 6', () => {
    const seeded = seedFixedPackageFromProduct(
      JSON.stringify({
        name: 'Bộ PK 3 cánh',
        items: [{ name: 'Bản lề', quantity: 3 }],
        packageQuantity: 3,
        unitPrice: 200000,
      }),
      1,
    );
    const next = syncFixedPackageQuantityToTotalSl(seeded, 2, {
      keepEmpty: true,
      respectManual: false,
    });
    const draft = parseFixedAccessoriesJson(next, 1);
    expect(draft.packageQuantityPerUnit).toBe(3);
    expect(draft.packageQuantity).toBe(6);
  });

  it('keeps manual package qty when respectManual (auto path)', () => {
    const base = serializeFixedAccessoriesJson(
      {
        name: 'Bộ PK',
        items: [{ id: '1', name: 'Khóa', quantity: 0 }],
        packageQuantity: 2,
        packageQuantityPerUnit: 3,
        packageQuantityManual: true,
        unit: 'BO',
        unitPrice: 100000,
        total: 200000,
      },
      { keepEmpty: true },
    );
    const next = syncFixedPackageQuantityToTotalSl(base, 9, {
      keepEmpty: true,
      respectManual: true,
    });
    const draft = parseFixedAccessoriesJson(next, 1);
    expect(draft.packageQuantity).toBe(2);
    expect(draft.packageQuantityManual).toBe(true);
  });

  it('clears manual and re-autos when force (door SL changed)', () => {
    const base = serializeFixedAccessoriesJson(
      {
        name: 'Bộ PK',
        items: [{ id: '1', name: 'Khóa', quantity: 0 }],
        packageQuantity: 5,
        packageQuantityPerUnit: 3,
        packageQuantityManual: true,
        unit: 'BO',
        unitPrice: 100000,
        total: 500000,
      },
      { keepEmpty: true },
    );
    const next = syncFixedPackageQuantityToTotalSl(base, 2, {
      keepEmpty: true,
      respectManual: false,
    });
    const draft = parseFixedAccessoriesJson(next, 1);
    expect(draft.packageQuantity).toBe(6);
    expect(draft.packageQuantityManual).toBeFalsy();
    expect(draft.packageQuantityPerUnit).toBe(3);
  });
});
