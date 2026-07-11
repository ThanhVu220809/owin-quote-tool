import localforage from 'localforage';
import { notifyLocalDataChanged } from '@/lib/dataChangeEvents';
import { ALUMINUM_SYSTEMS } from '@/lib/aluminum-estimator/aluminum-systems';
import { parseEstimatorNumber } from '@/lib/aluminum-estimator/aluminum-estimator';
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
const LEGACY_ALUMINUM_ESTIMATOR_STORAGE_KEY = 'owin_aluminum_estimator_v1';

export const EMPTY_ALUMINUM_ESTIMATOR_INPUT: AluminumEstimatorInputState = {
  quantity: '',
  unitPrice: '',
  note: '',
};

export const aluminumEstimatorStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'aluminum_calculations',
  driver: localforage.INDEXEDDB,
  description: 'Temporary aluminum estimator calculations',
});

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

function deserializeLegacyState(raw: string | null): AluminumEstimatorPageState | null {
  if (!raw) return null;
  try {
    return normalizeAluminumEstimatorState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isAluminumEstimatorDirty(state: AluminumEstimatorPageState): boolean {
  return Object.values(state.inputRows).some((systemRows) =>
    Object.values(systemRows).some((input) => parseEstimatorNumber(input.quantity) > 0),
  );
}

export async function loadAluminumEstimatorStorage(): Promise<AluminumEstimatorPageState | null> {
  const currentRecord = normalizeAluminumCalculationRecord(
    await aluminumEstimatorStore.getItem(ALUMINUM_ESTIMATOR_STORAGE_KEY),
  );
  if (currentRecord) return toPageState(currentRecord);

  if (typeof window === 'undefined') return null;
  const legacy = deserializeLegacyState(window.localStorage.getItem(LEGACY_ALUMINUM_ESTIMATOR_STORAGE_KEY));
  if (!legacy) return null;

  const migrated = touchAluminumEstimatorState(legacy);
  await saveAluminumEstimatorStorage(migrated);
  return migrated;
}

export async function saveAluminumEstimatorStorage(state: AluminumEstimatorPageState): Promise<void> {
  const existing = normalizeAluminumCalculationRecord(
    await aluminumEstimatorStore.getItem(ALUMINUM_ESTIMATOR_STORAGE_KEY),
  );
  const updatedAt = state.updatedAt || nowIso();
  const record: AluminumCalculationRecord = {
    id: ALUMINUM_ESTIMATOR_STORAGE_KEY,
    selectedSystemId: state.selectedSystemId,
    inputRows: normalizeInputRows(state.inputRows),
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    deleted: undefined,
    deletedAt: null,
  };
  await aluminumEstimatorStore.setItem(ALUMINUM_ESTIMATOR_STORAGE_KEY, record);
  notifyLocalDataChanged();
}

export async function clearAluminumEstimatorStorage(): Promise<void> {
  const existing = normalizeAluminumCalculationRecord(
    await aluminumEstimatorStore.getItem(ALUMINUM_ESTIMATOR_STORAGE_KEY),
  );
  const updatedAt = nowIso();
  await aluminumEstimatorStore.setItem(ALUMINUM_ESTIMATOR_STORAGE_KEY, {
    id: ALUMINUM_ESTIMATOR_STORAGE_KEY,
    selectedSystemId: existing?.selectedSystemId ?? ALUMINUM_SYSTEMS[0]?.id ?? '',
    inputRows: {},
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    deleted: true,
    deletedAt: updatedAt,
  } satisfies AluminumCalculationRecord);
  notifyLocalDataChanged();
}

export async function getAllAluminumCalculationsRaw(): Promise<AluminumCalculationRecord[]> {
  const out: AluminumCalculationRecord[] = [];
  await aluminumEstimatorStore.iterate<unknown, void>((value, key) => {
    if (key !== ALUMINUM_ESTIMATOR_STORAGE_KEY) return;
    const record = normalizeAluminumCalculationRecord(value);
    if (record) out.push(record);
  });
  return out;
}

export async function bulkPutAluminumCalculations(records: AluminumCalculationRecord[]): Promise<void> {
  for (const record of records) {
    const normalized = normalizeAluminumCalculationRecord(record);
    if (!normalized) continue;
    await aluminumEstimatorStore.setItem(normalized.id, normalized);
  }
}
