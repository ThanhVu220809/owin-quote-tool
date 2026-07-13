/** Supabase repository for complete quote documents. */
import type { QuoteRecord } from '@/types/models';
import { supabase } from './supabaseClient';

interface QuoteRow {
  id: string;
  code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  quote_date: string | null;
  status: string | null;
  total_vnd: number | null;
  data: QuoteRecord;
  revision: number;
  deleted_at: string | null;
}

let realtimeChannelSequence = 0;

export type RealtimeSubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

function deletedAtFromQuote(quote: QuoteRecord): string | null {
  if (quote.deletedAt) return quote.deletedAt;
  return quote.deleted ? quote.updatedAt : null;
}

function rowFromQuote(quote: QuoteRecord): QuoteRow {
  const deletedAt = deletedAtFromQuote(quote);
  const data: QuoteRecord = {
    ...quote,
    deleted: deletedAt ? true : undefined,
    deletedAt,
  };
  delete data.revision;

  return {
    id: quote.id,
    code: quote.code ?? null,
    customer_name: quote.customerName ?? null,
    customer_phone: quote.customerPhone ?? null,
    quote_date: (quote.quoteDate ?? quote.createdAt ?? null)?.slice(0, 10) ?? null,
    status: quote.status ?? null,
    total_vnd: Math.round(Number(quote.roundedTotalVnd ?? quote.totalVnd ?? 0)),
    data,
    revision: quote.revision ?? 1,
    deleted_at: deletedAt,
  };
}

export function quoteFromRow(
  row: Pick<QuoteRow, 'id' | 'data' | 'revision' | 'deleted_at'>,
): QuoteRecord {
  // The indexed column is authoritative even when it is explicitly NULL.
  // Legacy JSON may still contain a stale tombstone after a server migration.
  const deletedAt = row.deleted_at;
  return {
    ...row.data,
    id: row.id,
    revision: row.revision,
    deleted: deletedAt ? true : undefined,
    deletedAt,
  };
}

async function selectQuotes(includeDeleted: boolean): Promise<QuoteRecord[]> {
  const pageSize = 1_000;
  const records: QuoteRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('quotes')
      .select('id,data,revision,deleted_at')
      .order('quote_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (!includeDeleted) query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    records.push(...(data ?? []).map((row) =>
      quoteFromRow(row as Pick<QuoteRow, 'id' | 'data' | 'revision' | 'deleted_at'>),
    ));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return records;
}

/** Read active quote history, newest first. */
export async function listQuotes(): Promise<QuoteRecord[]> {
  return selectQuotes(false);
}

/** Read quote history including soft-deleted documents. */
export async function listQuotesRaw(): Promise<QuoteRecord[]> {
  return selectQuotes(true);
}

/** Read one quote, including a soft-deleted quote. */
export async function getQuoteById(id: string): Promise<QuoteRecord | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id,data,revision,deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? quoteFromRow(data as Pick<QuoteRow, 'id' | 'data' | 'revision' | 'deleted_at'>)
    : null;
}

export type CasWriteStatus = 'applied' | 'conflict' | 'deleted' | 'missing';

export interface QuoteCasWriteResult {
  status: CasWriteStatus;
  record: QuoteRecord | null;
}

interface QuoteCasPayload {
  status?: CasWriteStatus;
  id?: string;
  data?: QuoteRecord;
  revision?: number;
  deleted_at?: string | null;
}

/** Compare-and-swap one quote and return the latest row whenever the token is stale. */
export async function compareAndSwapQuote(
  quote: QuoteRecord,
  expectedRevision: number | null,
): Promise<QuoteCasWriteResult> {
  const proposed = rowFromQuote(quote).data;
  const { data, error } = await supabase.rpc('save_quote_cas', {
    proposed,
    expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as QuoteCasPayload;
  const status = payload.status;
  if (!status || !['applied', 'conflict', 'deleted', 'missing'].includes(status)) {
    throw new Error('Supabase trả về kết quả lưu báo giá không hợp lệ.');
  }
  const record = payload.data && payload.id && Number.isFinite(Number(payload.revision))
    ? quoteFromRow({
        id: payload.id,
        data: payload.data,
        revision: Number(payload.revision),
        deleted_at: payload.deleted_at ?? null,
      })
    : null;
  return { status, record };
}

/** Insert or replace one complete quote document. */
export async function upsertQuote(quote: QuoteRecord): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .upsert(rowFromQuote(quote), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function upsertQuotesBatch(quotes: QuoteRecord[], chunk = 100): Promise<void> {
  for (let index = 0; index < quotes.length; index += chunk) {
    const rows = quotes.slice(index, index + chunk).map(rowFromQuote);
    if (rows.length === 0) continue;
    const { error } = await supabase.from('quotes').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
}

/** Soft-delete both the indexed row and its json document. */
export async function softDeleteQuote(id: string): Promise<void> {
  const existing = await getQuoteById(id);
  if (!existing) return;
  const deletedAt = existing.deletedAt ?? new Date().toISOString();
  await upsertQuote({
    ...existing,
    deleted: true,
    deletedAt,
    updatedAt: deletedAt,
  });
}

/** Subscribe to quote changes made by every authenticated client. */
export function subscribeToQuotes(
  onChange: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus, error?: Error) => void,
): () => void {
  realtimeChannelSequence += 1;
  const channel = supabase
    .channel(`quotes-live-${realtimeChannelSequence}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quotes' },
      () => onChange(),
    )
    .subscribe((status, error) => onStatus?.(status, error));

  return () => {
    void supabase.removeChannel(channel).catch(() => undefined);
  };
}
