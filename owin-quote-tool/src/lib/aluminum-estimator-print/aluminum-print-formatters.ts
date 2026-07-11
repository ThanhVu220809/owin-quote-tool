import { formatEstimatorMoney, formatEstimatorQuantity } from "@/lib/aluminum-estimator/aluminum-estimator";

export function formatAluminumPrintCurrency(value: number): string {
  return `${formatEstimatorMoney(value)} đ`;
}

export function formatAluminumPrintQuantity(value: number): string {
  return formatEstimatorQuantity(value);
}

export function formatAluminumPrintDate(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}
