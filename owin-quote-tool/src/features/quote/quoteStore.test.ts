import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteRecord } from '@/types/models';

const quoteDb = vi.hoisted(() => new Map<string, QuoteRecord>());

vi.mock('@/features/supabase/quotesRepo', () => ({
  listQuotes: vi.fn(async () =>
    Array.from(quoteDb.values()).filter((quote) => !quote.deleted && !quote.deletedAt),
  ),
  listQuotesRaw: vi.fn(async () => Array.from(quoteDb.values())),
  getQuoteById: vi.fn(async (id: string) => quoteDb.get(id) ?? null),
  upsertQuote: vi.fn(async (quote: QuoteRecord) => {
    quoteDb.set(quote.id, quote);
  }),
  upsertQuotesBatch: vi.fn(async (quotes: QuoteRecord[]) => {
    for (const quote of quotes) quoteDb.set(quote.id, quote);
  }),
  subscribeToQuotes: vi.fn(() => () => undefined),
}));

import {
  deleteQuote,
  getAllQuotes,
  getAllQuotesRaw,
  getQuote,
  saveQuoteRecord,
} from './quoteStore';

beforeEach(() => {
  quoteDb.clear();
});

describe('Supabase quote history', () => {
  it('saves quote history with a hydrated snapshot', async () => {
    const quote = await saveQuoteRecord({
      code: 'OWIN-BG-20260707-0001',
      customerName: 'Anh Nam',
      customerPhone: '0900000000',
      customerEmail: null,
      customerAddress: 'Ha Tinh',
      quoteDate: '2026-07-07',
      depositVnd: 100000,
      subtotalProductVnd: 1200000,
      subtotalAccessoryVnd: 300000,
      totalVnd: 1500000,
      roundedTotalVnd: 1500000,
      balanceVnd: 1400000,
      status: 'SAVED',
      items: [],
    });

    expect(quote.snapshot.quoteCode).toBe('OWIN-BG-20260707-0001');
    expect(quote.snapshot.summary.balanceVnd).toBe(1400000);
    expect(quoteDb.get(quote.id)?.code).toBe('OWIN-BG-20260707-0001');
    expect((await getAllQuotes()).map((item) => item.id)).toContain(quote.id);
  });

  it('soft deletes quote history without removing the remote document', async () => {
    const quote = await saveQuoteRecord({
      code: 'OWIN-BG-20260707-0002',
      customerName: 'Chi Lan',
      customerPhone: '',
      customerAddress: '',
      status: 'DRAFT',
      items: [],
    });

    await deleteQuote(quote.id);

    expect((await getAllQuotes()).find((item) => item.id === quote.id)).toBeUndefined();
    expect((await getQuote(quote.id))?.deletedAt).toEqual(expect.any(String));
    expect((await getAllQuotesRaw()).find((item) => item.id === quote.id)?.deleted).toBe(true);
  });

  it('updates an existing remote quote without changing its identity or created date', async () => {
    const original = await saveQuoteRecord({
      code: 'OWIN-BG-20260707-0003',
      customerName: 'Original customer',
      customerPhone: '',
      customerAddress: '',
      status: 'SAVED',
      items: [],
    });

    const edited = await saveQuoteRecord({
      ...original,
      customerName: 'Edited customer',
    });

    expect(edited.id).toBe(original.id);
    expect(edited.createdAt).toBe(original.createdAt);
    expect((await getQuote(original.id))?.customerName).toBe('Edited customer');
  });
});
