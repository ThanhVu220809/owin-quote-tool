import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { ProductRecord } from '@/types/models';
import { reorderList } from '@/components/DragReorder';
import { sortCategoryNames } from '@/lib/products/categoryOrder';
import { sortProductsForCatalog } from '@/lib/products/productSort';
import { paginateItems, type PageSize } from '@/lib/list/paginateItems';
import { usePaginationEnabled } from '@/features/settings/paginationSettings';
import { useTransientMessage } from '@/lib/browser/useTransientMessage';
import { rememberProductSuggestions } from '@/features/suggestions/suggestionStore';
import { useSuggestions } from '@/features/suggestions/useSuggestions';
import { useProducts } from '@/features/products/useProducts';
import { getProductRecord, reorderProducts } from '@/features/products/productStore';
import { generateProductCode } from '@/features/products/productCode';
import {
  PRODUCT_SUGGESTION_TYPES,
  buildProductSuggestions,
} from '@/features/products/productSuggestions';
import { ProductForm, type ProductFormSaveOptions } from '@/features/products/ProductForm';
import { ProductList } from '@/features/products/ProductList';
import { ProductPreviewCard } from '@/features/products/ProductPreviewCard';
import { ProductToolbar } from '@/features/products/ProductToolbar';
import { nextFeaturedState, nextPublicState } from '@/features/products/productVisibility';
import { BulkPriceDialog } from '@/features/products/BulkPriceDialog';
import { BulkPublicDialog } from '@/features/products/BulkPublicDialog';
import './products.css';

/** Chuỗi để tìm kiếm của một sản phẩm — gộp mã, tên, nhóm, đơn vị, kích thước, thông số. */
// Chuỗi tìm kiếm dựng một lần cho mỗi bản ghi rồi nhớ theo chính bản ghi đó:
// gõ thêm một ký tự không phải ghép và hạ chữ thường lại cho cả danh mục.
// WeakMap nên bản ghi bị thay (sửa / realtime) là mục nhớ tự được thu hồi.
const searchHaystackCache = new WeakMap<ProductRecord, string>();

