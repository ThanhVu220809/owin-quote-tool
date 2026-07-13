/**
 * Supabase repository for the product catalogue.
 *
 * Postgres is the source of truth. The complete ProductRecord is kept in the
 * `data` jsonb column while the other columns make sorting/filtering cheap.
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
  revision: number;
  deleted_at: string | null;
}

let realtimeChannelSequence = 0;

export type RealtimeSubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

function deletedAtFromProduct(product: ProductRecord): string | null {
  if (product.deletedAt) return product.deletedAt;
  return product.deleted ? product.updatedAt : null;
}

export function rowFromProduct(product: ProductRecord): ProductRow {
  const deletedAt = deletedAtFromProduct(product);
  const data: ProductRecord = {
    ...product,
    deleted: deletedAt ? true : undefined,
    deletedAt,
  };
  // Revision belongs to the relational row. Persisting an old token inside the
  // JSON document makes diagnostics misleading after the trigger increments it.
  delete data.revision;

  return {
    id: product.id,
    code: product.code,
    name: product.name ?? null,
    category: product.category ?? null,
    unit: product.unit ?? null,
    unit_price_vnd: Math.round(Number(product.unitPriceVnd ?? 0)),
    size_text: product.rawSizeText ?? null,
    cover_image_path: product.coverImagePath ?? null,
    sort_order: product.sortOrder ?? null,
    is_public: product.isPublic ?? true,
    data,
    revision: product.revision ?? 1,
    deleted_at: deletedAt,
  };
}

/** Restore deletion state from indexed columns, including rows made by older clients. */
export function productFromRow(
  row: Pick<ProductRow, 'id' | 'data' | 'revision' | 'deleted_at'>,
): ProductRecord {
  // The indexed column is authoritative even when it is explicitly NULL.
  // Falling back from NULL to stale JSON would hide a live row forever.
  const deletedAt = row.deleted_at;
  return {
    ...row.data,
    id: row.id,
    revision: row.revision,
    deleted: deletedAt ? true : undefined,
    deletedAt,
  };
}

async function selectProducts(includeDeleted: boolean): Promise<ProductRecord[]> {
  const pageSize = 1_000;
  const records: ProductRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('products')
      .select('id,data,revision,deleted_at')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('code', { ascending: true })
      .range(from, from + pageSize - 1);
    if (!includeDeleted) query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    records.push(...(data ?? []).map((row) =>
      productFromRow(row as Pick<ProductRow, 'id' | 'data' | 'revision' | 'deleted_at'>),
    ));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return records;
}

/** Read active products in catalogue order. */
export async function listProducts(): Promise<ProductRecord[]> {
  return selectProducts(false);
}

/** Read active rows and tombstones. Used by compatibility/migration code only. */
export async function listProductsRaw(): Promise<ProductRecord[]> {
  return selectProducts(true);
}

/** Read one product, including a soft-deleted row. */
export async function getProductById(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id,data,revision,deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? productFromRow(data as Pick<ProductRow, 'id' | 'data' | 'revision' | 'deleted_at'>)
    : null;
}

export type CasWriteStatus = 'applied' | 'conflict' | 'deleted' | 'missing';

export interface ProductCasWriteResult {
  status: CasWriteStatus;
  record: ProductRecord | null;
}

interface ProductCasPayload {
  status?: CasWriteStatus;
  id?: string;
  data?: ProductRecord;
  revision?: number;
  deleted_at?: string | null;
}

/** Compare-and-swap one product. Conflict payloads include the newest document for a 3-way retry. */
export async function compareAndSwapProduct(
  product: ProductRecord,
  expectedRevision: number | null,
): Promise<ProductCasWriteResult> {
  const proposed = rowFromProduct(product).data;
  const { data, error } = await supabase.rpc('save_product_cas', {
    proposed,
    expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as ProductCasPayload;
  const status = payload.status;
  if (!status || !['applied', 'conflict', 'deleted', 'missing'].includes(status)) {
    throw new Error('Supabase trả về kết quả lưu sản phẩm không hợp lệ.');
  }
  const record = payload.data && payload.id && Number.isFinite(Number(payload.revision))
    ? productFromRow({
        id: payload.id,
        data: payload.data,
        revision: Number(payload.revision),
        deleted_at: payload.deleted_at ?? null,
      })
    : null;
  return { status, record };
}

/** Insert or replace one complete product document. */
export async function upsertProduct(product: ProductRecord): Promise<void> {
  const { error } = await supabase
    .from('products')
    .upsert(rowFromProduct(product), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

/** Upsert complete product documents in bounded batches. */
export async function upsertProductsBatch(products: ProductRecord[], chunk = 200): Promise<void> {
  for (let index = 0; index < products.length; index += chunk) {
    const rows = products.slice(index, index + chunk).map(rowFromProduct);
    if (rows.length === 0) continue;
    const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
}

/** Soft-delete both the indexed row and its complete json document. */
export async function softDeleteProduct(id: string): Promise<void> {
  const existing = await getProductById(id);
  if (!existing) return;
  const deletedAt = existing.deletedAt ?? new Date().toISOString();
  await upsertProduct({
    ...existing,
    deleted: true,
    deletedAt,
    updatedAt: deletedAt,
  });
}

/** Atomically update only sort fields; never replace product documents read earlier. */
export async function setHostedProductOrder(orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_product_order', { ordered_ids: orderedIds });
  if (error) throw new Error(error.message);
}

/** Atomically update only prices for active rows. */
export async function adjustHostedProductPrices(percentChange: number): Promise<void> {
  const { error } = await supabase.rpc('adjust_product_prices', { percent_change: percentChange });
  if (error) throw new Error(error.message);
}

/** Subscribe to inserts, updates and deletes made by every authenticated client. */
export function subscribeToProducts(
  onChange: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus, error?: Error) => void,
): () => void {
  realtimeChannelSequence += 1;
  const channel = supabase
    .channel(`products-live-${realtimeChannelSequence}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => onChange(),
    )
    .subscribe((status, error) => onStatus?.(status, error));

  return () => {
    void supabase.removeChannel(channel).catch(() => undefined);
  };
}
