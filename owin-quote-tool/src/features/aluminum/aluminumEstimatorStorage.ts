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
  AluminumEstimatorPriceState,
  AluminumEstimatorQuantitiesBySystem,
  AluminumEstimatorRowsBySystem,
  AluminumEstimatorUnitPricesByColor,
} from '@/types/models';

export type {
  AluminumEstimatorInputState,
  AluminumEstimatorPriceState,
  AluminumEstimatorQuantitiesBySystem,
  AluminumEstimatorRowsBySystem,
  AluminumEstimatorUnitPricesByColor,
};

/** Hai màu chọn được; mỗi màu có bảng đơn giá riêng. */
export const ALUMINUM_COLORS = ['Ghi - Cafe', 'Vân Gỗ'] as const;
export type AluminumColor = (typeof ALUMINUM_COLORS)[number];
export const DEFAULT_ALUMINUM_COLOR: AluminumColor = 'Vân Gỗ';

export interface AluminumEstimatorPageState {
  selectedSystemId: string;
  /** Màu đang chọn — đơn giá hiển thị lấy từ unitPricesByColor[color]. */
  color: string;
  /**
   * SL theo hệ/dòng — chỉ sống trong session trình duyệt.
   * Không ghi Supabase; mất khi refresh hoặc rời trang.
   */
  quantities: AluminumEstimatorQuantitiesBySystem;
  /**
   * Đơn giá (+ note) theo từng màu → hệ → dòng.
   * Đây là phần được lưu và đồng bộ.
   */
  unitPricesByColor: AluminumEstimatorUnitPricesByColor;
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

export const EMPTY_ALUMINUM_PRICE: AluminumEstimatorPriceState = {
  unitPrice: '',
  note: '',
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Chuẩn hoá nhãn màu cũ (Ghi Xanh / Vân Gỗ Trắc / …) về 2 màu mới. */
export function normalizeAluminumColor(value: unknown): AluminumColor {
  if (typeof value !== 'string') return DEFAULT_ALUMINUM_COLOR;
  const raw = value.trim();
  if (!raw) return DEFAULT_ALUMINUM_COLOR;
  if ((ALUMINUM_COLORS as readonly string[]).includes(raw)) return raw as AluminumColor;

  const lower = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (lower.includes('ghi') || lower.includes('cafe') || lower.includes('cage') || lower.includes('xanh')) {
    return 'Ghi - Cafe';
  }
  if (lower.includes('go') || lower.includes('van') || lower.includes('trac') || lower.includes('lim')) {
    return 'Vân Gỗ';
  }
  return DEFAULT_ALUMINUM_COLOR;
}

export function createDefaultAluminumEstimatorState(): AluminumEstimatorPageState {
  return {
    selectedSystemId: ALUMINUM_SYSTEMS[0]?.id ?? '',
    quantities: {},
    unitPricesByColor: {},
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

/** Ô nhập của một dòng = SL session + đơn giá của màu đang chọn. */
export function getAluminumEstimatorInput(
  state: AluminumEstimatorPageState,
  systemId: string,
  rowId: string,
): AluminumEstimatorInputState {
  const price = state.unitPricesByColor[state.color]?.[systemId]?.[rowId];
  return {
    quantity: state.quantities[systemId]?.[rowId] ?? '',
    unitPrice: price?.unitPrice ?? '',
    note: price?.note ?? '',
  };
}

function normalizePriceState(value: unknown): AluminumEstimatorPriceState | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<AluminumEstimatorPriceState & AluminumEstimatorInputState>;
  const unitPrice = typeof draft.unitPrice === 'string' ? draft.unitPrice : '';
  const note = typeof draft.note === 'string' ? draft.note : '';
  if (!unitPrice && !note) return null;
  return { unitPrice, note };
}

function normalizeUnitPricesByColor(value: unknown): AluminumEstimatorUnitPricesByColor {
  if (!value || typeof value !== 'object') return {};

  const byColor: AluminumEstimatorUnitPricesByColor = {};
  Object.entries(value as Record<string, unknown>).forEach(([rawColor, systems]) => {
    if (!systems || typeof systems !== 'object') return;
    const color = normalizeAluminumColor(rawColor);
    const systemMap: Record<string, Record<string, AluminumEstimatorPriceState>> = byColor[color] ?? {};
    Object.entries(systems as Record<string, unknown>).forEach(([systemId, rows]) => {
      if (!rows || typeof rows !== 'object') return;
      const rowMap: Record<string, AluminumEstimatorPriceState> = systemMap[systemId] ?? {};
      Object.entries(rows as Record<string, unknown>).forEach(([rowId, input]) => {
        const price = normalizePriceState(input);
        if (price) rowMap[rowId] = price;
      });
      if (Object.keys(rowMap).length > 0) systemMap[systemId] = rowMap;
    });
    if (Object.keys(systemMap).length > 0) byColor[color] = systemMap;
  });

  return byColor;
}

/** Legacy: một bảng inputRows chung cho màu đang chọn → tách đơn giá (bỏ SL). */
function migrateLegacyInputRows(
  inputRows: unknown,
  color: AluminumColor,
): AluminumEstimatorUnitPricesByColor {
  if (!inputRows || typeof inputRows !== 'object') return {};
  const systemMap: Record<string, Record<string, AluminumEstimatorPriceState>> = {};
  Object.entries(inputRows as Record<string, unknown>).forEach(([systemId, rows]) => {
    if (!rows || typeof rows !== 'object') return;
    const rowMap: Record<string, AluminumEstimatorPriceState> = {};
    Object.entries(rows as Record<string, unknown>).forEach(([rowId, input]) => {
      const price = normalizePriceState(input);
      if (price) rowMap[rowId] = price;
    });
    if (Object.keys(rowMap).length > 0) systemMap[systemId] = rowMap;
  });
  return Object.keys(systemMap).length > 0 ? { [color]: systemMap } : {};
}

function priceEquals(
  left: AluminumEstimatorPriceState | undefined,
  right: AluminumEstimatorPriceState | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  return left.unitPrice === right.unitPrice && left.note === right.note;
}

function unitPricesByColorEquals(
  left: AluminumEstimatorUnitPricesByColor,
  right: AluminumEstimatorUnitPricesByColor,
): boolean {
  const colors = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const color of colors) {
    const leftSystems = left[color] ?? {};
    const rightSystems = right[color] ?? {};
    const systemIds = new Set([...Object.keys(leftSystems), ...Object.keys(rightSystems)]);
    for (const systemId of systemIds) {
      const leftRows = leftSystems[systemId] ?? {};
      const rightRows = rightSystems[systemId] ?? {};
      const rowIds = new Set([...Object.keys(leftRows), ...Object.keys(rightRows)]);
      for (const rowId of rowIds) {
        if (!priceEquals(leftRows[rowId], rightRows[rowId])) return false;
      }
    }
  }
  return true;
}

/**
 * So sánh phần được lưu (màu, hệ, đơn giá theo màu).
 * Cố ý bỏ qua quantities — SL session không được coi là dirty lưu.
 */
export function aluminumEstimatorStateContentEquals(
  left: AluminumEstimatorPageState,
  right: AluminumEstimatorPageState,
): boolean {
  if (left.selectedSystemId !== right.selectedSystemId) return false;
  if (normalizeAluminumColor(left.color) !== normalizeAluminumColor(right.color)) return false;
  return unitPricesByColorEquals(left.unitPricesByColor, right.unitPricesByColor);
}

/**
 * Merge update từ server: đơn giá theo màu là ranh giới conflict.
 * Quantities luôn giữ local (session), remote không mang SL.
 */
export function mergeAluminumEstimatorStates(
  base: AluminumEstimatorPageState,
  local: AluminumEstimatorPageState,
  remote: AluminumEstimatorPageState,
): AluminumEstimatorPageState {
  const unitPricesByColor: AluminumEstimatorUnitPricesByColor = {};
  const colors = new Set([
    ...Object.keys(base.unitPricesByColor),
    ...Object.keys(local.unitPricesByColor),
    ...Object.keys(remote.unitPricesByColor),
  ]);

  for (const color of colors) {
    const baseSystems = base.unitPricesByColor[color] ?? {};
    const localSystems = local.unitPricesByColor[color] ?? {};
    const remoteSystems = remote.unitPricesByColor[color] ?? {};
    const mergedSystems: Record<string, Record<string, AluminumEstimatorPriceState>> = {};
    const systemIds = new Set([
      ...Object.keys(baseSystems),
      ...Object.keys(localSystems),
      ...Object.keys(remoteSystems),
    ]);

    for (const systemId of systemIds) {
      const baseRows = baseSystems[systemId] ?? {};
      const localRows = localSystems[systemId] ?? {};
      const remoteRows = remoteSystems[systemId] ?? {};
      const mergedRows: Record<string, AluminumEstimatorPriceState> = {};
      const rowIds = new Set([
        ...Object.keys(baseRows),
        ...Object.keys(localRows),
        ...Object.keys(remoteRows),
      ]);

      for (const rowId of rowIds) {
        const localChanged = !priceEquals(localRows[rowId], baseRows[rowId]);
        const chosen = localChanged ? localRows[rowId] : remoteRows[rowId];
        if (chosen) mergedRows[rowId] = { ...chosen };
      }

      if (Object.keys(mergedRows).length > 0) mergedSystems[systemId] = mergedRows;
    }

    if (Object.keys(mergedSystems).length > 0) unitPricesByColor[color] = mergedSystems;
  }

  const selectedSystemId = local.selectedSystemId !== base.selectedSystemId
    ? local.selectedSystemId
    : remote.selectedSystemId;
  const color = local.color !== base.color ? local.color : remote.color;

  // SL chỉ session: luôn giữ local; remote/base không có (hoặc rỗng).
  const mergedContent: AluminumEstimatorPageState = {
    selectedSystemId,
    color: normalizeAluminumColor(color),
    quantities: local.quantities,
    unitPricesByColor,
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
  const parsed = value as Partial<AluminumEstimatorPageState & AluminumCalculationRecord>;
  if (!parsed.selectedSystemId) return null;

  const color = normalizeAluminumColor(parsed.color);
  let unitPricesByColor = normalizeUnitPricesByColor(parsed.unitPricesByColor);

  // Bản cũ chỉ có inputRows + 1 màu: chuyển đơn giá sang màu đó, bỏ SL.
  if (Object.keys(unitPricesByColor).length === 0 && parsed.inputRows) {
    unitPricesByColor = migrateLegacyInputRows(parsed.inputRows, color);
  }

  return {
    selectedSystemId: parsed.selectedSystemId,
    color,
    // SL không bao giờ load từ server.
    quantities: {},
    unitPricesByColor,
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
    unitPricesByColor: state.unitPricesByColor,
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
    color: normalizeAluminumColor(record.color),
    quantities: {},
    unitPricesByColor: normalizeUnitPricesByColor(record.unitPricesByColor),
    updatedAt: record.updatedAt,
  };
}

/** Còn SL session > 0 (dùng UI / beforeunload nếu cần). */
export function isAluminumEstimatorDirty(state: AluminumEstimatorPageState): boolean {
  return Object.values(state.quantities).some((systemRows) =>
    Object.values(systemRows).some((qty) => parseEstimatorNumber(qty) > 0),
  );
}

/** Xoá toàn bộ SL session; giữ đơn giá đã lưu theo màu. */
export function clearAluminumEstimatorQuantities(state: AluminumEstimatorPageState): AluminumEstimatorPageState {
  if (Object.keys(state.quantities).length === 0) return state;
  return { ...state, quantities: {} };
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
    // Chỉ lưu đơn giá theo màu — không lưu SL.
    unitPricesByColor: normalizeUnitPricesByColor(state.unitPricesByColor),
    color: normalizeAluminumColor(state.color),
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
    if (applied) {
      // Giữ SL session local khi server xác nhận (server không có quantities).
      const snap = snapshotFromHosted(applied);
      if (snap.state) {
        snap.state = { ...snap.state, quantities: local.quantities };
      }
      return snap;
    }

    const remote = await readHostedSnapshot();
    const remoteState = pageStateOrDefault(remote);
    local = mergeAluminumEstimatorStates(pageStateOrDefault(base), local, remoteState);
    if (aluminumEstimatorStateContentEquals(local, remoteState)) {
      return {
        ...remote,
        state: remote.state
          ? { ...remote.state, quantities: local.quantities }
          : { ...createDefaultAluminumEstimatorState(), quantities: local.quantities },
      };
    }
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
