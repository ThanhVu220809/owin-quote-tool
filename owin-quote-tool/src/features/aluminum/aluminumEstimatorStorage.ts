import { ALUMINUM_SYSTEMS } from '@/lib/aluminum-estimator/aluminum-systems';
import { parseEstimatorNumber } from '@/lib/aluminum-estimator/aluminum-estimator';
import {
  compareAndSwapHostedAppData,
  getHostedAppData,
  getHostedAppDataVersioned,
  upsertHostedAppData,
  type HostedAppDataSnapshot,
} from '@/features/supabase/sharedDataRepo';
import type {
  AluminumCalculationRecord,
  AluminumEstimatorInputState,
  AluminumEstimatorRowsBySystem,
} from '@/types/models';

export type { AluminumEstimatorInputState, AluminumEstimatorRowsBySystem };

/** Các màu chọn được cho toàn bộ thanh nhôm. */
export const ALUMINUM_COLORS = ['Ghi Xanh', 'Vân Gỗ Trắc', 'Vân Gỗ Lim'] as const;
export const DEFAULT_ALUMINUM_COLOR = 'Vân Gỗ Trắc';

export interface AluminumEstimatorPageState {
  selectedSystemId: string;
  inputRows: AluminumEstimatorRowsBySystem;
  /** Màu áp cho tất cả thanh (hiển thị + xuất file). */
  color: string;
  updatedAt: string | null;
}

/** Last server-acknowledged state and the revision token required for CAS. */
export interface AluminumEstimatorStorageSnapshot {
  state: AluminumEstimatorPageState | null;
  revision: number;
  createdAt: string | null;
}

export type AluminumEstimatorRowPatch = Partial<AluminumEstimatorInputState>;

export const ALUMINUM_ESTIMATOR_STORAGE_KEY = 'owin_aluminum_estimator_v2';

export const EMPTY_ALUMINUM_ESTIMATOR_INPUT: AluminumEstimatorInputState = {
  quantity: '',
  unitPrice: '',
  note: '',
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultAluminumEstimatorState(): AluminumEstimatorPageState {
  return {
    selectedSystemId: ALUMINUM_SYSTEMS[0]?.id ?? '',
    inputRows: {},
    color: DEFAULT_ALUMINUM_COLOR,
    updatedAt: null,
  };
}

export function touchAluminumEstimatorState(state: AluminumEstimatorPageState): AluminumEstimatorPageState {
  return {
    ...state,
    updatedAt: nowIso(),
  };
}

export function getAluminumEstimatorInput(
  rowsBySystem: AluminumEstimatorRowsBySystem,
  systemId: string,
  rowId: string,
): AluminumEstimatorInputState {
  return rowsBySystem[systemId]?.[rowId] ?? EMPTY_ALUMINUM_ESTIMATOR_INPUT;
}

function normalizeInputRows(value: unknown): AluminumEstimatorRowsBySystem {
  if (!value || typeof value !== 'object') return {};

  const rowsBySystem: AluminumEstimatorRowsBySystem = {};
  Object.entries(value as Record<string, unknown>).forEach(([systemId, systemRows]) => {
    if (!systemRows || typeof systemRows !== 'object') return;
    rowsBySystem[systemId] = {};
    Object.entries(systemRows as Record<string, unknown>).forEach(([rowId, input]) => {
      if (!input || typeof input !== 'object') return;
      const draft = input as Partial<AluminumEstimatorInputState>;
      rowsBySystem[systemId][rowId] = {
        quantity: typeof draft.quantity === 'string' ? draft.quantity : '',
        unitPrice: typeof draft.unitPrice === 'string' ? draft.unitPrice : '',
        note: typeof draft.note === 'string' ? draft.note : '',
      };
    });
  });

  return rowsBySystem;
}

function inputStateEquals(
  left: AluminumEstimatorInputState | undefined,
  right: AluminumEstimatorInputState | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.quantity === right.quantity
    && left.unitPrice === right.unitPrice
    && left.note === right.note;
}

/** Compare the editable estimator payload while deliberately ignoring sync metadata. */
export function aluminumEstimatorStateContentEquals(
  left: AluminumEstimatorPageState,
  right: AluminumEstimatorPageState,
): boolean {
  if (left.selectedSystemId !== right.selectedSystemId) return false;
  if (left.color !== right.color) return false;

  const systemIds = new Set([
    ...Object.keys(left.inputRows),
    ...Object.keys(right.inputRows),
  ]);
  for (const systemId of systemIds) {
    const leftRows = left.inputRows[systemId] ?? {};
    const rightRows = right.inputRows[systemId] ?? {};
    const rowIds = new Set([...Object.keys(leftRows), ...Object.keys(rightRows)]);
    for (const rowId of rowIds) {
      if (!inputStateEquals(leftRows[rowId], rightRows[rowId])) return false;
    }
  }

  return true;
}

/**
 * Merge a hosted update against the last server-confirmed base.
 *
 * Rows are the conflict boundary: a locally edited/deleted row wins when the
 * same row also changed remotely, while untouched rows accept the remote value.
 * This preserves pending input on the current machine and still incorporates
 * independent edits made on another machine.
 */
export function mergeAluminumEstimatorStates(
  base: AluminumEstimatorPageState,
  local: AluminumEstimatorPageState,
  remote: AluminumEstimatorPageState,
): AluminumEstimatorPageState {
  const inputRows: AluminumEstimatorRowsBySystem = {};
  const systemIds = new Set([
    ...Object.keys(base.inputRows),
    ...Object.keys(local.inputRows),
    ...Object.keys(remote.inputRows),
  ]);

  for (const systemId of systemIds) {
    const baseRows = base.inputRows[systemId] ?? {};
    const localRows = local.inputRows[systemId] ?? {};
    const remoteRows = remote.inputRows[systemId] ?? {};
    const mergedRows: Record<string, AluminumEstimatorInputState> = {};
    const rowIds = new Set([
      ...Object.keys(baseRows),
      ...Object.keys(localRows),
      ...Object.keys(remoteRows),
    ]);

    for (const rowId of rowIds) {
      const localChanged = !inputStateEquals(localRows[rowId], baseRows[rowId]);
      const chosen = localChanged ? localRows[rowId] : remoteRows[rowId];
      if (chosen) mergedRows[rowId] = { ...chosen };
    }

    if (Object.keys(mergedRows).length > 0) inputRows[systemId] = mergedRows;
  }

  const selectedSystemId = local.selectedSystemId !== base.selectedSystemId
    ? local.selectedSystemId
    : remote.selectedSystemId;
  const color = local.color !== base.color ? local.color : remote.color;
  const mergedContent: AluminumEstimatorPageState = {
    selectedSystemId,
    inputRows,
    color,
    updatedAt: null,
  };

  return {
    ...mergedContent,
    updatedAt: aluminumEstimatorStateContentEquals(mergedContent, remote)
      ? remote.updatedAt
      : local.updatedAt ?? remote.updatedAt ?? base.updatedAt,
  };
}

export function normalizeAluminumEstimatorState(value: unknown): AluminumEstimatorPageState | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<AluminumEstimatorPageState>;
  if (!parsed.selectedSystemId || !parsed.inputRows) return null;

  return {
    selectedSystemId: parsed.selectedSystemId,
    inputRows: normalizeInputRows(parsed.inputRows),
    color: typeof parsed.color === 'string' && parsed.color.trim() ? parsed.color : DEFAULT_ALUMINUM_COLOR,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
  };
}

