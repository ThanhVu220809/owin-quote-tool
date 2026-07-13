/**
 * Tầng data BÁO GIÁ trên Supabase. Full QuoteRecord trong jsonb `data`,
 * tách vài cột để xem tập trung/lọc.
 */
import type { QuoteRecord } from '@/types/models';
import { supabase } from './supabaseClient';

function rowFromQuote(q: QuoteRecord) {
  return {
    id: q.id,
    code: q.code ?? null,
    customer_name: q.customerName ?? null,
    customer_phone: q.customerPhone ?? null,
    quote_date: (q.quoteDate ?? q.createdAt ?? null)?.slice(0, 10) ?? null,
    status: q.status ?? null,
    total_vnd: Math.round(Number(q.roundedTotalVnd ?? q.totalVnd ?? 0)),
    data: q,
  };
}

/** Đọc toàn bộ báo giá chưa xoá, mới nhất trước. */
export async function listQuotes(): Promise<QuoteRecord[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('data')
    .is('deleted_at', null)
    .order('quote_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { data: QuoteRecord }).data);
}

export async function upsertQuotesBatch(quotes: QuoteRecord[], chunk = 100): Promise<void> {
  for (let i = 0; i < quotes.length; i += chunk) {
    const rows = quotes.slice(i, i + chunk).map(rowFromQuote);
    const { error } = await supabase.from('quotes').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
}

export async function softDeleteQuote(id: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
