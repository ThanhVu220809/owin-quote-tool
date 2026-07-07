import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _clearQuotes,
  deleteQuote,
  getAllQuotes,
  getQuote,
  saveQuoteRecord,
} from './quoteStore';

beforeEach(async () => {
  await _clearQuotes();
});

describe('QuoteRecord storage', () => {
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
    expect((await getAllQuotes()).map((item) => item.id)).toContain(quote.id);
  });

  it('soft deletes quote history without removing the record', async () => {
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
  });
});
