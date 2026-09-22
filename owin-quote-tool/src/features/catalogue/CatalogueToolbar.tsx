import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileDown, ListFilter } from "lucide-react";

/**
 * Header của tab Bảng giá. Dùng đúng bố cục heading của tab Sản phẩm và Báo giá
 * (`.admin-page-heading` + hàng tiêu đề có chip đếm + phụ đề), phần hành động là
 * bộ lọc loại cửa (custom listbox dropdown) và ba nút xuất file.
 *
 * Heading + toolbar sticky khi cuộn, giống `.product-list-toolbar` / `.quote-list-toolbar`.
 */
export function CatalogueToolbar({
  loading,
  totalCount,
  shownCount,
  exportCategory,
  onExportCategoryChange,
  categories,
  exporting,
  exportingExcel,
  exportingPdf,
  onExportWord,
  onExportExcel,
  onExportPdf,
  onPrefetchExports,
}: {
  loading: boolean;
  totalCount: number;
  shownCount: number;
  exportCategory: string;
  onExportCategoryChange: (value: string) => void;
  categories: string[];
  exporting: boolean;
  exportingExcel: boolean;
  exportingPdf: boolean;
  onExportWord: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  /** Chạm vào cụm nút = nạp trước mã xuất và ảnh, để lúc bấm khỏi phải chờ. */
  onPrefetchExports: () => void;
}) {
  const filtered = exportCategory !== "all";
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!categoryMenuRef.current?.contains(event.target as Node))
        setCategoryMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoryMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const selectCategory = (value: string) => {
    onExportCategoryChange(value);
    setCategoryMenuOpen(false);
  };

  const selectedCategoryLabel =
    exportCategory === "all" ? "Tất cả" : exportCategory;

  return (
    <div className="catalogue-header-row">
      {/* ── Heading: giống .product-list-heading / .quote-list-heading ── */}
      <div className="admin-page-heading catalogue-list-heading no-print">
        <div>
          <div className="catalogue-list-title-row">
            <h1 className="app-title">Bảng giá</h1>
            <span className="catalogue-list-count">
              {loading
                ? "Đang tải…"
                : `${filtered ? shownCount : totalCount} sản phẩm`}
            </span>
          </div>
          <p className="app-subtitle">
            {filtered
              ? `Bảng giá nhôm kính hệ OWIN · ${exportCategory}`
              : "Bảng giá sản phẩm nhôm kính hệ OWIN"}
          </p>
        </div>
      </div>

      {/* ── Toolbar sticky: dropdown xuất theo + 3 nút xuất file ── */}
      <div className="catalogue-list-toolbar no-print">
        {/* Custom dropdown xuất theo — giống product-category / quote-status */}
        <div
          className="catalogue-toolbar-control catalogue-toolbar-filter"
          ref={categoryMenuRef}
        >
          <ListFilter size={18} aria-hidden="true" />
          <label
            className="catalogue-toolbar-label"
            id="catalogue-category-label"
          >
            Xuất theo
          </label>
          <button
            type="button"
            id="catalogue-category"
            className="catalogue-category-trigger"
            aria-labelledby="catalogue-category-label"
            aria-haspopup="listbox"
            aria-expanded={categoryMenuOpen}
            onClick={() => setCategoryMenuOpen((open) => !open)}
          >
            <span>{selectedCategoryLabel}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {categoryMenuOpen && (
            <div
              className="catalogue-category-menu"
              role="listbox"
              aria-labelledby="catalogue-category-label"
            >
              <button
                type="button"
                className={`catalogue-category-option${exportCategory === "all" ? " is-selected" : ""}`}
                role="option"
                aria-selected={exportCategory === "all"}
                onClick={() => selectCategory("all")}
              >
                <span>Tất cả</span>
                {exportCategory === "all" && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
              {categories.map((c) => {
                const selected = c === exportCategory;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`catalogue-category-option${selected ? " is-selected" : ""}`}
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectCategory(c)}
                  >
                    <span>{c}</span>
                    {selected && <Check size={16} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Nhóm nút xuất file */}
        <div
          className="catalogue-toolbar-actions"
          onPointerEnter={onPrefetchExports}
          onFocus={onPrefetchExports}
        >
          <button
            className="btn btn-ghost"
            disabled={shownCount === 0 || exporting}
            onClick={onExportWord}
          >
            <FileDown size={17} style={{ verticalAlign: "-3px" }} />{" "}
            {exporting ? "…" : "Word"}
          </button>
          <button
            className="btn btn-ghost"
            disabled={shownCount === 0 || exportingExcel}
            onClick={onExportExcel}
          >
            <FileDown size={17} style={{ verticalAlign: "-3px" }} />{" "}
            {exportingExcel ? "…" : "Excel"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={shownCount === 0 || exportingPdf}
            onClick={onExportPdf}
            title="Tải file PDF (không mở hộp thoại in)"
          >
            <FileDown size={17} style={{ verticalAlign: "-3px" }} />{" "}
            {exportingPdf ? "Đang xuất…" : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
