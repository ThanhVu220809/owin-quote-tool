import type { ProductRecord, ProductUnit, QuoteRecord } from '@/types/models';

/**
 * Nhãn và định dạng hiển thị của tab Báo giá.
 * Toàn bộ chuỗi tiếng Việt ở đây đi thẳng ra màn hình và file xuất — giữ nguyên văn.
 */

export const todayInputValue = () => new Date().toISOString().slice(0, 10);

export function operationError(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : '';
  return detail ? `${prefix}: ${detail}` : prefix;
}

export function unitLabel(unit: ProductUnit): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

export function statusLabel(status: QuoteRecord['status']): string {
  if (status === 'EXPORTED') return 'Đã xuất';
  if (status === 'SAVED') return 'Đã lưu';
  return 'Nháp';
}

export function formatShortDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('vi-VN');
}

export function unitLabelShort(unit: ProductRecord['unit']): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}
