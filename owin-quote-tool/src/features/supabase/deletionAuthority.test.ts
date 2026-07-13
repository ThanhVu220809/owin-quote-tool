import { describe, expect, it } from 'vitest';
import type { ProductRecord, QuoteRecord } from '@/types/models';
import { productFromRow } from './productsRepo';
import { quoteFromRow } from './quotesRepo';

const staleDeletedAt = '2026-07-01T00:00:00.000Z';

describe('Supabase indexed deletion state', () => {
  it('keeps a product active when deleted_at is explicitly null', () => {
    const product = productFromRow({
      id: 'product-1',
      revision: 1,
      deleted_at: null,
      data: {
        id: 'product-1',
        deleted: true,
        deletedAt: staleDeletedAt,
      } as ProductRecord,
    });

    expect(product.deleted).toBeUndefined();
    expect(product.deletedAt).toBeNull();
  });

  it('keeps a quote active when deleted_at is explicitly null', () => {
    const quote = quoteFromRow({
      id: 'quote-1',
      revision: 1,
      deleted_at: null,
      data: {
        id: 'quote-1',
        deleted: true,
        deletedAt: staleDeletedAt,
      } as QuoteRecord,
    });

    expect(quote.deleted).toBeUndefined();
    expect(quote.deletedAt).toBeNull();
  });
});
