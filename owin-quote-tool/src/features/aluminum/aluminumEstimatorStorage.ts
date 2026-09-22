import { ALUMINUM_SYSTEMS } from '@/features/aluminum/estimator/systems';
import { parseEstimatorNumber } from '@/features/aluminum/estimator/estimator';
import {
  compareAndSwapHostedAppData,
  getHostedAppData,
  getHostedAppDataVersioned,
  upsertHostedAppData,
  type HostedAppDataSnapshot,
} from '@/services/supabase/sharedDataRepo';
import type {
  AluminumCalculationRecord,
  AluminumEstimatorInputState,
  AluminumEstimatorPriceState,
  AluminumEstimatorQuantitiesBySystem,
  AluminumEstimatorRowsBySystem,
  AluminumEstimatorUnitPricesByColor,
  AluminumCustomProfile,
  AluminumCustomProfilesBySystem,
  AluminumHiddenProfileRowIdsBySystem,
} from '@/types/models';

export type {
  AluminumEstimatorInputState,
  AluminumEstimatorPriceState,
  AluminumEstimatorQuantitiesBySystem,
  AluminumEstimatorRowsBySystem,
  AluminumEstimatorUnitPricesByColor,
  AluminumCustomProfile,
  AluminumCustomProfilesBySystem,
  AluminumHiddenProfileRowIdsBySystem,
};

/** Hai màu chọn được; mỗi màu có bảng đơn giá riêng. */
export const ALUMINUM_COLORS = ['Ghi - Cafe', 'Vân Gỗ'] as const;
export type AluminumColor = (typeof ALUMINUM_COLORS)[number];
/** Mặc định Ghi - Cafe. */
export const DEFAULT_ALUMINUM_COLOR: AluminumColor = 'Ghi - Cafe';

/** Mốc quy đổi mặc định (đồng). Ghi 147k · Vân gỗ 154k. */
export const DEFAULT_COLOR_BASE_RATES: Record<AluminumColor, number> = {
  'Ghi - Cafe': 147_000,
  'Vân Gỗ': 154_000,
};

export type AluminumColorBaseRates = Record<AluminumColor, number>;

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
  /** Cây thêm thủ công, được lưu cùng bảng giá để tất cả máy thấy như nhau. */
  customProfilesBySystem: AluminumCustomProfilesBySystem;
  /** Cây catalogue bị ẩn bằng thao tác xóa trong bảng. */
  hiddenProfileRowIdsBySystem: AluminumHiddenProfileRowIdsBySystem;
  /** Luôn = DEFAULT (147k / 154k); giữ field cho compat save, không UI. */
  colorBaseRates: AluminumColorBaseRates;
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
    customProfilesBySystem: {},
    hiddenProfileRowIdsBySystem: {},
    color: DEFAULT_ALUMINUM_COLOR,
    colorBaseRates: { ...DEFAULT_COLOR_BASE_RATES },
    updatedAt: null,
  };
}

export function normalizeColorBaseRates(value: unknown): AluminumColorBaseRates {
  const defaults = { ...DEFAULT_COLOR_BASE_RATES };
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Record<string, unknown>;
  const read = (key: AluminumColor): number => {
    const n = Number(raw[key]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : defaults[key];
  };
  return {
    'Ghi - Cafe': read('Ghi - Cafe'),
    'Vân Gỗ': read('Vân Gỗ'),
  };
}

/** Làm tròn đơn giá về bội 1.000 (đồng). */
export function roundAluminumPriceToThousand(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / 1000) * 1000;
}

/** Quy đổi đơn giá giữa 2 màu theo mốc: target = source / sourceBase × targetBase (làm tròn 1.000). */
export function convertAluminumUnitPrice(
  sourcePrice: number,
  sourceBase: number,
  targetBase: number,
): number {
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) return 0;
  if (!Number.isFinite(sourceBase) || sourceBase <= 0) return 0;
  if (!Number.isFinite(targetBase) || targetBase <= 0) return 0;
  return roundAluminumPriceToThousand((sourcePrice / sourceBase) * targetBase);
}

