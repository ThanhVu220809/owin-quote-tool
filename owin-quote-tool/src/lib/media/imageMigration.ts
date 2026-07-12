import type { ProductRecord, QuoteRecord } from '@/types/models';
import { imageReferenceForProduct } from './itemImageResolver';

export type ImageMigrationReport = { changed: number; missing: string[] };

/** Pure, idempotent backfill. It preserves all financial/content fields. */
export function backfillQuoteImageReferences(quotes: QuoteRecord[], products: ProductRecord[]): { quotes: QuoteRecord[]; report: ImageMigrationReport } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const byCode = new Map(products.map((p) => [p.code.toLowerCase(), p]));
  const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const bySlug = new Map(products.map((p) => [p.slug.toLowerCase(), p]));
  let changed = 0;
  const missing: string[] = [];
  const pick = (item: QuoteRecord['items'][number]) => {
    const snapshot = item.snapshotJson ? (() => { try { return JSON.parse(item.snapshotJson) as { itemName?: string; productCode?: string }; } catch { return {}; } })() : {};
    const id = item.sourceProductId || item.productId;
    const code = String(item.productCode || snapshot.productCode || '').toLowerCase();
    const slug = String((item as { slug?: string }).slug || '').trim().toLowerCase() || slugify(String(snapshot.itemName || item.itemName || ''));
    return (id && byId.get(id)) || (code && byCode.get(code)) || (slug && bySlug.get(slug));
  };
  const nextQuotes = quotes.map((quote) => {
    let quoteChanged = false;
    const items = quote.items.map((item) => {
      if (item.imageReference) return item;
      const product = pick(item);
      if (!product) {
        if (item.missingImageReference) return item;
        missing.push(item.productCode);
        quoteChanged = true;
        return { ...item, missingImageReference: true };
      }
      if (item.missingImageReference && !product.coverImagePath) return item;
      quoteChanged = true; changed += 1;
      const imageReference = imageReferenceForProduct(product);
      return { ...item, sourceProductId: product.id, productId: item.productId || product.id, productName: item.productName || product.name, imageReference, missingImageReference: !imageReference };
    });
    return quoteChanged ? { ...quote, items } : quote;
  });
  return { quotes: nextQuotes, report: { changed, missing: [...new Set(missing)] } };
}
