import { ALUMINUM_SYSTEMS } from '@/lib/aluminum-estimator/aluminum-systems';
import { parseEstimatorNumber } from '@/lib/aluminum-estimator/aluminum-estimator';
import { getHostedAppData, upsertHostedAppData } from '@/features/supabase/sharedDataRepo';
import type {
  AluminumCalculationRecord,
  AluminumEstimatorInputState,
  AluminumEstimatorRowsBySystem,
} from '@/types/models';

export type { AluminumEstimatorInputState, AluminumEstimatorRowsBySystem };

export interface AluminumEstimatorPageState {
  selectedSystemId: string;
  inputRows: AluminumEstimatorRowsBySystem;
  updatedAt: string | null;
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

export function normalizeAluminumEstimatorState(value: unknown): AluminumEstimatorPageState | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<AluminumEstimatorPageState>;
  if (!parsed.selectedSystemId || !parsed.inputRows) return null;

  return {
    selectedSystemId: parsed.selectedSystemId,
    inputRows: normalizeInputRows(parsed.inputRows),
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
    updatedAt: record.updatedAt,
  };
}

export function isAluminumEstimatorDirty(state: AluminumEstimatorPageState): boolean {
  return Object.values(state.inputRows).some((systemRows) =>
    Object.values(systemRows).some((input) => parseEstimatorNumber(input.quantity) > 0),
  );
}

let cachedRecord: AluminumCalculationRecord | null | undefined;
let writeQueue: Promise<void> = Promise.resolve();

async function readHostedRecord(force = false): Promise<AluminumCalculationRecord | null> {
  if (!force && cachedRecord !== undefined) return cachedRecord;
  cachedRecord = normalizeAluminumCalculationRecord(
    await getHostedAppData<unknown>(ALUMINUM_ESTIMATOR_STORAGE_KEY),
  );
  return cachedRecord;
}

async function putHostedRecord(record: AluminumCalculationRecord): Promise<void> {
  await upsertHostedAppData(record.id, record);
  if (record.id === ALUMINUM_ESTIMATOR_STORAGE_KEY) cachedRecord = record;
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const pending = writeQueue.then(operation);
  writeQueue = pending.catch(() => undefined);
  return pending;
}

export async function loadAluminumEstimatorStorage(): Promise<AluminumEstimatorPageState | null> {
  await writeQueue;
  const currentRecord = await readHostedRecord(true);
  return currentRecord ? toPageState(currentRecord) : null;
}

export async function saveAluminumEstimatorStorage(state: AluminumEstimatorPageState): Promise<void> {
  await enqueueWrite(async () => {
    const existing = await readHostedRecord();
    const updatedAt = state.updatedAt || nowIso();
    await putHostedRecord({
      id: ALUMINUM_ESTIMATOR_STORAGE_KEY,
      selectedSystemId: state.selectedSystemId,
      inputRows: normalizeInputRows(state.inputRows),
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
      deleted: undefined,
      deletedAt: null,
    });
  });
}

export async function clearAluminumEstimatorStorage(): Promise<void> {
  await enqueueWrite(async () => {
    const existing = await readHostedRecord();
    const updatedAt = nowIso();
    await putHostedRecord({
      id: ALUMINUM_ESTIMATOR_STORAGE_KEY,
      selectedSystemId: existing?.selectedSystemId ?? ALUMINUM_SYSTEMS[0]?.id ?? '',
      inputRows: {},
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
      deleted: true,
      deletedAt: updatedAt,
    });
  });
}

export async function getAllAluminumCalculationsRaw(): Promise<AluminumCalculationRecord[]> {
  await writeQueue;
  const record = await readHostedRecord(true);
  return record ? [record] : [];
}

export async function bulkPutAluminumCalculations(records: AluminumCalculationRecord[]): Promise<void> {
  await enqueueWrite(async () => {
    for (const record of records) {
      const normalized = normalizeAluminumCalculationRecord(record);
      if (normalized) await putHostedRecord(normalized);
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
      await upsertHostedAppData(key, value);
      cachedRecord = key === ALUMINUM_ESTIMATOR_STORAGE_KEY
        ? normalizeAluminumCalculationRecord(value)
        : cachedRecord;
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
