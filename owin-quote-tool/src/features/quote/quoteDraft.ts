/* stripPhantomFixedPackage keeps its `let parsed = null` seed for the try/catch below. */
/* eslint-disable no-useless-assignment */
import type { QuoteInput, QuoteItemInput, QuoteRecord } from '@/types/models';
import {
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
  syncFixedPackageQuantityToTotalSl,
} from '@/lib/quote/accessoryDrafts';
import { sumItemDimensionQuantity } from '@/features/quote/quoteItemOrder';
import { documentsEqual } from '@/services/supabase/threeWayMerge';

/**
 * Công thức thuần của bản nháp báo giá: chuẩn hoá hạng mục, đồng bộ SL bộ phụ kiện,
 * dựng patch gửi Supabase và đọc snapshot đã lưu ra input của form.
 * Mọi thân hàm ở đây chép nguyên văn từ QuoteView.tsx — đừng "sửa cho gọn".
 */

export function makeItemCode(index: number): string {
  return `HM-${String(index + 1).padStart(2, '0')}`;
}

export function makeItemUiKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `qi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function changedQuoteSaveInput(
  previousForm: QuoteInput | null,
  currentForm: QuoteInput,
  candidate: Partial<QuoteRecord>,
  includeExports: boolean,
): Partial<QuoteRecord> {
  if (!previousForm) return candidate;
  const patch: Partial<QuoteRecord> = {
    id: candidate.id,
    code: candidate.code,
    status: candidate.status,
  };
  const changed = <K extends keyof QuoteInput>(key: K) =>
    !documentsEqual(currentForm[key], previousForm[key]);

  if (changed('customerId')) patch.customerId = candidate.customerId;
  if (changed('customerName')) patch.customerName = candidate.customerName;
  if (changed('customerPhone')) patch.customerPhone = candidate.customerPhone;
  if (changed('customerEmail')) patch.customerEmail = candidate.customerEmail;
  if (changed('customerAddress')) patch.customerAddress = candidate.customerAddress;
  if (changed('quoteDate')) patch.quoteDate = candidate.quoteDate;

  const depositChanged = changed('depositVnd');
  const itemsChanged = changed('items');
  if (depositChanged || itemsChanged) {
    patch.depositVnd = candidate.depositVnd;
    patch.subtotalProductVnd = candidate.subtotalProductVnd;
    patch.subtotalAccessoryVnd = candidate.subtotalAccessoryVnd;
    patch.totalVnd = candidate.totalVnd;
    patch.roundedTotalVnd = candidate.roundedTotalVnd;
    patch.balanceVnd = candidate.balanceVnd;
  }
  if (itemsChanged) patch.items = candidate.items;

  const visibleFormChanged =
    changed('customerId') ||
    changed('customerName') ||
    changed('customerPhone') ||
    changed('customerEmail') ||
    changed('customerAddress') ||
    changed('quoteDate') ||
    depositChanged ||
    itemsChanged;
  if (visibleFormChanged) {
    patch.snapshot = candidate.snapshot;
    patch.snapshotJson = candidate.snapshotJson;
  }
  if (includeExports) patch.exports = candidate.exports;
  return patch;
}

/** Normalize a quote item for lock/save: drop blank draft rows, keep empty-value specs. */
export function confirmNormalizeItem(item: QuoteItemInput): QuoteItemInput {
  const cleaned = cleanItemAccessoriesForPersist(item);
  const dimensions = (cleaned.dimensions || [])
    .map((line) => ({
      ...line,
      quantity: Math.max(0, Number(line.quantity || 0)),
      unitPriceVnd: Number(line.unitPriceVnd ?? cleaned.unitPriceVnd ?? 0) || 0,
      widthM: line.widthM == null || Number.isNaN(Number(line.widthM)) ? null : Number(line.widthM),
      heightM: line.heightM == null || Number.isNaN(Number(line.heightM)) ? null : Number(line.heightM),
      description: line.description?.trim() || null,
    }))
    .filter((line) => {
      const qty = Number(line.quantity || 0);
      const w = Number(line.widthM || 0);
      const h = Number(line.heightM || 0);
      const price = Number(line.unitPriceVnd || 0);
      return qty > 0 || w > 0 || h > 0 || price > 0 || Boolean(line.description);
    });

  return {
    ...cleaned,
    itemName: String(cleaned.itemName || '').trim() || 'Hạng mục',
    unitPriceVnd: Number(cleaned.unitPriceVnd || 0) || 0,
    dimensions:
      dimensions.length > 0
        ? dimensions
        : [
            {
              unit: cleaned.unit,
              widthM: cleaned.unit === 'BO' ? null : 0,
              heightM: cleaned.unit === 'BO' ? null : 0,
              quantity: 1,
              unitPriceVnd: Number(cleaned.unitPriceVnd || 0) || 0,
              description: null,
            },
          ],
    accessories: (cleaned.accessories || []).filter((accessory) => String(accessory.name || '').trim()),
  };
}

/**
 * Drop the legacy phantom "Bộ phụ kiện đi kèm / Vật tư phụ" package (0đ, all-zero qty)
 * that older quotes accidentally baked into every item. Real packages (priced, custom
 * name, or non-zero quantities) are always kept untouched.
 */
export function stripPhantomFixedPackage(value: string | null | undefined): string | null {
  if (!value) return null;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    return value;
  }
  if (!parsed || typeof parsed !== 'object') return value;
  const unitPrice = Number(parsed.unitPrice ?? parsed.unitPriceVnd ?? 0) || 0;
  const name = String(parsed.name ?? '').trim();
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const allZeroQty = items.every((entry) => Number((entry as Record<string, unknown>).quantity ?? 0) === 0);
  const onlyDefaultNames = items.every((entry) => {
    const itemName = String((entry as Record<string, unknown>).name ?? '').trim();
    return itemName === '' || itemName === 'Vật tư phụ';
  });
  const isPhantom =
    unitPrice === 0 &&
    (name === '' || name === 'Bộ phụ kiện đi kèm') &&
    allZeroQty &&
    onlyDefaultNames;
  return isPhantom ? null : value;
}

export function snapshotToInputs(quote: QuoteRecord): QuoteItemInput[] {
  return quote.snapshot.items.map((item) => ({
    sourceType: item.sourceType,
    productId: item.productId || null,
    sourceProductId: item.sourceProductId || item.productId || null,
    productCode: item.quoteItemCode || item.productCode,
    quoteItemCode: item.quoteItemCode || item.productCode,
    itemName: item.itemName,
    productType: item.productType || null,
    category: item.category || item.groupName || null,
    groupName: item.groupName || item.category || null,
    coverImagePath: item.coverImagePath || item.image || null,
    image: item.image || item.coverImagePath || null,
    imageReference: item.imageReference || item.coverImagePath || item.image || null,
    imageOverridePath: item.imageOverridePath || null,
    unit: item.unit,
    description: item.description || '',
    unitPriceVnd: item.unitPriceVnd,
    specs: item.specs || [],
    dimensions: item.dimensions.map((line) => ({
      unit: line.unit,
      widthM: line.widthM,
      heightM: line.heightM,
      quantity: line.quantity,
      unitPriceVnd: line.unitPriceVnd,
      description: line.description || null,
    })),
    accessories: item.accessories.map((accessory) => ({
      name: accessory.name,
      quantityPerSet: accessory.quantityPerSet,
      unitPriceVnd: accessory.unitPriceVnd,
      note: accessory.note || null,
      isEnabled: accessory.isEnabled !== false && accessory.enabled !== false,
    })),
    fixedAccessoryPackage: stripPhantomFixedPackage(item.fixedAccessoryPackage),
    extraAccessories: item.extraAccessories || null,
    numericId: item.numericId || null,
  }));
}

/**
 * SL bộ PK = packageQuantityPerUnit × tổng SL hạng mục.
 * - force: SL cửa đổi hoặc seed item — clear manual, auto lại (tạo shell nếu force + thiếu PK)
 * - auto: chỉ sync khi đã có bộ PK và chưa sửa tay
 */
export function withSyncedPackageQuantity(
  item: QuoteItemInput,
  mode: 'force' | 'auto' = 'force',
): QuoteItemInput {
  const totalSl = sumItemDimensionQuantity(item);
  const hasPackage = item.fixedAccessoryPackage != null && item.fixedAccessoryPackage !== '';
  if (mode === 'auto') {
    if (!hasPackage) return item;
    const draft = parseFixedAccessoriesJson(item.fixedAccessoryPackage, Math.max(1, totalSl));
    if (draft.packageQuantityManual) return item;
  }
  const nextPackage = syncFixedPackageQuantityToTotalSl(item.fixedAccessoryPackage, totalSl, {
    keepEmpty: true,
    createIfMissing: mode === 'force',
    // force = SL cửa đổi → bỏ manual; auto = giữ manual
    respectManual: mode === 'auto',
  });
  if (nextPackage === item.fixedAccessoryPackage) return item;
  return { ...item, fixedAccessoryPackage: nextPackage ?? null };
}

/** Clean blank accessory shells for calculate/save while editors keep them with keepEmpty. */
export function cleanItemAccessoriesForPersist(item: QuoteItemInput): QuoteItemInput {
  // A null/empty package must stay empty — never materialize the phantom
  // "Bộ phụ kiện đi kèm / Vật tư phụ" default that used to leak into every quote.
  const hasFixed = item.fixedAccessoryPackage != null && item.fixedAccessoryPackage !== '';
  const fixed = hasFixed ? parseFixedAccessoriesJson(item.fixedAccessoryPackage, 1) : null;
  const extras = parseExtraAccessoriesJson(item.extraAccessories);
  return {
    ...item,
    // Keep spec keys even when value is empty.
    specs: (item.specs || [])
      .map((spec, sortOrder) => ({
        key: String(spec.key || '').trim(),
        value: String(spec.value || '').trim(),
        sortOrder,
      }))
      .filter((spec) => spec.key),
    fixedAccessoryPackage: fixed ? serializeFixedAccessoriesJson(fixed) : null,
    extraAccessories: serializeExtraAccessoriesJson(extras),
  };
}
