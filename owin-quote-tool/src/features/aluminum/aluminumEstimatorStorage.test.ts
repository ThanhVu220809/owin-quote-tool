import { describe, expect, it } from 'vitest';
import type { AluminumEstimatorInputState } from '@/types/models';
import {
  aluminumEstimatorStateContentEquals,
  mergeAluminumEstimatorStates,
  type AluminumEstimatorPageState,
} from './aluminumEstimatorStorage';

const BASE_TIME = '2026-07-13T01:00:00.000Z';
const LOCAL_TIME = '2026-07-13T01:01:00.000Z';
const REMOTE_TIME = '2026-07-13T01:02:00.000Z';

function row(
  quantity: string,
  unitPrice = '',
  note = '',
): AluminumEstimatorInputState {
  return { quantity, unitPrice, note };
}

function state(
  inputRows: AluminumEstimatorPageState['inputRows'],
  updatedAt: string | null,
  selectedSystemId = 'system-a',
  color = 'Vân Gỗ Trắc',
): AluminumEstimatorPageState {
  return { selectedSystemId, inputRows, color, updatedAt };
}

describe('mergeAluminumEstimatorStates', () => {
  it('keeps a pending local row and incorporates a different remote row', () => {
    const base = state({ 'system-a': { first: row('1'), second: row('2') } }, BASE_TIME);
    const local = state({ 'system-a': { first: row('3'), second: row('2') } }, LOCAL_TIME);
    const remote = state({
      'system-a': { first: row('1'), second: row('2'), third: row('4', '500000') },
    }, REMOTE_TIME);

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.inputRows['system-a']).toEqual({
      first: row('3'),
      second: row('2'),
      third: row('4', '500000'),
    });
    expect(merged.updatedAt).toBe(LOCAL_TIME);
  });

  it('uses the complete local row when both clients changed the same row', () => {
    const base = state({ 'system-a': { first: row('1', '100', 'base') } }, BASE_TIME);
    const local = state({ 'system-a': { first: row('2', '100', 'local') } }, LOCAL_TIME);
    const remote = state({ 'system-a': { first: row('1', '900', 'remote') } }, REMOTE_TIME);

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.inputRows['system-a']?.first).toEqual(row('2', '100', 'local'));
  });

  it('keeps a local deletion on conflict and accepts an unrelated remote deletion', () => {
    const base = state({
      'system-a': { localDelete: row('1'), remoteDelete: row('2') },
    }, BASE_TIME);
    const local = state({ 'system-a': { remoteDelete: row('2') } }, LOCAL_TIME);
    const remote = state({ 'system-a': { localDelete: row('9') } }, REMOTE_TIME);

    const merged = mergeAluminumEstimatorStates(base, local, remote);

    expect(merged.inputRows).toEqual({});
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

  it('uses remote sync metadata when the merged content already equals remote', () => {
    const base = state({ 'system-a': { first: row('1') } }, BASE_TIME);
    const remote = state({ 'system-a': { first: row('2') } }, REMOTE_TIME);
    const merged = mergeAluminumEstimatorStates(base, base, remote);

    expect(merged.updatedAt).toBe(REMOTE_TIME);
    expect(aluminumEstimatorStateContentEquals(merged, remote)).toBe(true);
    expect(aluminumEstimatorStateContentEquals(
      { ...remote, updatedAt: LOCAL_TIME },
      remote,
    )).toBe(true);
  });
});
