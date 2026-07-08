import {
  formatEstimatorMoney,
  formatEstimatorQuantity,
  type AluminumEstimatorCalculatedRow,
  type AluminumEstimatorTotals,
} from "@/lib/aluminum-estimator/aluminum-estimator";
import type { AluminumEstimatorDefaultRow, AluminumSystem } from "@/lib/aluminum-estimator/aluminum-systems";

export type AluminumEstimatorSystemSummary = {
  system: Pick<AluminumSystem, "id" | "name">;
  totals: AluminumEstimatorTotals;
};

export type AluminumEstimatorCopyRow = {
  source: Pick<AluminumEstimatorDefaultRow, "stt" | "code" | "description">;
  calculated: AluminumEstimatorCalculatedRow;
};

export function buildAluminumEstimatorSummaryText(summaries: AluminumEstimatorSystemSummary[]): string {
  const activeSummaries = summaries.filter((summary) => summary.totals.enteredRowCount > 0);
  const totalQuantity = activeSummaries.reduce((total, summary) => total + summary.totals.totalQuantity, 0);
  const totalAmount = activeSummaries.reduce((total, summary) => total + summary.totals.totalAmount, 0);

  return [
    "BẢNG TÍNH TẠM NHÔM",
    `Tổng tiền: ${formatEstimatorMoney(totalAmount)} đ`,
    `Tổng SL cây: ${formatEstimatorQuantity(totalQuantity)}`,
    "Các hệ có dữ liệu:",
    ...activeSummaries.map(
      (summary) =>
        `- ${summary.system.name}: ${formatEstimatorQuantity(summary.totals.totalQuantity)} cây - ${formatEstimatorMoney(
          summary.totals.totalAmount,
        )} đ`,
    ),
  ].join("\n");
}

export function buildAluminumEstimatorDetailText(systemName: string, rows: AluminumEstimatorCopyRow[]): string {
  const activeRows = rows.filter((row) => row.calculated.quantity > 0);

  return [
    `BẢNG TÍNH TẠM NHÔM - ${systemName}`,
    "STT | Mã cây | Tên cây | SL | Đơn giá | Thành tiền",
    ...activeRows.map(
      (row) =>
        `${row.source.stt} | ${row.source.code} | ${row.source.description} | ${formatEstimatorQuantity(
          row.calculated.quantity,
        )} | ${formatEstimatorMoney(row.calculated.unitPrice)} | ${formatEstimatorMoney(row.calculated.lineTotal)}`,
    ),
  ].join("\n");
}
