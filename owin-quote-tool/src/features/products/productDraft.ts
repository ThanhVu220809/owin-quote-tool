import type { ProductRecord, ProductSpecRecord, ProductUnit } from '@/types/models';
import { DEFAULT_SPEC_KEYS } from '@/features/suggestions/suggestionStore';
import type { saveProduct } from '@/features/products/productStore';

/**
 * Phần logic thuần của form sản phẩm — tách khỏi component để test được và để
 * ProductForm chỉ còn việc dựng UI.
 *
 * CÔNG THỨC GIỮ NGUYÊN so với bản trước khi tách (xem productDraft.test.ts):
 * m² = rộng × cao, md = rộng + cao, bộ = 1; tất cả làm tròn 3 số lẻ.
 */

export type SaveProductInput = Parameters<typeof saveProduct>[0];
export type SavedProduct = Awaited<ReturnType<typeof saveProduct>>;
export type SpecDraft = ProductSpecRecord & { id: string };

export function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `product-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sản phẩm đang sửa dùng đúng thông số đã lưu; sản phẩm mới mở sẵn bộ khoá mặc định. */
export function normalizeSpecs(editing: ProductRecord | null): SpecDraft[] {
  if (editing?.specs?.length) {
    return editing.specs.map((spec, index) => ({
      ...spec,
      id: `spec-${index}-${spec.key || 'row'}`,
    }));
  }
  return DEFAULT_SPEC_KEYS.map((key, sortOrder) => ({
    id: `spec-default-${sortOrder}`,
    key,
    value: '',
    sortOrder,
  }));
}

export function parseRawSizeText(value: string | null | undefined): { width: string; height: string } {
  if (!value) return { width: '', height: '' };
  const parts = value.split(/\s*[xX*]\s*/);
  if (parts.length < 2) return { width: '', height: '' };
  return {
    width: parts[0]?.trim() ?? '',
    height: parts[1]?.trim() ?? '',
  };
}

export function parseDecimalText(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function buildRawSizeText(width: string, height: string): string | null {
  const widthM = parseDecimalText(width);
  const heightM = parseDecimalText(height);
  if (widthM <= 0 || heightM <= 0) return null;
  return `${widthM.toFixed(2)} x ${heightM.toFixed(2)}`;
}

export function calculateSampleQuantity(unit: ProductUnit, width: string, height: string): number {
  const widthValue = parseDecimalText(width);
  const heightValue = parseDecimalText(height);
  if (unit === 'M2') return Math.round(widthValue * heightValue * 1000) / 1000;
  if (unit === 'METER') return Math.round((widthValue + heightValue) * 1000) / 1000;
  return 1;
}

/** Số lượng mẫu bỏ đuôi 0 khi hiển thị: 2.400 → 2.4, 1.000 → 1. */
export function formatSampleQuantity(quantity: number): string {
  return quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Không thể kết nối Supabase. Vui lòng thử lại.';
}

/** Chỉ gửi lên Supabase những field đã đổi so với bản server đã xác nhận. */
export function changedProductFields(
  acknowledged: SaveProductInput | null,
  current: SaveProductInput,
): SaveProductInput {
  if (!acknowledged) return current;
  const patch: SaveProductInput = { id: current.id, code: current.code };
  for (const key of Object.keys(current) as (keyof SaveProductInput)[]) {
    if (key === 'id' || key === 'code') continue;
    if (JSON.stringify(current[key]) !== JSON.stringify(acknowledged[key])) {
      // TypeScript cannot correlate a dynamic key with its value, but both come
      // from the same ProductInput object and remain JSON-compatible.
      Object.assign(patch, { [key]: current[key] });
    }
  }
  return patch;
}
