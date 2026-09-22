import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, Globe, ListFilter, Percent, Plus, Search } from 'lucide-react';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';

/**
 * Toolbar sticky của màn danh sách sản phẩm: ô tìm, bộ lọc nhóm sản phẩm và
 * nhóm hành động. Cùng bố cục với toolbar của màn danh sách báo giá — ô nhập có
 * icon dẫn, bộ lọc là listbox tự dựng (không dùng <select> của hệ điều hành) để
 * menu cùng một ngôn ngữ thị giác trên mọi nền tảng.
 */
export function ProductToolbar({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  canBulkPrice,
  onOpenCatalogue,
  onOpenBulkPrice,
  onOpenBulkPublic,
  onCreate,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  canBulkPrice: boolean;
  onOpenCatalogue?: () => void;
  onOpenBulkPrice: () => void;
  onOpenBulkPublic: () => void;
  onCreate: () => void;
}) {
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!categoryMenuRef.current?.contains(event.target as Node)) setCategoryMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCategoryMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const selectCategory = (value: string) => {
    onCategoryChange(value);
    setCategoryMenuOpen(false);
  };

  const selectedCategoryLabel = selectedCategory
    ? normalizeCategoryName(selectedCategory)
    : 'Tất cả nhóm sản phẩm';

  return (
    <div className="product-list-toolbar" role="search" aria-label="Tìm và lọc sản phẩm">
      <div className="product-toolbar-control product-toolbar-search">
        <Search size={18} aria-hidden="true" />
        <label className="product-toolbar-label" htmlFor="product-search">Tìm sản phẩm</label>
        <input
          id="product-search"
          className="input"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Tìm theo mã, tên, nhóm, kích thước..."
        />
      </div>

      <div className="product-toolbar-control product-toolbar-category" ref={categoryMenuRef}>
        <ListFilter size={18} aria-hidden="true" />
        <label className="product-toolbar-label" id="product-category-label">Lọc theo nhóm sản phẩm</label>
        <button
          type="button"
          id="product-category"
          className="product-category-trigger"
          aria-labelledby="product-category-label"
          aria-haspopup="listbox"
          aria-expanded={categoryMenuOpen}
          onClick={() => setCategoryMenuOpen((open) => !open)}
        >
          <span>{selectedCategoryLabel}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {categoryMenuOpen && (
          <div className="product-category-menu" role="listbox" aria-labelledby="product-category-label">
            <button
              type="button"
              className={`product-category-option${selectedCategory === '' ? ' is-selected' : ''}`}
              role="option"
              aria-selected={selectedCategory === ''}
              onClick={() => selectCategory('')}
            >
              <span>Tất cả nhóm sản phẩm</span>
              {selectedCategory === '' && <Check size={16} aria-hidden="true" />}
            </button>
            {categories.map((category) => {
              const selected = category === selectedCategory;
              return (
                <button
                  key={category}
                  type="button"
                  className={`product-category-option${selected ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectCategory(category)}
                >
                  <span>{normalizeCategoryName(category)}</span>
                  {selected && <Check size={16} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="product-toolbar-actions no-print">
        <button type="button" className="btn btn-ghost" onClick={onOpenCatalogue}>
          <BookOpen size={16} aria-hidden="true" />
          Bảng giá
        </button>
        <button type="button" className="btn btn-ghost" onClick={onOpenBulkPrice} disabled={!canBulkPrice}>
          <Percent size={16} aria-hidden="true" />
          Cập nhật giá
        </button>
        <button type="button" className="btn btn-ghost" onClick={onOpenBulkPublic} disabled={!canBulkPrice}>
          <Globe size={16} aria-hidden="true" />
          Hiển thị web
        </button>
        <button type="button" className="btn btn-primary product-create-button" onClick={onCreate}>
          <Plus size={18} aria-hidden="true" />
          Thêm sản phẩm
        </button>
      </div>
    </div>
  );
}
