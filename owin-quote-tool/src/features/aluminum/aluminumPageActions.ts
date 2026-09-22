/**
 * Các phép cập nhật state của trang "Tính nhôm" viết dưới dạng hàm thuần
 * (state hiện tại → state mới) để view chỉ còn việc gọi setState và để test
 * khoá được công thức quy đổi mốc màu.
 *
 * Thân hàm giữ nguyên từng ký tự so với bản cũ nằm trong AluminumEstimatorView.
 */
import {
  applyLinkedUnitPrice,
  convertAluminumUnitPrice,
  DEFAULT_COLOR_BASE_RATES,
  normalizeAluminumColor,
  normalizeColorBaseRates,
  recomputeLinkedPricesFromBases,
  scaleUnitPricesByGhiBaseChange,
  touchAluminumEstimatorState,
  type AluminumColor,
  type AluminumEstimatorPageState,
  type AluminumEstimatorRowPatch,
} from '@/features/aluminum/aluminumEstimatorStorage';
import type { AluminumCustomProfile } from '@/types/models';

export type AddAluminumProfileInput = Omit<AluminumCustomProfile, 'createdAt'> & {
  /** Đơn giá nhập khi tạo, dùng làm giá của màu đang chọn. */
  unitPrice: number;
};

/** Ghi SL / đơn giá / note cho một dòng của hệ đang chọn. */
export function applyAluminumRowPatch(
  current: AluminumEstimatorPageState,
  systemId: string,
  rowId: string,
  patch: AluminumEstimatorRowPatch,
): AluminumEstimatorPageState {
  let next: AluminumEstimatorPageState = current;

  // SL chỉ session — không touch updatedAt, không kích hoạt lưu.
  if (patch.quantity !== undefined) {
    const systemQty = { ...(current.quantities[systemId] ?? {}) };
    if (!patch.quantity) delete systemQty[rowId];
    else systemQty[rowId] = patch.quantity;
    const quantities = { ...current.quantities };
    if (Object.keys(systemQty).length === 0) delete quantities[systemId];
    else quantities[systemId] = systemQty;
    next = { ...next, quantities };
  }

  // Đơn giá / note — quy đổi Ghi ↔ Vân gỗ theo mốc (2 ô dưới chip màu).
  if (patch.unitPrice !== undefined || patch.note !== undefined) {
    const color = normalizeAluminumColor(current.color);
    const prev = current.unitPricesByColor[color]?.[systemId]?.[rowId];
    const unitPrice = patch.unitPrice !== undefined ? patch.unitPrice : (prev?.unitPrice ?? '');
    const note = patch.note !== undefined ? patch.note : (prev?.note ?? '');
    const colorBaseRates = normalizeColorBaseRates(current.colorBaseRates);
    const unitPricesByColor = applyLinkedUnitPrice(
      current.unitPricesByColor,
      color,
      systemId,
      rowId,
      unitPrice,
      note,
      colorBaseRates,
    );
    next = touchAluminumEstimatorState({
      ...next,
      color,
      colorBaseRates,
      unitPricesByColor,
    });
  }

  return next;
}

/** Thêm một cây nhôm vào hệ hiện tại và ghi sẵn đơn giá cho cả hai màu. */
export function addAluminumProfile(
  current: AluminumEstimatorPageState,
  systemId: string,
  input: AddAluminumProfileInput,
): AluminumEstimatorPageState {
  const profile: AluminumCustomProfile = {
    id: input.id,
    code: input.code.trim().toUpperCase(),
    description: input.description.trim(),
    image: input.image,
    createdAt: new Date().toISOString(),
  };
  const profiles = current.customProfilesBySystem[systemId] ?? [];
  const withProfile = touchAluminumEstimatorState({
    ...current,
    customProfilesBySystem: {
      ...current.customProfilesBySystem,
      [systemId]: [...profiles, profile],
    },
  });
  return applyAluminumRowPatch(withProfile, systemId, `custom-${profile.id}`, {
    unitPrice: input.unitPrice > 0 ? String(Math.round(input.unitPrice)) : '',
  });
}

/** Xoá cây thêm thủ công cùng SL/đơn giá đang tham chiếu tới cây đó. */
export function removeAluminumProfile(
  current: AluminumEstimatorPageState,
  systemId: string,
  profileId: string,
): AluminumEstimatorPageState {
  const profiles = current.customProfilesBySystem[systemId] ?? [];
  const remaining = profiles.filter((profile) => profile.id !== profileId);
  if (remaining.length === profiles.length) return current;

  const customProfilesBySystem = { ...current.customProfilesBySystem };
  if (remaining.length === 0) delete customProfilesBySystem[systemId];
  else customProfilesBySystem[systemId] = remaining;

  const rowId = `custom-${profileId}`;
  const quantities = { ...current.quantities };
  const quantitiesForSystem = { ...(quantities[systemId] ?? {}) };
  delete quantitiesForSystem[rowId];
  if (Object.keys(quantitiesForSystem).length === 0) delete quantities[systemId];
  else quantities[systemId] = quantitiesForSystem;

  const unitPricesByColor = Object.fromEntries(
    Object.entries(current.unitPricesByColor).flatMap(([color, systems]) => {
      const nextSystems = { ...systems };
      const rows = { ...(nextSystems[systemId] ?? {}) };
      delete rows[rowId];
      if (Object.keys(rows).length === 0) delete nextSystems[systemId];
      else nextSystems[systemId] = rows;
      return Object.keys(nextSystems).length > 0 ? [[color, nextSystems]] : [];
    }),
  );

  return touchAluminumEstimatorState({
    ...current,
    quantities,
    unitPricesByColor,
    customProfilesBySystem,
  });
}

