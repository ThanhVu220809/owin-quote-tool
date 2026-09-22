import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProducts } from '@/features/products';
import { paginateItems, type PageSize } from "@/lib/list/paginateItems";
import { usePaginationEnabled } from "@/features/settings/paginationSettings";
import { buildCatalogueBlockRows } from '@/lib/catalogue/catalogueRows';
import {
  filterRecordsByCategory,
  groupCatalogueBlocks,
  listCatalogueCategories,
} from '@/features/catalogue/catalogueBlocks';
import { useCatalogueExport } from '@/features/catalogue/useCatalogueExport';
import { CatalogueToolbar } from '@/features/catalogue/CatalogueToolbar';
import { CatalogueDocument } from '@/features/catalogue/CatalogueDocument';
import './catalogue.css';

const CATALOGUE_PAGE_SIZES: PageSize[] = [10, 25, 50];

function scrollCatalogueToTop() {
  window.requestAnimationFrame(() => {
    document
      .getElementById("tool-main")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/** Tab Bảng giá: xem tài liệu A4 và xuất Word/Excel/PDF theo loại cửa. */
export function CatalogueView() {
  const { productRecords, loading, error: productsError, retry } = useProducts();
  // Xuất theo loại cửa: 'all' = tất cả, hoặc 1 danh mục cụ thể.
  const [exportCategory, setExportCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const categories = useMemo(() => listCatalogueCategories(productRecords), [productRecords]);
  const shownRecords = useMemo(
    () => filterRecordsByCategory(productRecords, exportCategory),
    [productRecords, exportCategory],
  );
  const paginationEnabled = usePaginationEnabled("catalogue");
  const pagination = useMemo(
    () => paginateItems(
      shownRecords,
      paginationEnabled ? currentPage : 1,
      paginationEnabled ? pageSize : shownRecords.length,
    ),
    [currentPage, pageSize, shownRecords, paginationEnabled],
  );
  const rows = useMemo(
    () => buildCatalogueBlockRows(pagination.items),
    [pagination.items],
  );
  const blocks = useMemo(() => groupCatalogueBlocks(rows), [rows]);
  const {
    exporting,
    exportingExcel,
    exportingPdf,
    exportError,
    exportWord,
    exportExcel,
    exportPdf,
    prewarmExports,
  } = useCatalogueExport(shownRecords);

  const handleCategoryChange = (value: string) => {
    setCurrentPage(1);
    setExportCategory(value);
  };
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    scrollCatalogueToTop();
  };
  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    setCurrentPage(1);
    scrollCatalogueToTop();
  };

  return (
    <section className="admin-page catalogue-page">
      <CatalogueToolbar
        loading={loading}
        totalCount={productRecords.length}
        shownCount={shownRecords.length}
        exportCategory={exportCategory}
        onExportCategoryChange={handleCategoryChange}
        categories={categories}
        exporting={exporting}
        exportingExcel={exportingExcel}
        exportingPdf={exportingPdf}
        onExportWord={() => void exportWord()}
        onExportExcel={() => void exportExcel()}
        onExportPdf={() => void exportPdf()}
        onPrefetchExports={prewarmExports}
      />

      {(productsError || exportError) && (
        <div className="data-error no-print" role="alert">
          <span>{exportError || productsError}</span>
          {productsError && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void retry()}
            >
              Thử tải lại
            </button>
          )}
        </div>
      )}

      <CatalogueDocument rows={rows} blocks={blocks} />

      {paginationEnabled && shownRecords.length > 0 && (
        <nav
          className="catalogue-list-pagination no-print"
          aria-label="Phân trang bảng giá"
        >
          <div className="catalogue-pagination-summary">
            <span>
              Hiển thị {pagination.firstItemNumber}–{pagination.lastItemNumber}{" "}
              / {pagination.totalItems} sản phẩm
            </span>
            <label>
              Mỗi trang
              <select
                className="input catalogue-page-size-select"
                value={pageSize}
                onChange={(event) =>
                  handlePageSizeChange(Number(event.target.value) as PageSize)
                }
                aria-label="Số sản phẩm bảng giá mỗi trang"
              >
                {CATALOGUE_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="catalogue-pagination-controls">
            <button
              type="button"
              className="icon-btn"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              aria-label="Trang trước"
            >
              <ChevronLeft size={17} />
            </button>
            <span aria-live="polite">
              Trang <strong>{pagination.page}</strong> / {pagination.totalPages}
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              aria-label="Trang sau"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
