import { describe, expect, it } from 'vitest';
import type { AluminumEstimatorPriceState } from '@/types/models';
import {
  aluminumEstimatorStateContentEquals,
  applyLinkedUnitPrice,
  compareAluminumRowsByPriority,
  convertAluminumUnitPrice,
  mergeAluminumEstimatorStates,
  normalizeAluminumColor,
  normalizeAluminumEstimatorState,
  recomputeLinkedPricesFromBases,
  scaleUnitPricesByGhiBaseChange,
  type AluminumEstimatorPageState,
} from '@/features/aluminum/aluminumEstimatorStorage';

const BASE_TIME = '2026-07-13T01:00:00.000Z';
const LOCAL_TIME = '2026-07-13T01:01:00.000Z';
const REMOTE_TIME = '2026-07-13T01:02:00.000Z';

function price(unitPrice: string, note = ''): AluminumEstimatorPriceState {
  return { unitPrice, note };
}

function state(
  unitPricesByColor: AluminumEstimatorPageState['unitPricesByColor'],
  updatedAt: string | null,
  selectedSystemId = 'system-a',
  color = 'Vân Gỗ',
  quantities: AluminumEstimatorPageState['quantities'] = {},
): AluminumEstimatorPageState {
  return {
    selectedSystemId,
    unitPricesByColor,
    customProfilesBySystem: {},
    hiddenProfileRowIdsBySystem: {},
    color,
    quantities,
    colorBaseRates: { 'Ghi - Cafe': 147_000, 'Vân Gỗ': 154_000 },
    updatedAt,
  };
}

describe('normalizeAluminumColor', () => {
  it('maps legacy labels to the two supported colors', () => {
    expect(normalizeAluminumColor('Ghi Xanh')).toBe('Ghi - Cafe');
    expect(normalizeAluminumColor('Ghi - Cafe')).toBe('Ghi - Cafe');
    expect(normalizeAluminumColor('Vân Gỗ Trắc')).toBe('Vân Gỗ');
    expect(normalizeAluminumColor('Vân Gỗ Lim')).toBe('Vân Gỗ');
    expect(normalizeAluminumColor('Vân Gỗ')).toBe('Vân Gỗ');
  });
});

describe('normalizeAluminumEstimatorState', () => {
  it('migrates legacy inputRows into unitPricesByColor and drops quantity', () => {
    const normalized = normalizeAluminumEstimatorState({
      selectedSystemId: 'thuy-luc',
      color: 'Ghi Xanh',
      inputRows: {
        'thuy-luc': {
          row1: { quantity: '12', unitPrice: '150000', note: '' },
        },
      },
      updatedAt: BASE_TIME,
    });

    expect(normalized?.color).toBe('Ghi - Cafe');
    expect(normalized?.quantities).toEqual({});
    // 150000 Ghi → Vân gỗ ≈ 157143 → làm tròn 1.000 = 157000
    expect(normalized?.unitPricesByColor['Ghi - Cafe']?.['thuy-luc']?.row1).toEqual({
      unitPrice: '150000',
      note: '',
    });
    expect(normalized?.unitPricesByColor['Vân Gỗ']?.['thuy-luc']?.row1?.unitPrice).toBe('157000');
  });

  it('fills Vân gỗ from Ghi on load using 147k/154k', () => {
    const normalized = normalizeAluminumEstimatorState({
      selectedSystemId: 'thuy-luc',
      color: 'Ghi - Cafe',
      unitPricesByColor: {
        'Ghi - Cafe': { 'thuy-luc': { a: price('147000') } },
      },
      updatedAt: BASE_TIME,
    });

    expect(normalized?.unitPricesByColor['Ghi - Cafe']?.['thuy-luc']?.a?.unitPrice).toBe('147000');
    expect(normalized?.unitPricesByColor['Vân Gỗ']?.['thuy-luc']?.a?.unitPrice).toBe('154000');
  });

  it('keeps valid custom profiles and ignores malformed persisted rows', () => {
    const normalized = normalizeAluminumEstimatorState({
      selectedSystemId: 'thuy-luc',
      color: 'Ghi - Cafe',
      customProfilesBySystem: {
        'thuy-luc': [
          { id: 'new-1', code: 'owin-new1', description: 'Cây mới', image: 'https://example.com/a.webp' },
          { id: '', code: 'OWIN-BAD', description: 'Thiếu id' },
        ],
      },
    });

    expect(normalized?.customProfilesBySystem).toEqual({
      'thuy-luc': [expect.objectContaining({
        id: 'new-1',
        code: 'OWIN-NEW1',
        description: 'Cây mới',
        image: 'https://example.com/a.webp',
      })],
    });
  });

  it('loads hidden catalogue row ids without duplication', () => {
    const normalized = normalizeAluminumEstimatorState({
      selectedSystemId: 'thuy-luc',
      hiddenProfileRowIdsBySystem: { 'thuy-luc': ['thuy-luc-1-OWIN-67', 'thuy-luc-1-OWIN-67', 123] },
    });

    expect(normalized?.hiddenProfileRowIdsBySystem).toEqual({
      'thuy-luc': ['thuy-luc-1-OWIN-67'],
    });
  });
});

