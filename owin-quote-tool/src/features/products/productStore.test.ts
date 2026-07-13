import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductRecord } from '@/types/models';

const productDb = vi.hoisted(() => new Map<string, ProductRecord>());

vi.mock('@/features/supabase/productsRepo', () => ({
  listProducts: vi.fn(async () =>
    Array.from(productDb.values()).filter((product) => !product.deleted && !product.deletedAt),
  ),
  listProductsRaw: vi.fn(async () => Array.from(productDb.values())),
  getProductById: vi.fn(async (id: string) => productDb.get(id) ?? null),
  upsertProduct: vi.fn(async (product: ProductRecord) => {
    productDb.set(product.id, product);
  }),
  upsertProductsBatch: vi.fn(async (products: ProductRecord[]) => {
    for (const product of products) productDb.set(product.id, product);
  }),
}));

import {
  seedIfEmpty,
  getAllProducts,
  getAllProductsRaw,
  getProduct,
  saveProduct,
  deleteProduct,
  bulkAdjustProductPrices,
} from '@/features/products/productStore';

beforeEach(() => {
  productDb.clear();
});

describe('Supabase-only catalogue', () => {
  it('does not repopulate an intentionally empty remote catalogue', async () => {
    await seedIfEmpty();
    expect(await getAllProducts()).toEqual([]);
    expect(await getAllProductsRaw()).toEqual([]);
  });

  it('normalizes and persists products through the remote repository', async () => {
    const product = await saveProduct({
      dvt: 'm²', ten: 'Test', ma: 's9', donGiaGoc: 1000, accessories: [],
    });

    expect(product.ma).toBe('S9');
    expect(productDb.get(product.id)).toEqual(expect.objectContaining({ code: 'S9' }));
    expect((await getAllProductsRaw()).find((item) => item.id === product.id)?.code).toBe('S9');
  });
});

describe('soft deletes and timestamps', () => {
  it('hides a deleted product but retains its Supabase tombstone', async () => {
    const product = await saveProduct({
      dvt: 'm²', ten: 'X', ma: 'X1', donGiaGoc: 1000, accessories: [],
    });
    await deleteProduct(product.id);

    expect((await getAllProducts()).find((item) => item.id === product.id)).toBeUndefined();
    expect((await getProduct(product.id))?.deleted).toBe(true);
    expect((await getAllProductsRaw()).find((item) => item.id === product.id)?.deleted).toBe(true);
  });

  it('moves updatedAt forward when editing a price', async () => {
    const product = await saveProduct({
      dvt: 'm²', ten: 'Y', ma: 'Y1', donGiaGoc: 2_000_000, accessories: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const edited = await saveProduct({ ...product, donGiaGoc: 1_900_000 });

    expect(edited.id).toBe(product.id);
    expect(edited.donGiaGoc).toBe(1_900_000);
    expect(new Date(edited.updatedAt).getTime()).toBeGreaterThan(new Date(product.updatedAt).getTime());
  });
});

describe('bulk price adjustment', () => {
  it('updates active products and leaves deleted tombstones untouched', async () => {
    const active = await saveProduct({ code: 'ACTIVE', name: 'Active', category: 'Cửa', unit: 'M2', unitPriceVnd: 1_000_000 });
    const deleted = await saveProduct({ code: 'DELETED', name: 'Deleted', category: 'Cửa', unit: 'M2', unitPriceVnd: 2_000_000 });
    await deleteProduct(deleted.id);
    await bulkAdjustProductPrices(10);

    const raw = await getAllProductsRaw();
    expect(raw.find((product) => product.id === active.id)?.unitPriceVnd).toBe(1_100_000);
    expect(raw.find((product) => product.id === deleted.id)?.unitPriceVnd).toBe(2_000_000);
    expect(raw.find((product) => product.id === deleted.id)?.deleted).toBe(true);
  });
});
