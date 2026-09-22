import { memo } from 'react';
import { ChevronLeft, ChevronRight, Copy, Globe, GlobeLock, Package, Pencil, Search, Star, Trash2 } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { formatVND } from '@/lib/format/currency';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import { titleCaseVi } from '@/lib/format/titleCase';
import { PAGE_SIZES, type PageSize, type PaginationResult } from '@/lib/list/paginateItems';
import { useProgressiveReveal } from '@/lib/list/useProgressiveReveal';
import { mergeRowDragProps, useDragReorder } from '@/components/DragReorder';
import { ProductThumb } from '@/components/ProductThumb';
import { unitLabel } from '@/features/products/productUnits';
import { isProductFeatured, isProductPublic } from '@/features/products/productVisibility';

interface Props {
  /** Chỉ các sản phẩm của trang hiện tại. */
  products: ProductRecord[];
  pagination: PaginationResult<ProductRecord>;
  paginationEnabled: boolean;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  loading?: boolean;
  totalCount?: number;
  duplicatingId?: string | null;
  /** Sản phẩm đang chờ Supabase xác nhận đổi trạng thái hiển thị công khai. */
  togglingPublicId?: string | null;
  /** Sản phẩm đang chờ Supabase xác nhận đổi trạng thái nổi bật. */
  togglingFeaturedId?: string | null;
  /** Enable drag-to-reorder (only when the list is unfiltered). */
  reorderable?: boolean;
  onReorder?: (from: number, to: number) => void;
  onEdit: (p: ProductRecord) => void;
  onDelete: (p: ProductRecord) => void;
  onDuplicate: (p: ProductRecord) => void;
  onPreview: (p: ProductRecord) => void;
  onTogglePublic: (p: ProductRecord) => void;
  onToggleFeatured: (p: ProductRecord) => void;
}

/**
 * Các ô của một hàng, tách riêng và `memo` theo bản ghi sản phẩm.
 *
 * Hàng `<tr>` phải dựng lại mỗi lần render vì mang prop kéo-thả đổi theo trạng
 * thái kéo, nhưng phần nặng (ảnh + 3 nút + text) thì không: nhờ `memo`, mỗi đợt
 * trải thêm dòng chỉ dựng dòng mới chứ không dựng lại toàn bộ danh sách.
 */
const ProductRowCells = memo(function ProductRowCells({
  product,
  duplicating,
  togglingPublic,
  togglingFeatured,
  onEdit,
  onDelete,
  onDuplicate,
  onPreview,
  onTogglePublic,
  onToggleFeatured,
}: {
  product: ProductRecord;
  duplicating: boolean;
  togglingPublic: boolean;
  togglingFeatured: boolean;
  onEdit: (p: ProductRecord) => void;
  onDelete: (p: ProductRecord) => void;
  onDuplicate: (p: ProductRecord) => void;
  onPreview: (p: ProductRecord) => void;
  onTogglePublic: (p: ProductRecord) => void;
  onToggleFeatured: (p: ProductRecord) => void;
}) {
  const isPublic = isProductPublic(product);
  const isFeatured = isProductFeatured(product);
  return (
    <>
      <td data-col="image">
        <button
          className="product-image-button"
          onClick={(event) => {
            event.stopPropagation();
            onPreview(product);
          }}
          aria-label={`Xem ảnh ${product.code}`}
        >
          <ProductThumb imagePath={product.coverImagePath} fill thumb />
        </button>
      </td>
      <td data-col="name">
        <div className="product-name">{titleCaseVi(product.name) || product.name}</div>
        <div className="product-table-code">{product.code}</div>
        <div className="product-row-mobile-meta">
          <span>{normalizeCategoryName(product.category)}</span>
          <span>{unitLabel(product.unit)}</span>
          {product.rawSizeText ? <span>{product.rawSizeText}</span> : null}
        </div>
      </td>
      <td data-col="category">{normalizeCategoryName(product.category)}</td>
      <td data-col="unit">{unitLabel(product.unit)}</td>
      <td data-col="size">{product.rawSizeText || '—'}</td>
      <td className="num" data-col="price">{formatVND(product.unitPriceVnd)}</td>
      <td data-col="public">
        {/* Hai nút cùng một ô vì cùng trả lời một câu hỏi: sản phẩm này lên
            trang công khai thế nào. Tách thành hai cột chỉ làm bảng rộng thêm
            mà không rõ nghĩa hơn. */}
        <div className="product-web-controls">
        <button
          type="button"
          className={`product-feature-toggle${isFeatured ? ' is-featured' : ''}`}
          disabled={togglingFeatured || !isPublic}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFeatured(product);
          }}
          aria-pressed={isFeatured}
          aria-label={`${isFeatured ? 'Bỏ' : 'Đặt'} ${product.code} khỏi nhóm nổi bật`}
          title={!isPublic
            ? 'Sản phẩm đang ẩn khỏi web thì không thể nổi bật'
            : isFeatured ? 'Đang nổi bật — bấm để bỏ' : 'Bấm để đưa vào nhóm nổi bật'}
        >
          <Star size={15} fill={isFeatured ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className={`product-public-toggle${isPublic ? ' is-public' : ''}`}
          disabled={togglingPublic}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePublic(product);
          }}
          aria-pressed={isPublic}
          aria-label={`${isPublic ? 'Ẩn' : 'Hiện'} ${product.code} trên trang công khai`}
          title={isPublic ? 'Đang hiện trên web — bấm để ẩn' : 'Đang ẩn khỏi web — bấm để hiện'}
        >
          {isPublic ? <Globe size={16} /> : <GlobeLock size={16} />}
          <span>{isPublic ? 'Hiện' : 'Ẩn'}</span>
        </button>
        </div>
      </td>
      <td data-col="actions">
        <div className="product-table-actions">
          <button
            className="icon-btn product-edit-action"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(product);
            }}
            aria-label={`Sửa ${product.code}`}
            title="Sửa sản phẩm"
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-btn product-copy-action"
            disabled={duplicating}
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(product);
            }}
            aria-label={`Nhân bản ${product.code}`}
            title="Nhân bản"
          >
            <Copy size={16} />
          </button>
          <button
            className="icon-btn danger product-delete-action"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(product);
            }}
            aria-label={`Xoá ${product.code}`}
            title="Xoá sản phẩm"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </>
  );
});