export function formatAluminumPriceInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = roundAluminumPriceToThousand(value);
  return rounded > 0 ? String(rounded) : '';
}

export function otherAluminumColor(color: AluminumColor): AluminumColor {
  return color === 'Ghi - Cafe' ? 'Vân Gỗ' : 'Ghi - Cafe';
}

/** Ghi / xoá một ô đơn giá của một màu. */
export function writeUnitPriceForColor(
  unitPricesByColor: AluminumEstimatorUnitPricesByColor,
  color: AluminumColor,
  systemId: string,
  rowId: string,
  unitPrice: string,
  note: string,
): AluminumEstimatorUnitPricesByColor {
  const pricesForColor = { ...(unitPricesByColor[color] ?? {}) };
  const systemRows = { ...(pricesForColor[systemId] ?? {}) };
  if (!unitPrice && !note) {
    delete systemRows[rowId];
  } else {
    systemRows[rowId] = { unitPrice, note };
  }
  if (Object.keys(systemRows).length === 0) delete pricesForColor[systemId];
  else pricesForColor[systemId] = systemRows;
  const next = { ...unitPricesByColor };
  if (Object.keys(pricesForColor).length === 0) delete next[color];
  else next[color] = pricesForColor;
  return next;
}

/**
 * Khi nhập đơn giá một màu: ghi màu đó + quy đổi sang màu còn lại
 * theo mốc colorBaseRates (mặc định Ghi 147k / Vân gỗ 154k).
 * Xoá giá → xoá cả 2 màu (cùng dòng).
 */
export function applyLinkedUnitPrice(
  unitPricesByColor: AluminumEstimatorUnitPricesByColor,
  sourceColor: AluminumColor,
  systemId: string,
  rowId: string,
  unitPriceRaw: string,
  note: string,
  colorBaseRates: AluminumColorBaseRates = DEFAULT_COLOR_BASE_RATES,
): AluminumEstimatorUnitPricesByColor {
  const rates = normalizeColorBaseRates(colorBaseRates);
  const sourcePrice = parseEstimatorNumber(unitPriceRaw);
  const sourceBase = rates[sourceColor];
  const targetColor = otherAluminumColor(sourceColor);
  const targetBase = rates[targetColor];
  const prevTarget = unitPricesByColor[targetColor]?.[systemId]?.[rowId];
  const targetNote = prevTarget?.note ?? '';

  if (!sourcePrice || sourcePrice <= 0) {
    let next = writeUnitPriceForColor(unitPricesByColor, sourceColor, systemId, rowId, '', note);
    next = writeUnitPriceForColor(next, targetColor, systemId, rowId, '', targetNote);
    return next;
  }

  const targetPrice = convertAluminumUnitPrice(sourcePrice, sourceBase, targetBase);
  let next = writeUnitPriceForColor(
    unitPricesByColor,
    sourceColor,
    systemId,
    rowId,
    formatAluminumPriceInput(sourcePrice),
    note,
  );
  next = writeUnitPriceForColor(
    next,
    targetColor,
    systemId,
    rowId,
    formatAluminumPriceInput(targetPrice),
    targetNote,
  );
  return next;
}

/**
 * Đổi mốc Ghi: scale mọi đơn giá (Ghi + Vân gỗ) theo
 *   giá_mới = giá_cũ / mốc_ghi_cũ × mốc_ghi_mới
 * (không recompute lại theo mốc Vân — giữ đúng tỷ lệ giảm/tăng).
 */