/**
 * Xóa một dòng đang hiển thị. Dòng catalogue chỉ bị ẩn khỏi bảng (và được
 * đồng bộ), còn dòng thêm thủ công được xóa hoàn toàn khỏi danh sách tùy chỉnh.
 */
export function removeAluminumRow(
  current: AluminumEstimatorPageState,
  systemId: string,
  rowId: string,
): AluminumEstimatorPageState {
  const profileId = rowId.startsWith('custom-') ? rowId.slice('custom-'.length) : '';
  if (profileId && (current.customProfilesBySystem[systemId] ?? []).some((profile) => profile.id === profileId)) {
    return removeAluminumProfile(current, systemId, profileId);
  }

  const hiddenForSystem = new Set(current.hiddenProfileRowIdsBySystem[systemId] ?? []);
  if (hiddenForSystem.has(rowId)) return current;
  hiddenForSystem.add(rowId);

  const quantities = { ...current.quantities };
  const quantitiesForSystem = { ...(quantities[systemId] ?? {}) };
  delete quantitiesForSystem[rowId];
  if (Object.keys(quantitiesForSystem).length === 0) delete quantities[systemId];
  else quantities[systemId] = quantitiesForSystem;

  const unitPricesByColor = Object.fromEntries(
    Object.entries(current.unitPricesByColor).flatMap(([color, systems]) => {
      const nextSystems = { ...systems };
      const rows = { ...(nextSystems[systemId] ?? {}) };
      delete rows[rowId];
      if (Object.keys(rows).length === 0) delete nextSystems[systemId];
      else nextSystems[systemId] = rows;
      return Object.keys(nextSystems).length > 0 ? [[color, nextSystems]] : [];
    }),
  );

  return touchAluminumEstimatorState({
    ...current,
    quantities,
    unitPricesByColor,
    hiddenProfileRowIdsBySystem: {
      ...current.hiddenProfileRowIdsBySystem,
      [systemId]: [...hiddenForSystem],
    },
  });
}

/** Đổi mốc quy đổi của một màu (2 ô số dưới chip màu). */
export function applyAluminumBaseRate(
  current: AluminumEstimatorPageState,
  color: AluminumColor,
  raw: number,
): AluminumEstimatorPageState {
  const rates = normalizeColorBaseRates(current.colorBaseRates);
  const fallback = DEFAULT_COLOR_BASE_RATES[color];
  const value = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback;
  if (value === rates[color]) return current;

  if (color === 'Ghi - Cafe') {
    // Đổi mốc Ghi: mọi đơn giá (Ghi + Vân) = cũ / mốcGhiCũ × mốcGhiMới
    // Mốc Vân cũng scale cùng tỷ lệ để cặp mốc vẫn khớp.
    const oldGhi = rates['Ghi - Cafe'];
    const newGhi = value;
    const newVan = convertAluminumUnitPrice(rates['Vân Gỗ'], oldGhi, newGhi) || rates['Vân Gỗ'];
    const unitPricesByColor = scaleUnitPricesByGhiBaseChange(
      current.unitPricesByColor,
      oldGhi,
      newGhi,
    );
    return touchAluminumEstimatorState({
      ...current,
      colorBaseRates: { 'Ghi - Cafe': newGhi, 'Vân Gỗ': newVan },
      unitPricesByColor,
    });
  }

  // Đổi mốc Vân gỗ: giữ Ghi, chỉ tính lại Vân từ Ghi theo mốc mới
  const colorBaseRates = normalizeColorBaseRates({
    ...rates,
    'Vân Gỗ': value,
  });
  const unitPricesByColor = recomputeLinkedPricesFromBases(
    current.unitPricesByColor,
    colorBaseRates,
  );
  return touchAluminumEstimatorState({
    ...current,
    colorBaseRates,
    unitPricesByColor,
  });
}

/** Chọn màu; bấm lại đúng màu đang chọn thì không đánh dấu thay đổi. */
export function selectAluminumColor(
  current: AluminumEstimatorPageState,
  color: string,
): AluminumEstimatorPageState {
  const nextColor = normalizeAluminumColor(color);
  if (normalizeAluminumColor(current.color) === nextColor) return current;
  return touchAluminumEstimatorState({ ...current, color: nextColor });
}