function searchHaystack(product: ProductRecord): string {
  const cached = searchHaystackCache.get(product);
  if (cached !== undefined) return cached;

  const haystack = [
    product.code,
    product.name,
    product.category,
    product.unit,
    product.rawSizeText,
    product.specs.map((spec) => `${spec.key} ${spec.value}`).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  searchHaystackCache.set(product, haystack);
  return haystack;
}

/** Màn quản lý sản phẩm gốc (catalog). */
export function ProductsView({ onOpenCatalogue }: { onOpenCatalogue?: () => void }) {
  const {
    productRecords,
    loading,
    error: productsError,
    retry: retryProducts,
    saveProduct,
    deleteProduct,
  } = useProducts();
  const {
    suggestions: seededSuggestions,
    error: suggestionsError,
    refreshSuggestions,
    retry: retrySuggestions,
  } = useSuggestions(PRODUCT_SUGGESTION_TYPES);

  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [previewProduct, setPreviewProduct] = useState<ProductRecord | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [message, setMessage] = useTransientMessage();
  const [operationError, setOperationError] = useState('');
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkPublicOpen, setBulkPublicOpen] = useState(false);
  const [togglingPublicId, setTogglingPublicId] = useState<string | null>(null);
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const suggestions = useMemo(
    () => buildProductSuggestions(productRecords, seededSuggestions),
    [productRecords, seededSuggestions],
  );

  const categories = useMemo(
    () => Array.from(new Set(productRecords.map((product) => product.category).filter(Boolean))).sort(sortCategoryNames),
    [productRecords],
  );

  // Lọc lại vài trăm sản phẩm là việc nặng: để React hạ ưu tiên cho nó thì ô tìm
  // kiếm vẫn gõ mượt, danh sách bắt kịp ngay sau đó.
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredProducts = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    const filtered = productRecords.filter((product) => {
      const categoryOk = !selectedCategory || product.category === selectedCategory;
      return categoryOk && (!query || searchHaystack(product).includes(query));
    });
    // Nhóm → màu (Trắc → Lim → Ghi → Xanh) → giá cao → thấp.
    return sortProductsForCatalog(filtered);
  }, [productRecords, deferredQuery, selectedCategory]);

  const paginationEnabled = usePaginationEnabled('products');
  const pagination = useMemo(
    () => paginateItems(
      filteredProducts,
      paginationEnabled ? currentPage : 1,
      paginationEnabled ? pageSize : filteredProducts.length,
    ),
    [currentPage, filteredProducts, pageSize, paginationEnabled],
  );

  const handleSearchChange = (value: string) => {
    setCurrentPage(1);
    setSearchQuery(value);
  };
  const handleCategoryChange = (value: string) => {
    setCurrentPage(1);
    setSelectedCategory(value);
  };

  const openNew = () => {
    setEditing(null);
    setMessage('');
    setOperationError('');
    setShowForm(true);
  };
  // Các handler của hàng phải giữ nguyên tham chiếu: `ProductRowCells` được memo
  // theo chúng, hàm mới mỗi lần render sẽ làm memo mất tác dụng.
  const openEdit = useCallback((product: ProductRecord) => {
    setEditing(product);
    setMessage('');
    setOperationError('');
    setShowForm(true);
  }, [setMessage]);
  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  const handleDelete = useCallback(async (product: ProductRecord) => {
    if (!confirm(`Xoá sản phẩm "${product.name}" (${product.code})?`)) return;
    setOperationError('');
    try {
      await deleteProduct(product.id);
      setMessage(`Đã xoá "${product.name}".`);
    } catch {
      setOperationError('Không thể xoá sản phẩm trên Supabase. Vui lòng thử lại.');
    }
  }, [deleteProduct, setMessage]);

  const handleDuplicate = useCallback(async (product: ProductRecord) => {
    setDuplicatingId(product.id);
    setMessage('');
    setOperationError('');
    try {
      // Mã bản sao render theo thời gian (giống lúc tạo mới), không dính "-COPY-".
      const copyCode = generateProductCode(true);
      // Giữ nguyên tên gốc; gỡ mọi tiền tố "Copy:" cũ để bản sao không bao giờ dính chữ "Copy".
      const cleanName = product.name.replace(/^\s*copy\s*:\s*/i, '').trim() || product.name;
      const saved = await saveProduct({
        ...product,
        id: undefined,
        numericId: undefined,
        code: copyCode,
        name: cleanName,
        isFeatured: false,
        createdAt: undefined,
        updatedAt: undefined,
        deletedAt: null,
        deleted: undefined,
      });
      setMessage(`Đã nhân bản "${product.name}".`);
      // Suggestions are secondary metadata. A failure here must never make a
      // successfully-created product look failed and tempt the user to retry.
      try {
        const record = await getProductRecord(saved.id);
        if (record) {
          setEditing(record);
          setShowForm(true);
          await rememberProductSuggestions(record);
        }
        await refreshSuggestions();
      } catch {
        // The product is already safely committed; Realtime will refresh it.
      }
    } catch {
      setOperationError('Không thể nhân bản sản phẩm trên Supabase. Vui lòng thử lại.');
    } finally {
      setDuplicatingId(null);
    }
  }, [refreshSuggestions, saveProduct, setMessage]);

  const duplicateProduct = useCallback(
    (product: ProductRecord) => { void handleDuplicate(product); },
    [handleDuplicate],
  );

  /**
   * Bật/tắt việc một sản phẩm có hiện trên trang công khai hay không.
   *
   * Đi qua `saveProduct` chứ không ghi cột `is_public` riêng — lý do ở
   * `productVisibility.ts`.
   */
  const handleTogglePublic = useCallback(async (product: ProductRecord) => {
    const next = nextPublicState(product);
    setTogglingPublicId(product.id);
    setMessage('');
    setOperationError('');
    try {
      await saveProduct({ ...product, isPublic: next }, { baseRecord: product });
      setMessage(next
        ? `Đã hiện "${product.name}" trên trang công khai.`
        : `Đã ẩn "${product.name}" khỏi trang công khai.`);
    } catch {
      setOperationError('Không thể đổi trạng thái hiển thị trên Supabase. Vui lòng thử lại.');
    } finally {
      setTogglingPublicId(null);
    }
  }, [saveProduct, setMessage]);

  const togglePublic = useCallback(
    (product: ProductRecord) => { void handleTogglePublic(product); },
    [handleTogglePublic],
  );

  /** Đưa sản phẩm vào / bỏ khỏi nhóm nổi bật trên trang công khai. */
  const handleToggleFeatured = useCallback(async (product: ProductRecord) => {
    const next = nextFeaturedState(product);
    setTogglingFeaturedId(product.id);
    setMessage('');
    setOperationError('');
    try {
      await saveProduct({ ...product, isFeatured: next }, { baseRecord: product });
      setMessage(next
        ? `Đã đưa "${product.name}" vào nhóm nổi bật.`
        : `Đã bỏ "${product.name}" khỏi nhóm nổi bật.`);
    } catch {
      setOperationError('Không đổi được nhóm nổi bật trên Supabase. Vui lòng thử lại.');
    } finally {
      setTogglingFeaturedId(null);
    }
  }, [saveProduct, setMessage]);

  const toggleFeatured = useCallback(
    (product: ProductRecord) => { void handleToggleFeatured(product); },
    [handleToggleFeatured],
  );

  // Drag reorder vẫn cho phép chỉnh tay; thứ tự hiển thị mặc định theo nhóm/màu/giá.
  const canReorder = !searchQuery.trim() && !selectedCategory;
  const handleReorder = async (from: number, to: number) => {
    const nextOrder = reorderList(filteredProducts, from, to);
    setOperationError('');
    try {
      await reorderProducts(nextOrder.map((product) => product.id));
    } catch {
      setOperationError('Không thể lưu thứ tự sản phẩm. Vui lòng thử lại.');
    }
  };

  const handleSave = async (
    input: Parameters<typeof saveProduct>[0],
    options?: ProductFormSaveOptions,
  ) => {
    const saved = await saveProduct(input, { baseRecord: options?.baseRecord });
    // Suggestions must never block the save ACK / autosave UI.
    if (options?.learnSuggestions !== false) {
      void (async () => {
        try {
          await rememberProductSuggestions(saved);
          await refreshSuggestions();
        } catch {
          // Autocomplete ranking is secondary; the product save already succeeded.
        }
      })();
    }
    return saved;
  };

  if (showForm) {
    return (
      <section className="admin-page product-workflow-page">
        <ProductForm
          key={editing?.id ?? 'new'}
          editing={editing}
          suggestions={suggestions}
          onSave={handleSave}
          onCancel={closeForm}
        />
      </section>
    );
  }

  const dataError = operationError || productsError || suggestionsError;

  return (
    <section className="admin-page product-list-page product-workflow-page">
      <div className="admin-page-heading product-list-heading">
        <div>
          <div className="product-list-title-row">
            <h1 className="app-title">Quản lý sản phẩm</h1>
            <span className="product-list-count">{productRecords.length} sản phẩm</span>
          </div>
          <p className="app-subtitle">
            {loading ? 'Đang tải danh mục sản phẩm…' : 'Danh mục sản phẩm nhôm kính hệ OWIN'}
          </p>
        </div>
      </div>

      {message && <div className="toast">{message}</div>}
      {dataError && (
        <div className="data-error" role="alert">
          <span>{dataError}</span>
          {(productsError || suggestionsError) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOperationError('');
                void Promise.all([retryProducts(), retrySuggestions()]);
              }}
            >
              Thử tải lại
            </button>
          )}
        </div>
      )}

      <ProductToolbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        categories={categories}
        canBulkPrice={productRecords.length > 0}
        onOpenCatalogue={onOpenCatalogue}
        onOpenBulkPrice={() => setBulkPriceOpen(true)}
        onOpenBulkPublic={() => setBulkPublicOpen(true)}
        onCreate={openNew}
      />

      <ProductList
        products={pagination.items}
        pagination={pagination}
        paginationEnabled={paginationEnabled}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
        loading={loading}
        totalCount={productRecords.length}
        duplicatingId={duplicatingId}
        togglingPublicId={togglingPublicId}
        togglingFeaturedId={togglingFeaturedId}
        reorderable={canReorder}
        onReorder={(from, to) => void handleReorder(from, to)}
        onEdit={openEdit}
        onDelete={handleDelete}
        onDuplicate={duplicateProduct}
        onPreview={setPreviewProduct}
        onTogglePublic={togglePublic}
        onToggleFeatured={toggleFeatured}
      />

      {bulkPriceOpen && (
        <BulkPriceDialog
          products={productRecords}
          onClose={() => setBulkPriceOpen(false)}
          onDone={(text) => {
            setMessage(text);
            setBulkPriceOpen(false);
          }}
          onError={setOperationError}
        />
      )}

      {bulkPublicOpen && (
        <BulkPublicDialog
          products={productRecords}
          onClose={() => setBulkPublicOpen(false)}
          onDone={(text) => {
            setMessage(text);
            setBulkPublicOpen(false);
          }}
          onError={setOperationError}
        />
      )}

      {previewProduct && (
        <ProductPreviewCard
          product={previewProduct}
          onClose={() => setPreviewProduct(null)}
          onEdit={(product) => {
            setPreviewProduct(null);
            openEdit(product);
          }}
        />
      )}
    </section>
  );
}
