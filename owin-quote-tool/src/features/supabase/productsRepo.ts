/**
 * Tầng data SẢN PHẨM trên Supabase (thay cho IndexedDB + Drive sync).
 * Lưu FULL ProductRecord trong cột jsonb `data`; tách vài cột để query/hiển thị.
 */
import type { ProductRecord } from '@/types/models';
import { supabase } from './supabaseClient';

interface ProductRow {
  id: string;
  code: string;
  name: string | null;
  category: string | null;
  unit: string | null;
  unit_price_vnd: number | null;
  size_text: string | null;
  cover_image_path: string | null;
  sort_order: number | null;
  is_public: boolean;
  data: ProductRecord;
  deleted_at: string | null;
}

export function rowFromProduct(p: ProductRecord): Omit<ProductRow, 'deleted_at'> {
  return {
    id: p.id,
    code: p.code,
    name: p.name ?? null,
    category: p.category ?? null,
    unit: p.unit ?? null,
    unit_price_vnd: Math.round(Number(p.unitPriceVnd ?? 0)),
    size_text: p.rawSizeText ?? null,
    cover_image_path: p.coverImagePath ?? null,
    sort_order: p.sortOrder ?? null,
    is_public: p.isPublic ?? true,
    data: p,
  };
}

/** Record app lấy nguyên từ jsonb `data` (không mất field). */
export function productFromRow(row: ProductRow): ProductRecord {
  return row.data;
}

/** Đọc toàn bộ sản phẩm chưa xoá, sắp theo sort_order rồi code. */
export async function listProducts(): Promise<ProductRecord[]> {
  const { data, error } = await supabase
    .from('products')
    .select('data')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { data: ProductRecord }).data);
}

/** Thêm/cập nhật 1 sản phẩm (theo id). */
export async function upsertProduct(p: ProductRecord): Promise<void> {
  const { error } = await supabase.from('products').upsert(rowFromProduct(p), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

/** Upsert hàng loạt (dùng khi migrate). Chia lô để tránh payload quá lớn. */
export async function upsertProductsBatch(products: ProductRecord[], chunk = 200): Promise<void> {
  for (let i = 0; i < products.length; i += chunk) {
    const rows = products.slice(i, i + chunk).map(rowFromProduct);
    const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
}

/** Xoá mềm (giữ dòng, set deleted_at). */
export async function softDeleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