export function normalizeAluminumCalculationRecord(value: unknown): AluminumCalculationRecord | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<AluminumCalculationRecord & AluminumEstimatorPageState>;
  const state = normalizeAluminumEstimatorState(parsed);
  if (!state) return null;
  const now = nowIso();
  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : state.updatedAt || now;
  const createdAt =
    typeof parsed.createdAt === 'string'
      ? parsed.createdAt
      : state.updatedAt || updatedAt;

  return {
    id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : ALUMINUM_ESTIMATOR_STORAGE_KEY,
    selectedSystemId: state.selectedSystemId,
    inputRows: state.inputRows,
    color: state.color,
    createdAt,
    updatedAt,
    deleted: parsed.deleted ? true : undefined,
    deletedAt: typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null,
  };
}

function toPageState(record: AluminumCalculationRecord): AluminumEstimatorPageState | null {
  if (record.deleted || record.deletedAt) return null;
  return {
    selectedSystemId: record.selectedSystemId,
    inputRows: record.inputRows,
    color: record.color && record.color.trim() ? record.color : DEFAULT_ALUMINUM_COLOR,
    updatedAt: record.updatedAt,
  };
}

export function isAluminumEstimatorDirty(state: AluminumEstimatorPageState): boolean {
  return Object.values(state.inputRows).some((systemRows) =>
    Object.values(systemRows).some((input) => parseEstimatorNumber(input.quantity) > 0),
  );
}

let writeQueue: Promise<void> = Promise.resolve();

function snapshotFromHosted(
  hosted: HostedAppDataSnapshot<unknown>,
): AluminumEstimatorStorageSnapshot {
  const record = normalizeAluminumCalculationRecord(hosted.data);
  return {
    state: record ? toPageState(record) : null,
    revision: hosted.revision,
    createdAt: record?.createdAt ?? null,
  };
}

