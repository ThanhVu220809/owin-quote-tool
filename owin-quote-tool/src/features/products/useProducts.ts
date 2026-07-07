import { useState, useEffect, useCallback } from 'react';
import type { Product, ProductRecord } from '@/types/models';
import {
  seedIfEmpty,
  getAllProducts,
  getAllProductsRaw,
  saveProduct as saveProductStore,
  deleteProduct as deleteProductStore,
} from '@/features/products/productStore';
import { PRODUCTS_CHANGED_EVENT } from '@/features/products/productEvents';

/** Quản lý danh sách sản phẩm gốc (sống) từ IndexedDB. */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productRecords, setProductRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [legacy, raw] = await Promise.all([getAllProducts(), getAllProductsRaw()]);
    setProducts(legacy);
    setProductRecords(raw.filter((product) => !product.deleted && !product.deletedAt));
  }, []);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    const onProductsChanged = () => {
      void refresh();
    };
    window.addEventListener(PRODUCTS_CHANGED_EVENT, onProductsChanged);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, onProductsChanged);
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
