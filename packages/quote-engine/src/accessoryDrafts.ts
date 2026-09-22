import type { ProductUnit } from './models';
import { calculateExtraAccessoryLineTotal, normalizeUnit } from './engine';

export interface FixedAccessoryItemDraft {
  /** Stable UI key — never derive from name so clear-value cannot remount/delete the row. */
  id: string;
  name: string;
  quantity: number;
}

export interface FixedAccessoryDraft {
  name: string;
  items: FixedAccessoryItemDraft[];
  packageQuantity: number;
  unit: ProductUnit;
  unitPrice: number;
  total: number;
  /**
   * SL gốc từ SP kho (mỗi 1 cửa / 1 bộ).
   * Auto: packageQuantity = packageQuantityPerUnit × tổng SL hạng mục.
   * VD: cửa 3 cánh có sẵn 3 PK, 2 dòng → 6.
   */
  packageQuantityPerUnit?: number;
  /**
   * true = user đã sửa tay SL bộ PK.
   * Giữ số tay cho đến khi tổng SL cửa đổi (force sync → clear flag + auto lại).
   */
  packageQuantityManual?: boolean;
}

export interface ExtraAccessoryDraft {
  id: string;
  name: string;
  unit: ProductUnit;
  quantity: number;
  weight: number;
  unitPrice: number;
  amount: number;
  total: number;
  sortOrder: number;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_FIXED_ACCESSORY_ITEMS: FixedAccessoryItemDraft[] = [
  { id: 'default-vat-tu-phu', name: 'Vật tư phụ', quantity: 0 },
];

export const DEFAULT_FIXED_ACCESSORY_NAME = 'Bộ phụ kiện đi kèm';

function numberOr(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  // VN thousands: 1.023.000 or 1.023 — only when every group is 3 digits after first.
  if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
    const n = Number(body.replace(/\./g, ''));
    if (!Number.isFinite(n)) return fallback;
    return neg ? -n : n;
  }
  // Decimal "8,96" / "8.96"
  const asDecimal = Number(body.replace(',', '.'));
  if (Number.isFinite(asDecimal)) return neg ? -asDecimal : asDecimal;
  return fallback;
}

function parseJsonMaybe<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseFixedItemsText(itemsText: unknown): FixedAccessoryItemDraft[] {
  if (typeof itemsText !== 'string') return [];
  return itemsText
    .split(/\r?\n|;/)
    .map((line) => {
      const cleaned = line.replace(/^[-+•\s]*/, '').trim();
      if (!cleaned) return null;
      const match = cleaned.match(/(.*?)\s+x\s*(\d+)$/i) || cleaned.match(/(.*?)\s+(\d+)$/);
      if (match) return { id: newId(), name: match[1].trim(), quantity: numberOr(match[2], 0) };
      return { id: newId(), name: cleaned, quantity: 0 };
    })
    .filter((item): item is FixedAccessoryItemDraft => item !== null);
}

export function calculateFixedAccessoryDraftTotal(
  draft: Pick<FixedAccessoryDraft, 'packageQuantity' | 'unitPrice'>,
): number {
  return Math.round(numberOr(draft.packageQuantity, 1) * numberOr(draft.unitPrice, 0));
}