describe('compareAluminumRowsByPriority', () => {
  it('ranks unit price first, then quantity, then empty', () => {
    const priced = { unitPrice: '100', quantity: '', order: 2 };
    const qtyOnly = { unitPrice: '', quantity: '3', order: 0 };
    const empty = { unitPrice: '', quantity: '', order: 1 };
    const list = [empty, qtyOnly, priced].sort(compareAluminumRowsByPriority);
    expect(list.map((r) => r.order)).toEqual([2, 0, 1]);
  });
});

describe('convertAluminumUnitPrice / applyLinkedUnitPrice', () => {
  it('converts Ghi → Vân gỗ by fixed 147k / 154k and rounds to 1.000', () => {
    expect(convertAluminumUnitPrice(147_000, 147_000, 154_000)).toBe(154_000);
    expect(convertAluminumUnitPrice(73_500, 147_000, 154_000)).toBe(77_000);
    // 100000/147000*154000 ≈ 104761.9 → 105000
    expect(convertAluminumUnitPrice(100_000, 147_000, 154_000)).toBe(105_000);
  });

  it('writes both color books when editing one price', () => {
    const next = applyLinkedUnitPrice({}, 'Ghi - Cafe', 'sys', 'row1', '147000', '');
    expect(next['Ghi - Cafe']?.sys?.row1?.unitPrice).toBe('147000');
    expect(next['Vân Gỗ']?.sys?.row1?.unitPrice).toBe('154000');
  });

  it('fills missing Vân gỗ from Ghi on recompute', () => {
    const books = {
      'Ghi - Cafe': { sys: { r: price('147000') } },
    };
    const recomputed = recomputeLinkedPricesFromBases(books);
    expect(recomputed['Ghi - Cafe']?.sys?.r?.unitPrice).toBe('147000');
    expect(recomputed['Vân Gỗ']?.sys?.r?.unitPrice).toBe('154000');
  });

  it('uses custom base rates when recomputing', () => {
    const books = {
      'Ghi - Cafe': { sys: { r: price('100000') } },
    };
    const recomputed = recomputeLinkedPricesFromBases(books, {
      'Ghi - Cafe': 100_000,
      'Vân Gỗ': 200_000,
    });
    expect(recomputed['Vân Gỗ']?.sys?.r?.unitPrice).toBe('200000');
  });

  it('scales all Ghi and Vân prices when Ghi base drops', () => {
    // Ghi 147k → 140k: mọi giá × (140/147)
    const books = applyLinkedUnitPrice({}, 'Ghi - Cafe', 'sys', 'r', '147000', '');
    expect(books['Vân Gỗ']?.sys?.r?.unitPrice).toBe('154000');

    const scaled = scaleUnitPricesByGhiBaseChange(books, 147_000, 140_000);
    expect(scaled['Ghi - Cafe']?.sys?.r?.unitPrice).toBe('140000');
    // 154000 / 147000 * 140000 ≈ 146666.7 → làm tròn 1.000 = 147000
    expect(scaled['Vân Gỗ']?.sys?.r?.unitPrice).toBe('147000');
  });
});

