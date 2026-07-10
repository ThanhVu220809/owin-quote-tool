import { describe, expect, it } from 'vitest';
import {
  addEmptyAccessoryDraft,
  DEFAULT_FIXED_ACCESSORY_ITEMS,
  parseFixedAccessoriesJson,
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
        items: [{ name: 'Khóa', quantity: 0 }],
        packageQuantity: 1,
        unit: 'BO',
        unitPrice: 0,
        total: 0,
      },
      { keepEmpty: true },
    );
    expect(json).toBeTruthy();
    expect(JSON.parse(json!).name).toBe('');
    expect(JSON.parse(json!).items).toEqual([{ name: 'Khóa', quantity: 0 }]);
  });

  it('adds blank extra accessory rows with quantity 0', () => {
    const next = addEmptyAccessoryDraft([]);
    expect(next).toHaveLength(1);
    expect(next[0].quantity).toBe(0);
    expect(next[0].name).toBe('');
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
});