/** SL gốc tối thiểu 1 (số nguyên). */
export function normalizePackageQuantityPerUnit(value: unknown, fallback = 1): number {
  const n = Math.round(numberOr(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return Math.max(1, Math.round(numberOr(fallback, 1)) || 1);
  return n;
}

/** Tổng SL hạng mục (số cái), tối thiểu 1 khi auto. */
export function normalizeDoorTotalSl(totalSl: unknown): number {
  return Math.max(1, Math.round(Number(totalSl) || 0) || 1);
}

/**
 * SL bộ PK auto = SL_gốc_SP × tổng SL dòng hạng mục.
 * VD: perUnit 3 × doorSl 2 → 6.
 */
export function computeAutoPackageQuantity(perUnit: unknown, totalSl: unknown): number {
  return normalizePackageQuantityPerUnit(perUnit, 1) * normalizeDoorTotalSl(totalSl);
}

export function createEmptyFixedAccessoryDraft(
  packageQuantity = 1,
  packageQuantityPerUnit = 1,
): FixedAccessoryDraft {
  const perUnit = normalizePackageQuantityPerUnit(packageQuantityPerUnit, 1);
  const qty = Math.max(1, numberOr(packageQuantity, perUnit));
  return {
    name: '',
    items: [{ id: newId(), name: '', quantity: 0 }],
    packageQuantity: qty,
    packageQuantityPerUnit: perUnit,
    unit: 'BO',
    unitPrice: 0,
    total: 0,
  };
}

export function parseFixedAccessoriesJson(
  value: string | null | undefined,
  defaultPackageQuantity = 1,
): FixedAccessoryDraft {
  const fallbackQuantity = Math.max(1, numberOr(defaultPackageQuantity, 1));
  const fallback = createEmptyFixedAccessoryDraft(fallbackQuantity);
  fallback.name = DEFAULT_FIXED_ACCESSORY_NAME;
  fallback.items = DEFAULT_FIXED_ACCESSORY_ITEMS.map((item) => ({ ...item, id: newId() }));

  if (value === '' || value === 'null') {
    // Explicit empty editor shell (quote keepEmpty) — allow blank name + blank items.
    return createEmptyFixedAccessoryDraft(fallbackQuantity);
  }

  const parsed = parseJsonMaybe<Record<string, unknown> | null>(value, null);
  if (!parsed || typeof parsed !== 'object') {
    // null/undefined → product-form default shell still usable.
    if (value == null) return fallback;
    return createEmptyFixedAccessoryDraft(fallbackQuantity);
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : parseFixedItemsText(parsed.itemsText);
  const parsedItems = rawItems
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const name = String(row.name || '').trim();
      const id = String(row.id || '').trim() || `fixed-${index}-${newId()}`;
      return { id, name, quantity: numberOr(row.quantity, 0) };
    })
    // Keep blank named rows only if they have an id from an active editor payload.
    .filter((item) => item.name || item.id);

  const namedItems = parsedItems.filter((item) => item.name);
  const hasOnlyPlaceholderOneQuantities =
    namedItems.length > 1 && namedItems.every((item) => item.quantity === 1);
  // Keep blank rows too — they carry a stable id from the live editor, so "Thêm món"
  // must never vanish just because the package already has named items. Truly blank
  // packages are stripped later by the non-keepEmpty serialize on final save.
  const items = (parsedItems.length > 0 ? parsedItems : fallback.items).map((item) => ({
    ...item,
    id: item.id || newId(),
    quantity: hasOnlyPlaceholderOneQuantities && item.name ? 0 : item.quantity,
  }));

  const packageQuantity = numberOr(parsed.packageQuantity ?? parsed.quantity, fallbackQuantity);
  const unitPrice = numberOr(parsed.unitPrice ?? parsed.unitPriceVnd, 0);
  // Preserve empty package name while editing (do not force default title).
  const rawName = parsed.name;
  const name =
    rawName === undefined || rawName === null
      ? DEFAULT_FIXED_ACCESSORY_NAME
      : String(rawName).trim();
  const packageQuantityManual = Boolean(parsed.packageQuantityManual);
  // Chỉ set perUnit khi JSON có field — thiếu thì undefined để seedFromProduct
  // còn lấy packageQuantity (SL có sẵn trên SP) làm gốc.
  const hasPerUnitField =
    parsed.packageQuantityPerUnit !== undefined &&
    parsed.packageQuantityPerUnit !== null &&
    String(parsed.packageQuantityPerUnit).trim() !== '';
  const packageQuantityPerUnit = hasPerUnitField
    ? normalizePackageQuantityPerUnit(parsed.packageQuantityPerUnit, 1)
    : undefined;

  return {
    name,
    items: items.length > 0 ? items : [{ id: newId(), name: '', quantity: 0 }],
    packageQuantity,
    packageQuantityPerUnit,
    unit: 'BO',
    unitPrice,
    total: numberOr(parsed.total ?? parsed.totalVnd, packageQuantity * unitPrice),
    packageQuantityManual,
  };
}

/**
 * Serialize fixed package for storage/editor.
 * - keepEmpty: true keeps blank shells so the editor never unmounts mid-edit.
 * - Final save (keepEmpty false) drops truly blank packages.
 */
export function serializeFixedAccessoriesJson(
  value: FixedAccessoryDraft,
  options?: { keepEmpty?: boolean },
): string | null {
  const cleanItems = value.items
    .map((item) => ({
      id: item.id || newId(),
      name: item.name.trim(),
      quantity: numberOr(item.quantity, 0),
    }))
    .filter((item) => (options?.keepEmpty ? true : Boolean(item.name)));

  const unitPrice = numberOr(value.unitPrice, 0);
  const packageQuantity = Math.max(1, numberOr(value.packageQuantity, 1));
  const total = packageQuantity * unitPrice;
  const name = value.name.trim();
  const isBlank = !name && cleanItems.every((item) => !item.name) && unitPrice === 0;

  if (isBlank && !options?.keepEmpty) return null;

  const payload: Record<string, unknown> = {
    name: options?.keepEmpty ? name : name || DEFAULT_FIXED_ACCESSORY_NAME,
    items: options?.keepEmpty
      ? cleanItems
      : cleanItems.filter((item) => item.name).map(({ name: n, quantity }) => ({ name: n, quantity })),
    packageQuantity,
    unit: 'BO',
    unitPrice,
    unitPriceVnd: unitPrice,
    total,
    totalVnd: total,
  };
  // Chỉ ghi perUnit khi đã biết (seed từ SP / đã sync) — product form không bắt buộc.
  if (value.packageQuantityPerUnit != null && value.packageQuantityPerUnit > 0) {
    payload.packageQuantityPerUnit = normalizePackageQuantityPerUnit(value.packageQuantityPerUnit, 1);
  }
  if (value.packageQuantityManual) payload.packageQuantityManual = true;
  return JSON.stringify(payload);
}

export function updateFixedAccessoryDraft(
  draft: FixedAccessoryDraft,
  patch: Partial<FixedAccessoryDraft>,
): FixedAccessoryDraft {
  const next = { ...draft, ...patch };
  next.total = calculateFixedAccessoryDraftTotal(next);
  return next;
}

/**
 * Gắn SL bộ PK = packageQuantityPerUnit × tổng SL hạng mục.
 * - respectManual true (mặc định): giữ SL tay.
 * - respectManual false (khi SL cửa đổi): clear manual + auto lại.
 * - createIfMissing: shell PK rỗng với perUnit=1.
 */
export function syncFixedPackageQuantityToTotalSl(
  fixedAccessoryPackage: string | null | undefined,
  totalSl: number,
  options?: {
    keepEmpty?: boolean;
    createIfMissing?: boolean;
    /** true = giữ packageQuantityManual; false = xoá cờ và auto lại */
    respectManual?: boolean;
  },
): string | null | undefined {
  const doorSl = normalizeDoorTotalSl(totalSl);
  const keepEmpty = options?.keepEmpty ?? true;
  const respectManual = options?.respectManual ?? true;

  if (fixedAccessoryPackage == null || fixedAccessoryPackage === '') {
    if (!options?.createIfMissing) return fixedAccessoryPackage;
    // Shell mới: perUnit = 1 → SL bộ = SL cửa.
    return serializeFixedAccessoriesJson(
      createEmptyFixedAccessoryDraft(doorSl, 1),
      { keepEmpty: true },
    );
  }

  const draft = parseFixedAccessoriesJson(fixedAccessoryPackage, doorSl);
  // Đã seed → dùng perUnit; legacy không có field → 1 (SL bộ = SL cửa).
  const perUnit = normalizePackageQuantityPerUnit(draft.packageQuantityPerUnit, 1);

  if (respectManual && draft.packageQuantityManual) {
    return fixedAccessoryPackage;
  }

  const expected = computeAutoPackageQuantity(perUnit, doorSl);
  const alreadyOk =
    draft.packageQuantity === expected &&
    !draft.packageQuantityManual &&
    (draft.packageQuantityPerUnit == null || draft.packageQuantityPerUnit === perUnit);
  if (alreadyOk) {
    // Đảm bảo perUnit được ghi để lần sau không mất base.
    if (draft.packageQuantityPerUnit == null) {
      return serializeFixedAccessoriesJson(
        updateFixedAccessoryDraft(draft, {
          packageQuantity: expected,
          packageQuantityPerUnit: perUnit,
          packageQuantityManual: false,
        }),
        { keepEmpty },
      );
    }
    return fixedAccessoryPackage;
  }

  const next = updateFixedAccessoryDraft(draft, {
    packageQuantity: expected,
    packageQuantityPerUnit: perUnit,
    packageQuantityManual: false,
  });
  return serializeFixedAccessoriesJson(next, { keepEmpty });
}

/**
 * Gắn SL gốc từ SP kho vào bộ PK khi đưa SP vào báo giá.
 * packageQuantity (trên SP) = SL có sẵn mỗi 1 cửa → packageQuantityPerUnit.
 */
export function seedFixedPackageFromProduct(
  fixedAccessoryPackage: string | null | undefined,
  doorSl = 1,
): string | null {
  if (fixedAccessoryPackage == null || fixedAccessoryPackage === '') return null;
  const draft = parseFixedAccessoriesJson(fixedAccessoryPackage, 1);
  // Ưu tiên perUnit đã lưu; không thì lấy packageQuantity trên SP làm SL gốc.
  const perUnit = normalizePackageQuantityPerUnit(
    draft.packageQuantityPerUnit ?? draft.packageQuantity,
    1,
  );
  const expected = computeAutoPackageQuantity(perUnit, doorSl);
  return serializeFixedAccessoriesJson(
    updateFixedAccessoryDraft(draft, {
      packageQuantityPerUnit: perUnit,
      packageQuantity: expected,
      packageQuantityManual: false,
    }),
  );
}

export function addEmptyFixedAccessoryItem(draft: FixedAccessoryDraft): FixedAccessoryDraft {
  return updateFixedAccessoryDraft(draft, {
    items: [...draft.items, { id: newId(), name: '', quantity: 0 }],
  });
}

export function calculateAccessoryDraftTotal(input: Pick<ExtraAccessoryDraft, 'unit' | 'quantity' | 'weight' | 'unitPrice'>): number {
  return calculateExtraAccessoryLineTotal({
    unit: input.unit,
    quantity: input.quantity,
    weight: input.weight,
    unitPriceVnd: input.unitPrice,
  });
}

export function normalizeAccessoryDraft(
  input: Partial<ExtraAccessoryDraft>,
  sortOrder = 0,
): ExtraAccessoryDraft {
  const unit = normalizeUnit(input.unit || 'BO') as ProductUnit;
  // SL = số cái (thường 1). KL = md/m² để nhân tiền. Không gộp SL→KL.
  const quantity = Math.max(0, numberOr(input.quantity, 0));
  const weight = unit === 'BO' ? 0 : Math.max(0, numberOr(input.weight, 0));
  const unitPrice = numberOr(input.unitPrice, 0);
  const amount = calculateAccessoryDraftTotal({ unit, quantity, weight, unitPrice });
  return {
    id: input.id || newId(),
    name: String(input.name || ''),
    unit,
    quantity,
    weight,
    unitPrice,
    amount,
    total: amount,
    sortOrder: numberOr(input.sortOrder, sortOrder),
  };
}

export function parseExtraAccessoriesJson(value: string | null | undefined): ExtraAccessoryDraft[] {
  if (value === '' || value === 'null') return [];
  const parsed = parseJsonMaybe<unknown[]>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    return normalizeAccessoryDraft(
      {
        id: String(row.id || '') || newId(),
        name: String(row.name || ''),
        unit: normalizeUnit(String(row.unit || 'BO')) as ProductUnit,
        quantity: numberOr(row.quantity ?? row.quantityPerSet, 0),
        weight: numberOr(row.weight ?? row.kl, 0),
        unitPrice: numberOr(row.unitPrice ?? row.unitPriceVnd, 0),
        sortOrder: numberOr(row.sortOrder, index),
      },
      index,
    );
  });
}

