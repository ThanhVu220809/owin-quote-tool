import localforage from 'localforage';
import { ALUMINUM_SYSTEMS } from '@/lib/aluminum-estimator/aluminum-systems';
import { parseEstimatorNumber } from '@/lib/aluminum-estimator/aluminum-estimator';

export interface AluminumEstimatorInputState {
  quantity: string;
  unitPrice: string;
  note: string;
}

export type AluminumEstimatorRowsBySystem = Record<string, Record<string, AluminumEstimatorInputState>>;

export interface AluminumEstimatorPageState {
  selectedSystemId: string;
  inputRows: AluminumEstimatorRowsBySystem;
  updatedAt: string | null;
}

export type AluminumEstimatorRowPatch = Partial<AluminumEstimatorInputState>;

const ALUMINUM_ESTIMATOR_STORAGE_KEY = 'owin_aluminum_estimator_v2';
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
  const current = normalizeAluminumEstimatorState(await aluminumEstimatorStore.getItem(ALUMINUM_ESTIMATOR_STORAGE_KEY));
  if (current) return current;

  if (typeof window === 'undefined') return null;
  const legacy = deserializeLegacyState(window.localStorage.getItem(LEGACY_ALUMINUM_ESTIMATOR_STORAGE_KEY));
  if (!legacy) return null;

  const migrated = touchAluminumEstimatorState(legacy);
  await aluminumEstimatorStore.setItem(ALUMINUM_ESTIMATOR_STORAGE_KEY, migrated);
  return migrated;
}

export async function saveAluminumEstimatorStorage(state: AluminumEstimatorPageState): Promise<void> {
  await aluminumEstimatorStore.setItem(ALUMINUM_ESTIMATOR_STORAGE_KEY, state);
}

export async function clearAluminumEstimatorStorage(): Promise<void> {
  await aluminumEstimatorStore.removeItem(ALUMINUM_ESTIMATOR_STORAGE_KEY);
}
