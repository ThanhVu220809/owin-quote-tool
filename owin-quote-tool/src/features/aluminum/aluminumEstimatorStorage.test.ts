import { describe, expect, it } from 'vitest';
import type { AluminumEstimatorPriceState } from '@/types/models';
import {
  aluminumEstimatorStateContentEquals,
  getAluminumEstimatorInput,
  mergeAluminumEstimatorStates,
  normalizeAluminumColor,
  normalizeAluminumEstimatorState,
  type AluminumEstimatorPageState,
} from './aluminumEstimatorStorage';

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
  return { selectedSystemId, unitPricesByColor, color, quantities, updatedAt };
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
    expect(normalized?.unitPricesByColor).toEqual({
      'Ghi - Cafe': {
        'thuy-luc': {
          row1: { unitPrice: '150000', note: '' },
        },
      },
    });
  });

  it('keeps separate price books per color', () => {
    const normalized = normalizeAluminumEstimatorState({
      selectedSystemId: 'thuy-luc',
      color: 'Vân Gỗ',
      unitPricesByColor: {
        'Ghi - Cafe': { 'thuy-luc': { a: price('100') } },
        'Vân Gỗ': { 'thuy-luc': { a: price('200') } },
      },
      updatedAt: BASE_TIME,
    });

    expect(normalized?.unitPricesByColor['Ghi - Cafe']?.['thuy-luc']?.a).toEqual(price('100'));
    expect(normalized?.unitPricesByColor['Vân Gỗ']?.['thuy-luc']?.a).toEqual(price('200'));
    expect(getAluminumEstimatorInput(normalized!, 'thuy-luc', 'a')).toEqual({
      quantity: '',
      unitPrice: '200',
      note: '',
    });
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
