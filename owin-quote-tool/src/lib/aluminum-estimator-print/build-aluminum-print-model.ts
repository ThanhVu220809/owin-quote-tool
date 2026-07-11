import { parseEstimatorNumber } from "@/lib/aluminum-estimator/aluminum-estimator";
import { formatAluminumPrintDate } from "@/lib/aluminum-estimator-print/aluminum-print-formatters";
import type {
  AluminumPrintInputSystem,
  AluminumPrintModel,
  AluminumPrintRow,
  AluminumPrintScope,
  AluminumPrintSystemSection,
} from "@/lib/aluminum-estimator-print/types";

export type BuildAluminumPrintModelInput = {
  title?: string;
  generatedAt?: Date;
  scope: AluminumPrintScope;
  currentSystemId: string;
  systems: AluminumPrintInputSystem[];
};

function normalizeRow(row: AluminumPrintInputSystem["rows"][number]): AluminumPrintRow {
  const quantity = Math.max(0, parseEstimatorNumber(row.quantity));
  const unitPrice = Math.max(0, parseEstimatorNumber(row.unitPrice));

  return {
    stt: row.stt,
    color: row.color,
    systemId: row.systemId,
    systemName: row.systemName,
    code: row.code,
    description: row.description,
    image: row.image ?? null,
    quantity,
    unitPrice,
    lineTotal: quantity * unitPrice,
  };
}

function shouldKeepPrintRow(row: AluminumPrintRow): boolean {
  return row.quantity > 0 || row.unitPrice > 0;
}

function buildSection(system: AluminumPrintInputSystem): AluminumPrintSystemSection | null {
  const rows = system.rows.map(normalizeRow).filter(shouldKeepPrintRow);
  if (rows.length === 0) return null;

  return {
    systemId: system.systemId,
    systemName: system.systemName,
    color: system.color,
    rows,
    totalQuantity: rows.reduce((total, row) => total + row.quantity, 0),
    totalAmount: rows.reduce((total, row) => total + row.lineTotal, 0),
  };
}

export function buildAluminumPrintModel(input: BuildAluminumPrintModelInput): AluminumPrintModel {
  const scopedSystems =
    input.scope === "current-system"
      ? input.systems.filter((system) => system.systemId === input.currentSystemId)
      : input.systems;
  const sections = scopedSystems
    .map(buildSection)
    .filter((section): section is AluminumPrintSystemSection => Boolean(section));

  return {
    title: input.title ?? "BẢNG TÍNH TẠM GIÁ NHÔM",
    generatedAt: formatAluminumPrintDate(input.generatedAt),
    scope: input.scope,
    sections,
    totalQuantity: sections.reduce((total, section) => total + section.totalQuantity, 0),
    totalAmount: sections.reduce((total, section) => total + section.totalAmount, 0),
    rowCount: sections.reduce((total, section) => total + section.rows.length, 0),
  };
}
