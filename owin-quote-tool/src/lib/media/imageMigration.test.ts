import { describe, expect, it } from 'vitest';
import { backfillQuoteImageReferences } from './imageMigration';
import type { ProductRecord, QuoteRecord } from '@/types/models';

const product = { id: 'p1', code: 'A-01', name: 'Cửa A', slug: 'cua-a', coverImagePath: 'products/a/images/cover.webp' } as ProductRecord;
const quote = { id: 'q1', items: [{ id: 'i1', sourceType: 'PRODUCT', productId: null, productCode: 'A-01', itemName: 'Cửa A', imagePath: null }] } as unknown as QuoteRecord;

describe('quote image reference migration', () => {
  it('backfills by product code and is idempotent', () => {
    const first = backfillQuoteImageReferences([quote], [product]);
    expect(first.report.changed).toBe(1);
    expect(first.quotes[0].items[0].sourceProductId).toBe('p1');
    const second = backfillQuoteImageReferences(first.quotes, [product]);
    expect(second.report.changed).toBe(0);
  });

  it('does not skip a source product when only imageReference is missing', () => {
    const withSource = { ...quote, items: [{ ...quote.items[0], sourceProductId: 'p1', productId: 'p1' }] } as QuoteRecord;
    const result = backfillQuoteImageReferences([withSource], [product]);
    expect(result.report.changed).toBe(1);
    expect(result.quotes[0].items[0].imageReference).toBe(product.coverImagePath);
  });
});
