import type { AluminumEstimatorDefaultRow } from "@/lib/aluminum-estimator/aluminum-systems";

export type AluminumEstimatorRowInput = {
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  note?: string | null;
};

export type AluminumEstimatorCalculatedRow = {
  rowId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  hasInput: boolean;
};

export type AluminumEstimatorTotals = {
  enteredRowCount: number;
  totalQuantity: number;
  totalAmount: number;
};

const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 3,
});

export function parseEstimatorNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const raw = value.trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatEstimatorMoney(value: number): string {
  return moneyFormatter.format(value);
}

export function formatEstimatorQuantity(value: number): string {
  return quantityFormatter.format(value);
}

export function parseEstimatorInputNumber(value: number | string | null | undefined): number {
  return parseEstimatorNumber(value);
}

export function formatEstimatorInputNumber(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";

  const parsed = parseEstimatorNumber(value);
  if (parsed === 0) return "";

  return quantityFormatter.format(parsed);
}

export function calculateAluminumEstimatorRow(
  row: Pick<AluminumEstimatorDefaultRow, "rowId">,
  input: AluminumEstimatorRowInput,
): AluminumEstimatorCalculatedRow {
  const quantity = Math.max(0, parseEstimatorNumber(input.quantity));
  const unitPrice = Math.max(0, parseEstimatorNumber(input.unitPrice));

  return {
    rowId: row.rowId,
    quantity,
    unitPrice,
    lineTotal: quantity * unitPrice,
    hasInput: quantity > 0,
  };
}

export function calculateAluminumEstimatorTotals(
  rows: AluminumEstimatorCalculatedRow[],
): AluminumEstimatorTotals {
  return rows.reduce<AluminumEstimatorTotals>(
    (totals, row) => ({
      enteredRowCount: totals.enteredRowCount + (row.hasInput ? 1 : 0),
      totalQuantity: totals.totalQuantity + row.quantity,
      totalAmount: totals.totalAmount + row.lineTotal,
    }),
    {
      enteredRowCount: 0,
      totalQuantity: 0,
      totalAmount: 0,
    },
  );
}

export function isAluminumEstimatorRowActive(row: AluminumEstimatorCalculatedRow): boolean {
  return row.quantity > 0;
}