async function readHostedSnapshot(): Promise<AluminumEstimatorStorageSnapshot> {
  return snapshotFromHosted(
    await getHostedAppDataVersioned<unknown>(ALUMINUM_ESTIMATOR_STORAGE_KEY),
  );
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const pending = writeQueue.then(operation);
  writeQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

function pageStateOrDefault(
  snapshot: AluminumEstimatorStorageSnapshot,
): AluminumEstimatorPageState {
  return snapshot.state ?? createDefaultAluminumEstimatorState();
}

function recordFromPageState(
  state: AluminumEstimatorPageState,
  base: AluminumEstimatorStorageSnapshot,
): AluminumCalculationRecord {
  const updatedAt = state.updatedAt || nowIso();
  return {
    id: ALUMINUM_ESTIMATOR_STORAGE_KEY,
    selectedSystemId: state.selectedSystemId,
    inputRows: normalizeInputRows(state.inputRows),
    color: state.color,
    createdAt: base.createdAt ?? updatedAt,
    updatedAt,
    deleted: undefined,
    deletedAt: null,
  };
}

const MAX_CAS_ATTEMPTS = 5;

/**
 * Persist a local edit against the exact server snapshot it was based on.
 * A stale revision is re-read, merged row-by-row, and retried. The returned
 * snapshot is the actual row acknowledged by Postgres, never an optimistic
 * copy manufactured in the browser.
 */
async function saveWithCas(
  initialBase: AluminumEstimatorStorageSnapshot,
  initialLocal: AluminumEstimatorPageState,
): Promise<AluminumEstimatorStorageSnapshot> {
  let base = initialBase;
  let local = initialLocal;

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const record = recordFromPageState(local, base);
    const applied = await compareAndSwapHostedAppData(
      ALUMINUM_ESTIMATOR_STORAGE_KEY,
      base.revision,
      record,
    );
    if (applied) return snapshotFromHosted(applied);

    const remote = await readHostedSnapshot();
    const remoteState = pageStateOrDefault(remote);
    local = mergeAluminumEstimatorStates(pageStateOrDefault(base), local, remoteState);
    if (aluminumEstimatorStateContentEquals(local, remoteState)) return remote;
    base = remote;
  }

  throw new Error('Dữ liệu tính nhôm đang được chỉnh sửa liên tục. Vui lòng thử lại.');
}

export async function loadAluminumEstimatorStorage(): Promise<AluminumEstimatorStorageSnapshot> {
  await writeQueue;
  return readHostedSnapshot();
}

export function saveAluminumEstimatorStorage(
  base: AluminumEstimatorStorageSnapshot,
  state: AluminumEstimatorPageState,
): Promise<AluminumEstimatorStorageSnapshot> {
  return enqueueWrite(() => saveWithCas(base, state));
}

export function clearAluminumEstimatorStorage(): Promise<AluminumEstimatorStorageSnapshot> {
  return enqueueWrite(async () => {
    const base = await readHostedSnapshot();
    return saveWithCas(base, touchAluminumEstimatorState(createDefaultAluminumEstimatorState()));
  });
}

export async function getAllAluminumCalculationsRaw(): Promise<AluminumCalculationRecord[]> {
  await writeQueue;
  const record = normalizeAluminumCalculationRecord(
    (await getHostedAppDataVersioned<unknown>(ALUMINUM_ESTIMATOR_STORAGE_KEY)).data,
  );
  return record ? [record] : [];
}

export async function bulkPutAluminumCalculations(records: AluminumCalculationRecord[]): Promise<void> {
  await enqueueWrite(async () => {
    for (const record of records) {
      const normalized = normalizeAluminumCalculationRecord(record);
      if (!normalized) continue;
      if (normalized.id !== ALUMINUM_ESTIMATOR_STORAGE_KEY) {
        await upsertHostedAppData(normalized.id, normalized);
        continue;
      }
      const state = toPageState(normalized);
      if (state) await saveWithCas(await readHostedSnapshot(), state);
    }
  });
}

/** Supabase-backed compatibility surface retained for older callers. */
export const aluminumEstimatorStore = {
  getItem<T>(key: string): Promise<T | null> {
    return getHostedAppData<T>(key);
  },
  async setItem<T>(key: string, value: T): Promise<T> {
    await enqueueWrite(async () => {
      if (key !== ALUMINUM_ESTIMATOR_STORAGE_KEY) {
        await upsertHostedAppData(key, value);
        return;
      }
      const record = normalizeAluminumCalculationRecord(value);
      const state = record ? toPageState(record) : null;
      if (state) await saveWithCas(await readHostedSnapshot(), state);
    });
    return value;
  },
  async iterate<T, U>(
    iterator: (value: T, key: string, iterationNumber: number) => U,
  ): Promise<U | undefined> {
    const value = await getHostedAppData<T>(ALUMINUM_ESTIMATOR_STORAGE_KEY);
    return value === null ? undefined : iterator(value, ALUMINUM_ESTIMATOR_STORAGE_KEY, 1);
  },
};
