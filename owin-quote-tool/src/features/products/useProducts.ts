import { useState, useEffect, useCallback } from 'react';
import type { Product, ProductRecord } from '@/types/models';
import {
  seedIfEmpty,
  getAllProductsRaw,
  toLegacyProduct,
  saveProduct as saveProductStore,
  deleteProduct as deleteProductStore,
} from '@/features/products/productStore';
import { PRODUCTS_CHANGED_EVENT } from '@/features/products/productEvents';
import { subscribeToProducts } from '@/features/supabase/productsRepo';

/** Live product catalogue backed directly by Supabase. */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productRecords, setProductRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const raw = await getAllProductsRaw();
    const active = raw.filter((product) => !product.deleted && !product.deletedAt);
    setProducts(active.map(toLegacyProduct).sort((a, b) => a.ma.localeCompare(b.ma)));
    setProductRecords(active);
  }, []);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 80);
    };

    window.addEventListener(PRODUCTS_CHANGED_EVENT, scheduleRefresh);
    const unsubscribe = subscribeToProducts(scheduleRefresh);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, scheduleRefresh);
      unsubscribe();
    };
  }, [refresh]);

  const saveProduct = useCallback(
    async (p: Parameters<typeof saveProductStore>[0]) => {
      const saved = await saveProductStore(p);
      await refresh();
      return saved;
    },
    [refresh],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      await deleteProductStore(id);
      await refresh();
    },
    [refresh],
  );

  return { products, productRecords, loading, refresh, saveProduct, deleteProduct };
}