/** Bảng danh mục sản phẩm: một card, đầu bảng sticky, footer phân trang. */
export function ProductList({
  products,
  pagination,
  paginationEnabled,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading,
  totalCount,
  duplicatingId,
  togglingPublicId,
  togglingFeaturedId,
  reorderable,
  onReorder,
  onEdit,
  onDelete,
  onDuplicate,
  onPreview,
  onTogglePublic,
  onToggleFeatured,
}: Props) {
  // Tắt phân trang thì cả danh mục nằm trong một trang: trải dần theo khung hình
  // để lần dựng đầu không chiếm hết luồng chính.
  const visibleProducts = useProgressiveReveal(products);
  // Hàng hiển thị theo trang, còn thứ tự lưu xuống Supabase tính trên toàn danh
  // sách — cộng offset của trang để index không lệch khi đang ở trang 2 trở đi.
  const pageOffset = (pagination.page - 1) * pageSize;
  const { handleProps, rowProps } = useDragReorder((from, to) =>
    onReorder?.(pageOffset + from, pageOffset + to),
  );
  // Không có cột tay cầm: chính hàng vừa là thứ kéo được, vừa là vùng thả. Hai
  // nhóm prop không trùng key nên trải cả hai lên <tr> là đủ.
  const dragRowProps = (index: number) =>
    reorderable ? mergeRowDragProps(handleProps(index), rowProps(index)) : {};

  if (loading) {
    return (
      <div className="product-table-card product-list-skeleton">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return totalCount ? (
      <div className="empty-card">
        <Search size={44} />
        <h3>Không tìm thấy sản phẩm</h3>
        <p>Thử đổi từ khóa hoặc nhóm sản phẩm đang lọc.</p>
      </div>
    ) : (
      <div className="empty-card">
        <Package size={44} />
        <h3>Chưa có sản phẩm</h3>
        <p>Hãy tạo sản phẩm đầu tiên để bắt đầu quản lý báo giá.</p>
      </div>
    );
  }

  return (
    <div className="product-table-card">
      <div className="product-table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th scope="col" data-col="image">Hình ảnh</th>
              <th scope="col" data-col="name">Tên sản phẩm</th>
              <th scope="col" data-col="category">Nhóm sản phẩm</th>
              <th scope="col" data-col="unit">Đơn vị</th>
              <th scope="col" data-col="size">Kích thước mẫu</th>
              <th scope="col" data-col="price">Đơn giá</th>
              <th scope="col" data-col="public">Trang web</th>
              <th scope="col" data-col="actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((p, index) => (
              <tr
                key={p.id}
                data-ma={p.code}
                className={reorderable ? 'product-row product-row-reorderable' : 'product-row'}
                tabIndex={0}
                aria-label={reorderable
                  ? `Xem chi tiết sản phẩm ${p.code}. Kéo hàng để đổi thứ tự.`
                  : `Xem chi tiết sản phẩm ${p.code}`}
                onClick={() => onPreview(p)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPreview(p);
                  }
                }}
                {...dragRowProps(index)}
              >
                <ProductRowCells
                  product={p}
                  duplicating={duplicatingId === p.id}
                  togglingPublic={togglingPublicId === p.id}
                  togglingFeatured={togglingFeaturedId === p.id}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onPreview={onPreview}
                  onTogglePublic={onTogglePublic}
                  onToggleFeatured={onToggleFeatured}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginationEnabled && (
        <nav className="product-list-pagination" aria-label="Phân trang danh sách sản phẩm">
          <div className="product-pagination-summary">
            <span>
              Hiển thị {pagination.firstItemNumber}–{pagination.lastItemNumber} / {pagination.totalItems} sản phẩm
            </span>
            <label>
              Mỗi trang
              <select
                className="input product-page-size-select"
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
                aria-label="Số sản phẩm mỗi trang"
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <div className="product-pagination-controls">
            <button
              type="button"
              className="icon-btn"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              aria-label="Trang trước"
            >
              <ChevronLeft size={17} />
            </button>
            <span aria-live="polite">Trang <strong>{pagination.page}</strong> / {pagination.totalPages}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              aria-label="Trang sau"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