export function scaleUnitPricesByGhiBaseChange(
  unitPricesByColor: AluminumEstimatorUnitPricesByColor,
  oldGhiBase: number,
  newGhiBase: number,
): AluminumEstimatorUnitPricesByColor {
  const oldBase = Number(oldGhiBase);
  const newBase = Number(newGhiBase);
  if (!Number.isFinite(oldBase) || oldBase <= 0) return unitPricesByColor;
  if (!Number.isFinite(newBase) || newBase <= 0) return unitPricesByColor;
  if (oldBase === newBase) return unitPricesByColor;

  let scaled: AluminumEstimatorUnitPricesByColor = {};
  for (const color of Object.keys(unitPricesByColor)) {
    const systems = unitPricesByColor[color] ?? {};
    for (const [systemId, rows] of Object.entries(systems)) {
      for (const [rowId, cell] of Object.entries(rows)) {
        const p = parseEstimatorNumber(cell?.unitPrice ?? '');
        const note = cell?.note ?? '';
        if (p > 0) {
          const nextPrice = convertAluminumUnitPrice(p, oldBase, newBase);
          scaled = writeUnitPriceForColor(
            scaled,
            normalizeAluminumColor(color),
            systemId,
            rowId,
            formatAluminumPriceInput(nextPrice),
            note,
          );
        } else if (note) {
          scaled = writeUnitPriceForColor(
            scaled,
            normalizeAluminumColor(color),
            systemId,
            rowId,
            '',
            note,
          );
        }
      }
    }
  }
  return scaled;
}

/**
 * Tính lại toàn bộ cặp giá theo mốc hiện tại.
 * Ưu tiên sổ Ghi - Cafe; dòng chỉ có Vân Gỗ thì quy đổi ngược.
 */
export function recomputeLinkedPricesFromBases(
  unitPricesByColor: AluminumEstimatorUnitPricesByColor,
  colorBaseRates: AluminumColorBaseRates = DEFAULT_COLOR_BASE_RATES,
): AluminumEstimatorUnitPricesByColor {
  const rates = normalizeColorBaseRates(colorBaseRates);
  const ghiCafePrices = unitPricesByColor['Ghi - Cafe'] ?? {};
  const vanGoPrices = unitPricesByColor['Vân Gỗ'] ?? {};
  let next: AluminumEstimatorUnitPricesByColor = {};

  const systemIds = new Set([...Object.keys(ghiCafePrices), ...Object.keys(vanGoPrices)]);
  for (const systemId of systemIds) {
    const ghiRows = ghiCafePrices[systemId] ?? {};
    const vanRows = vanGoPrices[systemId] ?? {};
    const rowIds = new Set([...Object.keys(ghiRows), ...Object.keys(vanRows)]);
    for (const rowId of rowIds) {
      const ghi = ghiRows[rowId];
      const van = vanRows[rowId];
      const ghiPrice = parseEstimatorNumber(ghi?.unitPrice ?? '');
      const vanPrice = parseEstimatorNumber(van?.unitPrice ?? '');
      if (ghiPrice > 0) {
        next = applyLinkedUnitPrice(
          next,
          'Ghi - Cafe',
          systemId,
          rowId,
          formatAluminumPriceInput(ghiPrice),
          ghi?.note ?? '',
          rates,
        );
      } else if (vanPrice > 0) {
        next = applyLinkedUnitPrice(
          next,
          'Vân Gỗ',
          systemId,
          rowId,
          formatAluminumPriceInput(vanPrice),
          van?.note ?? '',
          rates,
        );
      } else if (ghi?.note || van?.note) {
        if (ghi?.note) {
          next = writeUnitPriceForColor(next, 'Ghi - Cafe', systemId, rowId, '', ghi.note);
        }
        if (van?.note) {
          next = writeUnitPriceForColor(next, 'Vân Gỗ', systemId, rowId, '', van.note);
        }
      }
    }
  }
  return next;
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

function normalizeCustomProfile(value: unknown): AluminumCustomProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AluminumCustomProfile>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!id || !code || !description) return null;
  return {
    id,
    code,
    description,
    image: typeof raw.image === 'string' && raw.image.trim() ? raw.image.trim() : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
}

