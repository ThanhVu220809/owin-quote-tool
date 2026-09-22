/* Effect below intentionally resets local picker state when the modal closes. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, type UIEvent } from 'react';
import { Package, Search, X } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { formatVND } from '@/lib/format/currency';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import { ProductThumb } from '@/components/ProductThumb';
import { ProductPreviewCard } from '@/features/products';
import { unitLabelShort } from '@/features/quote/quoteFormat';

const PRODUCT_PAGE_SIZE = 48;

/** Modal chọn sản phẩm từ kho để thêm vào báo giá (ô tìm, dải danh mục, lưới thẻ, xem chi tiết). */
export function QuoteProductPicker({
  isOpen,
  search,
  categoryFilter,
  categories,
  filteredProducts,
  productCount,
  onSearch,
  onCategoryFilter,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  search: string;
  categoryFilter: string;
  categories: string[];
  filteredProducts: ProductRecord[];
  productCount: number;
  onSearch: (value: string) => void;
  onCategoryFilter: (value: string) => void;
  onSelect: (productId: string) => void;
  onClose: () => void;
}) {
  const [detailProduct, setDetailProduct] = useState<ProductRecord | null>(null);
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCT_PAGE_SIZE);

  useEffect(() => {
    if (!isOpen) {
      setDetailProduct(null);
      setVisibleProductCount(PRODUCT_PAGE_SIZE);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setVisibleProductCount(PRODUCT_PAGE_SIZE);
    }
  }, [categoryFilter, filteredProducts, isOpen, search]);

  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;
  const handleCategoryFilter = (value: string) => {
    setVisibleProductCount(PRODUCT_PAGE_SIZE);
    onCategoryFilter(value);
  };
  const handleResultsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreProducts) return;
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom < 640) {
      setVisibleProductCount((current) => Math.min(current + PRODUCT_PAGE_SIZE, filteredProducts.length));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="quote-picker-backdrop" role="presentation" onClick={onClose}>
      <div className="quote-picker-modal" role="dialog" aria-modal="true" aria-label="Chọn sản phẩm" onClick={(event) => event.stopPropagation()}>
        <div className="quote-picker-header">
          <div className="quote-picker-title">
            <div className="quote-picker-icon"><Package size={20} /></div>
            <div className="quote-picker-title-copy">
              <h2>Chọn sản phẩm</h2>
              <p>{productCount} sản phẩm</p>
            </div>
          </div>
          <div className="quote-picker-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => {
                onSearch(event.target.value);
                handleCategoryFilter('');
              }}
              placeholder="Tìm theo tên hoặc nhóm..."
              autoFocus
            />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng chọn sản phẩm">
            <X size={18} />
          </button>
        </div>

        <div className="quote-picker-categories" aria-label="Lọc theo danh mục">
          <button className={!categoryFilter ? 'active' : ''} onClick={() => handleCategoryFilter('')} type="button">
            Tất cả <span>{productCount}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={categoryFilter === category ? 'active' : ''}
              onClick={() => handleCategoryFilter(category)}
              type="button"
            >
              {category}
            </button>
          ))}
        </div>

        <div className="quote-picker-results" onScroll={handleResultsScroll}>
          {filteredProducts.length === 0 ? (
            <div className="empty-line">Không tìm thấy sản phẩm phù hợp.</div>
          ) : (
            <>
              <div className="quote-picker-results-head">
                <span>{filteredProducts.length} sản phẩm</span>
                {categoryFilter && <strong>{normalizeCategoryName(categoryFilter)}</strong>}
                {hasMoreProducts && <small>Đang hiển thị {visibleProducts.length}</small>}
              </div>
              <div className="quote-picker-grid">
                {visibleProducts.map((product) => (
                  <div key={product.id} className="quote-picker-card">
                    <button
                      type="button"
                      className="quote-picker-thumb image-fit-frame"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDetailProduct(product);
                      }}
                      aria-label={`Xem chi tiết ${product.name}`}
                    >
                      <ProductThumb imagePath={product.coverImagePath} fill thumb />
                    </button>
                    <button
                      type="button"
                      className="quote-picker-card-body"
                      onClick={() => onSelect(product.id)}
                    >
                      <strong>{product.name}</strong>
                      {product.category ? (
                        <span className="quote-picker-meta">{normalizeCategoryName(product.category)}</span>
                      ) : null}
                      <span className="quote-picker-price">
                        {formatVND(product.unitPriceVnd)}
                        <small>/{unitLabelShort(product.unit)}</small>
                      </span>
                      <span className="quote-picker-choose">Chọn sản phẩm</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="quote-picker-footer-hint">
          Bấm ảnh để xem chi tiết · bấm thẻ để chọn nhanh
        </div>
      </div>
      {detailProduct && (
        <ProductPreviewCard
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onSelect={(product) => {
            setDetailProduct(null);
            onSelect(product.id);
          }}
          selectLabel="Thêm vào báo giá"
        />
      )}
    </div>
  );
}
