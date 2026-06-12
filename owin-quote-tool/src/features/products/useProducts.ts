import { useState, useEffect, useCallback } from 'react';
import type { Product } from '@/types/models';
import {
  seedIfEmpty,
  getAllProducts,
  saveProduct as saveProductStore,
  deleteProduct as deleteProductStore,
} from '@/features/products/productStore';

/** Quản lý danh sách sản phẩm gốc (sống) từ IndexedDB. */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setProducts(await getAllProducts());
  }, []);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await refresh();
      setLoading(false);
    })();
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

  return { products, loading, refresh, saveProduct, deleteProduct };
}