function normalizeCustomProfilesBySystem(value: unknown): AluminumCustomProfilesBySystem {
  if (!value || typeof value !== 'object') return {};
  const next: AluminumCustomProfilesBySystem = {};
  Object.entries(value as Record<string, unknown>).forEach(([systemId, profiles]) => {
    if (!Array.isArray(profiles)) return;
    const ids = new Set<string>();
    const valid = profiles
      .map(normalizeCustomProfile)
      .filter((profile): profile is AluminumCustomProfile => Boolean(profile))
      .filter((profile) => {
        if (ids.has(profile.id)) return false;
        ids.add(profile.id);
        return true;
      });
    if (valid.length > 0) next[systemId] = valid;
  });
  return next;
}

function normalizeHiddenProfileRowIdsBySystem(value: unknown): AluminumHiddenProfileRowIdsBySystem {
  if (!value || typeof value !== 'object') return {};
  const next: AluminumHiddenProfileRowIdsBySystem = {};
  Object.entries(value as Record<string, unknown>).forEach(([systemId, rowIds]) => {
    if (!Array.isArray(rowIds)) return;
    const valid = Array.from(new Set(rowIds.filter((rowId): rowId is string =>
      typeof rowId === 'string' && rowId.trim() !== '',
    )));
    if (valid.length > 0) next[systemId] = valid;
  });
  return next;
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

/**
 * Chuyển toàn bộ đơn giá đã nhập ở Vân Gỗ → Ghi - Cafe (ghi đè khi Vân Gỗ có giá),
 * rồi xoá sổ Vân Gỗ. Chạy idempotent mỗi lần normalize.
 */
export function transferVanGoPricesToGhiCafe(
  unitPricesByColor: AluminumEstimatorUnitPricesByColor,
): AluminumEstimatorUnitPricesByColor {
  const vanGo = unitPricesByColor['Vân Gỗ'];
  if (!vanGo || Object.keys(vanGo).length === 0) {
    // Vẫn bỏ key rỗng nếu còn.
    if (!Object.prototype.hasOwnProperty.call(unitPricesByColor, 'Vân Gỗ')) return unitPricesByColor;
    const rest = { ...unitPricesByColor };
    delete rest['Vân Gỗ'];
    return rest;
  }

  const ghi: Record<string, Record<string, AluminumEstimatorPriceState>> = {
    ...(unitPricesByColor['Ghi - Cafe'] ?? {}),
  };

  Object.entries(vanGo).forEach(([systemId, rows]) => {
    const systemRows: Record<string, AluminumEstimatorPriceState> = { ...(ghi[systemId] ?? {}) };
    Object.entries(rows).forEach(([rowId, price]) => {
      const unitPrice = String(price?.unitPrice ?? '').trim();
      const note = String(price?.note ?? '').trim();
      // Chỉ chuyển dòng có đơn giá (hoặc note).
      if (!unitPrice && !note) return;
      systemRows[rowId] = {
        unitPrice: unitPrice || systemRows[rowId]?.unitPrice || '',
        note: note || systemRows[rowId]?.note || '',
      };
    });
    if (Object.keys(systemRows).length > 0) ghi[systemId] = systemRows;
  });

  const next: AluminumEstimatorUnitPricesByColor = { ...unitPricesByColor, 'Ghi - Cafe': ghi };
  delete next['Vân Gỗ'];
  return next;
}

/** Có đơn giá nhập (chuỗi số > 0). */
export function aluminumRowHasUnitPrice(unitPrice: string | undefined): boolean {
  const n = parseEstimatorNumber(unitPrice ?? '');
  return Number.isFinite(n) && n > 0;
}

/** Có SL nhập > 0. */
export function aluminumRowHasQuantity(quantity: string | undefined): boolean {
  const n = parseEstimatorNumber(quantity ?? '');
  return Number.isFinite(n) && n > 0;
}

/**
 * Ưu tiên: đã nhập đơn giá → đã nhập SL → còn lại.
 * Trong cùng nhóm giữ thứ tự gốc (index).
 */
export function compareAluminumRowsByPriority(
  left: { unitPrice: string; quantity: string; order: number },
  right: { unitPrice: string; quantity: string; order: number },
): number {
  const rank = (row: { unitPrice: string; quantity: string }) => {
    if (aluminumRowHasUnitPrice(row.unitPrice)) return 0;
    if (aluminumRowHasQuantity(row.quantity)) return 1;
    return 2;
  };
  const byRank = rank(left) - rank(right);
  if (byRank !== 0) return byRank;
  return left.order - right.order;
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
function colorBaseRatesEquals(left: AluminumColorBaseRates, right: AluminumColorBaseRates): boolean {
  return (
    left['Ghi - Cafe'] === right['Ghi - Cafe'] && left['Vân Gỗ'] === right['Vân Gỗ']
  );
}

function customProfileEquals(
  left: AluminumCustomProfile | undefined,
  right: AluminumCustomProfile | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  return left.id === right.id
    && left.code === right.code
    && left.description === right.description
    && left.image === right.image
    && left.createdAt === right.createdAt;
}

function customProfilesBySystemEquals(
  left: AluminumCustomProfilesBySystem,
  right: AluminumCustomProfilesBySystem,
): boolean {
  const systemIds = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const systemId of systemIds) {
    const leftProfiles = left[systemId] ?? [];
    const rightProfiles = right[systemId] ?? [];
    if (leftProfiles.length !== rightProfiles.length) return false;
    for (let index = 0; index < leftProfiles.length; index += 1) {
      if (!customProfileEquals(leftProfiles[index], rightProfiles[index])) return false;
    }
  }
  return true;
}

function hiddenProfileRowIdsBySystemEquals(
  left: AluminumHiddenProfileRowIdsBySystem,
  right: AluminumHiddenProfileRowIdsBySystem,
): boolean {
  const systemIds = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const systemId of systemIds) {
    const leftIds = new Set(left[systemId] ?? []);
    const rightIds = new Set(right[systemId] ?? []);
    if (leftIds.size !== rightIds.size || [...leftIds].some((id) => !rightIds.has(id))) return false;
  }
  return true;
}

