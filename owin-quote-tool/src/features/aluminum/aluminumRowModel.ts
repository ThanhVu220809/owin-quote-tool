/**
 * Dựng dữ liệu bảng của tab "Tính nhôm": ghép dòng catalogue với ô nhập, sắp
 * thứ tự ưu tiên, cộng tổng theo hệ và đóng gói dữ liệu cho bản in.
 *
 * Tách khỏi view để test được — các hàm ở đây giữ nguyên từng ký tự so với bản
 * cũ trong AluminumEstimatorView.tsx.
 */
import {
  calculateAluminumEstimatorRow,
  calculateAluminumEstimatorTotals,
  parseEstimatorNumber,
  type AluminumEstimatorCalculatedRow,
  type AluminumEstimatorTotals,
} from '@/features/aluminum/estimator/estimator';
import {
  ALUMINUM_SYSTEMS,
  getDefaultAluminumEstimatorRows,
  type AluminumEstimatorDefaultRow,
} from '@/features/aluminum/estimator/systems';
import type { AluminumPrintInputSystem } from '@/features/aluminum/estimator/print/index';
import {
  getAluminumEstimatorInput,
  type AluminumEstimatorInputState,
  type AluminumEstimatorPageState,
} from '@/features/aluminum/aluminumEstimatorStorage';

export interface AluminumEstimatorRowViewModel {
  source: AluminumEstimatorDefaultRow;
  input: AluminumEstimatorInputState;
  calculated: AluminumEstimatorCalculatedRow;
}

export interface AluminumEstimatorSystemTotals {
  systemId: string;
  systemName: string;
  totals: AluminumEstimatorTotals;
}

export function normalizeInput(input: AluminumEstimatorInputState) {
  return {
    quantity: parseEstimatorNumber(input.quantity),
    unitPrice: parseEstimatorNumber(input.unitPrice),
    note: input.note,
  };
}

export function buildRowsForSystem(systemId: string, pageState: AluminumEstimatorPageState): AluminumEstimatorRowViewModel[] {
  const rows = getDefaultAluminumEstimatorRows(
    systemId,
    pageState.customProfilesBySystem,
    pageState.hiddenProfileRowIdsBySystem,
  ).map((raw, order) => {
    // Màu áp cho tất cả thanh theo lựa chọn ở trên.
    const source = { ...raw, color: pageState.color };
    const input = getAluminumEstimatorInput(pageState, source.systemId, source.rowId);
    const calculated = calculateAluminumEstimatorRow(source, normalizeInput(input));
    return { source, input, calculated, order };
  });
  // Ưu tiên: đã có đơn giá → đã có SL → còn lại (giữ order gốc trong nhóm).
  rows.sort((a, b) => {
    const rank = (row: (typeof rows)[number]) => {
      const price = parseEstimatorNumber(row.input.unitPrice);
      const qty = parseEstimatorNumber(row.input.quantity);
      if (price > 0) return 0;
      if (qty > 0) return 1;
      return 2;
    };
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.order - b.order;
  });
  return rows.map(({ source, input, calculated }) => ({ source, input, calculated }));
}

export function summarizeSystems(pageState: AluminumEstimatorPageState): AluminumEstimatorSystemTotals[] {
  return ALUMINUM_SYSTEMS.map((system) => {
    const rows = buildRowsForSystem(system.id, pageState);
    return {
      systemId: system.id,
      systemName: system.name,
      totals: calculateAluminumEstimatorTotals(rows.map((row) => row.calculated)),
    };
  });
}

export function buildPrintInputSystems(pageState: AluminumEstimatorPageState): AluminumPrintInputSystem[] {
  return ALUMINUM_SYSTEMS.map((system) => {
    const rows = buildRowsForSystem(system.id, pageState);
    return {
      systemId: system.id,
      systemName: system.name,
      color: pageState.color,
      // STT xuất = thứ tự sau khi ưu tiên (đơn giá / SL), không dùng STT catalogue gốc.
      rows: rows.map((row, index) => ({
        stt: index + 1,
        color: pageState.color,
        systemId: row.source.systemId,
        systemName: row.source.systemName,
        image: row.source.image,
        code: row.source.code,
        description: row.source.description,
        quantity: row.input.quantity,
        unitPrice: row.input.unitPrice,
      })),
    };
  });
}
