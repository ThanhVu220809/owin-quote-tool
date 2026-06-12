/**
 * KHO SẢN PHẨM GỐC (catalog) — lưu METADATA trong IndexedDB qua localforage.
 *
 * HẰNG SỐ NGHIỆP VỤ:
 *  - BR-8: xoá = tombstone (`deleted:true` + cập nhật `updatedAt`), KHÔNG xoá cứng,
 *          để sync không hồi sinh.
 *  - BR-9: store này chỉ giữ metadata/giá; bytes ảnh nằm ở store 'images' (imageStorage),
 *          record sản phẩm chỉ tham chiếu qua `imageId`.
 */

import localforage from 'localforage';
import type { Product } from '@/types/models';
import initialData from '@/data/initialData.json';

const productStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'products',
  driver: localforage.INDEXEDDB,
  description: 'Sản phẩm gốc (metadata) — BR-9 tách ảnh',
});

const SEED_FLAG = '__seeded__';

/** Nạp dữ liệu mẫu lần đầu (chỉ chạy 1 lần). */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await productStore.getItem<boolean>(SEED_FLAG);
  if (seeded) return;
  for (const p of initialData.products as Product[]) {
    await productStore.setItem(p.id, p);
  }
  await productStore.setItem(SEED_FLAG, true);
}

/** Tất cả sản phẩm CÒN SỐNG (đã lọc tombstone). Dùng cho UI. */
export async function getAllProducts(): Promise<Product[]> {
  const out: Product[] = [];
  await productStore.iterate<Product, void>((value, key) => {
    if (key === SEED_FLAG) return;
    if (value && !value.deleted) out.push(value);
  });
  // Sắp xếp ổn định theo mã cho dễ nhìn.
  return out.sort((a, b) => a.ma.localeCompare(b.ma));
}

/** Tất cả record KỂ CẢ tombstone — dùng cho sync/test. */
export async function getAllProductsRaw(): Promise<Product[]> {
  const out: Product[] = [];
  await productStore.iterate<Product, void>((value, key) => {
    if (key === SEED_FLAG) return;
    if (value) out.push(value);
  });
  return out;
}

export async function getProduct(id: string): Promise<Product | null> {
  if (id === SEED_FLAG) return null;
  return productStore.getItem<Product>(id);
}

/** Tạo/sửa sản phẩm. Tự gắn id (nếu thiếu) + cập nhật updatedAt. */
export async function saveProduct(
  p: Omit<Product, 'id' | 'updatedAt'> & { id?: string; updatedAt?: string },
): Promise<Product> {
  const id = p.id ?? crypto.randomUUID();
  const saved: Product = {
    ...p,
    id,
    ma: (p.ma ?? '').toUpperCase(),
    updatedAt: new Date().toISOString(),
  };
  await productStore.setItem(id, saved);
  return saved;
}

/** Xoá mềm (tombstone, BR-8). Record vẫn nằm trong IndexedDB với deleted:true. */
export async function deleteProduct(id: string): Promise<void> {
  const existing = await productStore.getItem<Product>(id);
  if (!existing) return;
  await productStore.setItem(id, {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
  });
}

/** Ghi hàng loạt (dùng sau khi merge sync). Giữ nguyên updatedAt từ bản merge. */
export async function bulkPut(products: Product[]): Promise<void> {
  for (const p of products) {
    await productStore.setItem(p.id, p);
  }
}

/** Dùng cho test: xoá sạch store (kể cả seed flag). */
export async function _clearAll(): Promise<void> {
  await productStore.clear();
}

export { productStore };
