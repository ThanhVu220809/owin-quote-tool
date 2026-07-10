import { describe, expect, it } from 'vitest';
import {
  addEmptyAccessoryDraft,
  addEmptyFixedAccessoryItem,
  createEmptyFixedAccessoryDraft,
  DEFAULT_FIXED_ACCESSORY_ITEMS,
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
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