export function aluminumEstimatorStateContentEquals(
  left: AluminumEstimatorPageState,
  right: AluminumEstimatorPageState,
): boolean {
  if (left.selectedSystemId !== right.selectedSystemId) return false;
  if (normalizeAluminumColor(left.color) !== normalizeAluminumColor(right.color)) return false;
  if (!colorBaseRatesEquals(left.colorBaseRates, right.colorBaseRates)) return false;
  if (!customProfilesBySystemEquals(left.customProfilesBySystem, right.customProfilesBySystem)) return false;
  if (!hiddenProfileRowIdsBySystemEquals(left.hiddenProfileRowIdsBySystem, right.hiddenProfileRowIdsBySystem)) return false;
  return unitPricesByColorEquals(left.unitPricesByColor, right.unitPricesByColor);
}

/** Xóa catalogue là thao tác chỉ thêm ID vào danh sách ẩn, nên ghép bằng hợp tập. */
function mergeHiddenProfileRowIdsBySystem(
  ...sources: AluminumHiddenProfileRowIdsBySystem[]
): AluminumHiddenProfileRowIdsBySystem {
  const merged: AluminumHiddenProfileRowIdsBySystem = {};
  for (const source of sources) {
    Object.entries(source).forEach(([systemId, rowIds]) => {
      const combined = new Set([...(merged[systemId] ?? []), ...rowIds]);
      if (combined.size > 0) merged[systemId] = [...combined];
    });
  }
  return merged;
}