export function serializeExtraAccessoriesJson(
  value: ExtraAccessoryDraft[],
  options?: { keepEmpty?: boolean },
): string | null {
  const mapped = value.map((item, sortOrder) => {
    const normalized = normalizeAccessoryDraft({ ...item, sortOrder }, sortOrder);
    return {
      id: normalized.id,
      name: normalized.name.trim(),
      unit: normalized.unit,
      quantity: normalized.quantity,
      weight: normalized.weight,
      unitPrice: normalized.unitPrice,
      amount: normalized.amount,
      total: normalized.amount,
      sortOrder,
    };
  });

  if (options?.keepEmpty) {
    // Preserve blank rows while editing so "Thêm phụ kiện" never vanishes.
    return JSON.stringify(mapped);
  }

  const clean = mapped.filter((item) => item.name);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

export function updateAccessoryDraftAtIndex(
  list: ExtraAccessoryDraft[],
  index: number,
  patch: Partial<ExtraAccessoryDraft>,
): ExtraAccessoryDraft[] {
  return list.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const next = { ...item, ...patch };
    if (patch.unit !== undefined) next.weight = normalizeUnit(patch.unit) === 'BO' ? 0 : next.weight || next.quantity;
    return normalizeAccessoryDraft(next, itemIndex);
  });
}

export function addEmptyAccessoryDraft(list: ExtraAccessoryDraft[]): ExtraAccessoryDraft[] {
  return [...list, normalizeAccessoryDraft({ id: newId(), unit: 'BO', quantity: 0 }, list.length)];
}