describe('mergeAluminumEstimatorStates', () => {
  it('keeps a pending local price and incorporates a different remote price', () => {
    const base = state({ 'Vân Gỗ': { 'system-a': { first: price('1'), second: price('2') } } }, BASE_TIME);
    const local = state({ 'Vân Gỗ': { 'system-a': { first: price('3'), second: price('2') } } }, LOCAL_TIME);
    const remote = state({
      'Vân Gỗ': { 'system-a': { first: price('1'), second: price('2'), third: price('4') } },
    }, REMOTE_TIME);

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.unitPricesByColor['Vân Gỗ']?.['system-a']).toEqual({
      first: price('3'),
      second: price('2'),
      third: price('4'),
    });
    expect(merged.updatedAt).toBe(LOCAL_TIME);
  });

  it('uses the complete local price when both clients changed the same row', () => {
    const base = state({ 'Vân Gỗ': { 'system-a': { first: price('100', 'base') } } }, BASE_TIME);
    const local = state({ 'Vân Gỗ': { 'system-a': { first: price('100', 'local') } } }, LOCAL_TIME);
    const remote = state({ 'Vân Gỗ': { 'system-a': { first: price('900', 'remote') } } }, REMOTE_TIME);

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.unitPricesByColor['Vân Gỗ']?.['system-a']?.first).toEqual(price('100', 'local'));
  });

  it('keeps a local deletion on conflict and accepts an unrelated remote deletion', () => {
    const base = state({
      'Vân Gỗ': { 'system-a': { localDelete: price('1'), remoteDelete: price('2') } },
    }, BASE_TIME);
    const local = state({ 'Vân Gỗ': { 'system-a': { remoteDelete: price('2') } } }, LOCAL_TIME);
    const remote = state({ 'Vân Gỗ': { 'system-a': { localDelete: price('9') } } }, REMOTE_TIME);

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.unitPricesByColor).toEqual({});
  });

  it('preserves session quantities from local and ignores remote quantities', () => {
    const base = state({}, BASE_TIME, 'system-a', 'Vân Gỗ', {});
    const local = state({}, LOCAL_TIME, 'system-a', 'Vân Gỗ', { 'system-a': { first: '7' } });
    const remote = state(
      { 'Vân Gỗ': { 'system-a': { first: price('500') } } },
      REMOTE_TIME,
      'system-a',
      'Vân Gỗ',
      { 'system-a': { first: '99' } },
    );

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.quantities).toEqual({ 'system-a': { first: '7' } });
    expect(merged.unitPricesByColor['Vân Gỗ']?.['system-a']?.first).toEqual(price('500'));
  });

  it('accepts remote selection when untouched locally and keeps local selection on conflict', () => {
    const base = state({}, BASE_TIME, 'system-a');
    const remote = state({}, REMOTE_TIME, 'system-b');

    expect(mergeAluminumEstimatorStates(base, base, remote).selectedSystemId).toBe('system-b');
    expect(
      mergeAluminumEstimatorStates(
        base,
        state({}, LOCAL_TIME, 'system-c'),
        remote,
      ).selectedSystemId,
    ).toBe('system-c');
  });

  it('does not treat quantity-only differences as content changes', () => {
    const prices = { 'Vân Gỗ': { 'system-a': { first: price('100') } } };
    const left = state(prices, BASE_TIME, 'system-a', 'Vân Gỗ', { 'system-a': { first: '1' } });
    const right = state(prices, REMOTE_TIME, 'system-a', 'Vân Gỗ', { 'system-a': { first: '9' } });

    expect(aluminumEstimatorStateContentEquals(left, right)).toBe(true);
  });

  it('uses remote sync metadata when the merged content already equals remote', () => {
    const base = state({ 'Vân Gỗ': { 'system-a': { first: price('1') } } }, BASE_TIME);
    const remote = state({ 'Vân Gỗ': { 'system-a': { first: price('2') } } }, REMOTE_TIME);
    const merged = mergeAluminumEstimatorStates(base, base, remote);

    expect(merged.updatedAt).toBe(REMOTE_TIME);
    expect(aluminumEstimatorStateContentEquals(merged, remote)).toBe(true);
    expect(aluminumEstimatorStateContentEquals(
      { ...remote, updatedAt: LOCAL_TIME },
      remote,
    )).toBe(true);
  });
});