/** Ghép cây thêm thủ công theo ID; thay đổi/xóa local thắng khi cùng sửa một cây. */
function mergeCustomProfilesBySystem(
  base: AluminumCustomProfilesBySystem,
  local: AluminumCustomProfilesBySystem,
  remote: AluminumCustomProfilesBySystem,
): AluminumCustomProfilesBySystem {
  const merged: AluminumCustomProfilesBySystem = {};
  const systemIds = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const systemId of systemIds) {
    const baseRows = base[systemId] ?? [];
    const localRows = local[systemId] ?? [];
    const remoteRows = remote[systemId] ?? [];
    const byId = (rows: AluminumCustomProfile[]) => new Map(rows.map((row) => [row.id, row]));
    const baseById = byId(baseRows);
    const localById = byId(localRows);
    const remoteById = byId(remoteRows);
    const ids = new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]);
    const orderedIds = [...remoteRows.map((row) => row.id), ...localRows.map((row) => row.id)]
      .filter((id, index, all) => all.indexOf(id) === index);
    const rows: AluminumCustomProfile[] = [];
    for (const id of orderedIds) {
      if (!ids.has(id)) continue;
      const chosen = !customProfileEquals(localById.get(id), baseById.get(id))
        ? localById.get(id)
        : remoteById.get(id);
      if (chosen) rows.push({ ...chosen });
    }
    if (rows.length > 0) merged[systemId] = rows;
  }
  return merged;
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

  const colorBaseRates = !colorBaseRatesEquals(local.colorBaseRates, base.colorBaseRates)
    ? local.colorBaseRates
    : remote.colorBaseRates;
  const customProfilesBySystem = mergeCustomProfilesBySystem(
    base.customProfilesBySystem,
    local.customProfilesBySystem,
    remote.customProfilesBySystem,
  );
  const hiddenProfileRowIdsBySystem = mergeHiddenProfileRowIdsBySystem(
    base.hiddenProfileRowIdsBySystem,
    local.hiddenProfileRowIdsBySystem,
    remote.hiddenProfileRowIdsBySystem,
  );

  // SL chỉ session: luôn giữ local; remote/base không có (hoặc rỗng).
  const mergedContent: AluminumEstimatorPageState = {
    selectedSystemId,
    color: normalizeAluminumColor(color),
    quantities: local.quantities,
    unitPricesByColor,
    customProfilesBySystem,
    hiddenProfileRowIdsBySystem,
    colorBaseRates: normalizeColorBaseRates(colorBaseRates),
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

  const colorBaseRates = normalizeColorBaseRates(
    (parsed as { colorBaseRates?: unknown }).colorBaseRates,
  );
  // Fill cặp màu còn thiếu theo mốc đang lưu (mặc định 147k / 154k).
  unitPricesByColor = recomputeLinkedPricesFromBases(unitPricesByColor, colorBaseRates);
  const customProfilesBySystem = normalizeCustomProfilesBySystem(parsed.customProfilesBySystem);
  const hiddenProfileRowIdsBySystem = normalizeHiddenProfileRowIdsBySystem(parsed.hiddenProfileRowIdsBySystem);

  return {
    selectedSystemId: parsed.selectedSystemId,
    color,
    // SL không bao giờ load từ server.
    quantities: {},
    unitPricesByColor,
    customProfilesBySystem,
    hiddenProfileRowIdsBySystem,
    colorBaseRates,
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
    customProfilesBySystem: state.customProfilesBySystem,
    hiddenProfileRowIdsBySystem: state.hiddenProfileRowIdsBySystem,
    color: state.color,
    colorBaseRates: state.colorBaseRates,
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
    customProfilesBySystem: normalizeCustomProfilesBySystem(record.customProfilesBySystem),
    hiddenProfileRowIdsBySystem: normalizeHiddenProfileRowIdsBySystem(record.hiddenProfileRowIdsBySystem),
    colorBaseRates: normalizeColorBaseRates(record.colorBaseRates),
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
    customProfilesBySystem: normalizeCustomProfilesBySystem(state.customProfilesBySystem),
    hiddenProfileRowIdsBySystem: normalizeHiddenProfileRowIdsBySystem(state.hiddenProfileRowIdsBySystem),
    color: normalizeAluminumColor(state.color),
    colorBaseRates: normalizeColorBaseRates(state.colorBaseRates),
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
