/**
 * Đồng bộ 2 chiều nhẹ với Supabase:
 *  - pullAll(): Supabase → IndexedDB (lúc đăng nhập). Merge theo id (KHÔNG xoá local).
 *    Ảnh không tải blob — record giữ URL CDN, <img> tự lấy khi cần → hết "nặng lâu".
 *  - pushAll(): IndexedDB → Supabase (khi có thay đổi). Upsert theo id.
 */
import { getAllProductsRaw, bulkPut } from '@/features/products/productStore';
import { getAllQuotesRaw, bulkPutQuotes } from '@/features/quote/quoteStore';
import { notifyProductsChanged } from '@/features/products/productEvents';
import { listProducts, upsertProductsBatch } from './productsRepo';
import { listQuotes, upsertQuotesBatch } from './quotesRepo';

export async function pullAll(): Promise<{ products: number; quotes: number }> {
  const [products, quotes] = await Promise.all([listProducts(), listQuotes()]);
  if (products.length) await bulkPut(products);
  if (quotes.length) await bulkPutQuotes(quotes);
  // Chỉ báo products-changed (KHÔNG phát local-data-changed để tránh kích pushAll lặp).
  notifyProductsChanged();
  return { products: products.length, quotes: quotes.length };
}

export async function pushAll(): Promise<void> {
  const [products, quotes] = await Promise.all([getAllProductsRaw(), getAllQuotesRaw()]);
  await upsertProductsBatch(products.filter((p) => !p.deletedAt));
  await upsertQuotesBatch(quotes.filter((q) => !q.deletedAt));
}
