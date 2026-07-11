import { Copy, Eye, Package, Pencil, Trash2 } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { formatVND } from '@/utils/format';
import { DragHandle, useDragReorder } from '@/components/DragReorder';
import { ProductThumb } from './ProductThumb';

interface Props {
  products: ProductRecord[];
  loading?: boolean;
  totalCount?: number;
  duplicatingId?: string | null;
  /** Enable drag-to-reorder (only when the list is unfiltered). */
  reorderable?: boolean;
  onReorder?: (from: number, to: number) => void;
  onEdit: (p: ProductRecord) => void;
  onDelete: (p: ProductRecord) => void;
  onDuplicate: (p: ProductRecord) => void;
  onPreview: (p: ProductRecord) => void;
}

function unitLabel(unit: ProductRecord['unit']): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

export function ProductList({
  products,
  loading,
  totalCount,
  duplicatingId,
  reorderable,
  onReorder,
  onEdit,
  onDelete,
  onDuplicate,
  onPreview,
}: Props) {
  const { handleProps, rowProps } = useDragReorder((from, to) => onReorder?.(from, to));
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
    return (
      <div className="product-empty-card">
        <Package size={44} />
        <h3>Chưa có sản phẩm</h3>
        <p>{totalCount ? 'Không tìm thấy sản phẩm phù hợp bộ lọc.' : 'Hãy tạo sản phẩm đầu tiên để bắt đầu quản lý báo giá.'}</p>
      </div>
    );
  }

  return (
    <div className="product-table-card">
      <div className="product-table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              {reorderable && <th aria-label="Kéo để đổi thứ tự" />}
              <th>Hình ảnh</th>
              <th>Tên sản phẩm</th>
              <th>Danh mục</th>
              <th>Đơn vị</th>
              <th>Kích thước</th>
              <th>Đơn giá</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, index) => (
              <tr key={p.id} data-ma={p.code} {...(reorderable ? rowProps(index) : {})}>
                {reorderable && (
                  <td className="product-drag-cell">
                    <DragHandle {...handleProps(index)} label={`Kéo để đổi thứ tự ${p.name}`} />
                  </td>
                )}
                <td>
                  <button className="product-image-button" onClick={() => onPreview(p)} aria-label={`Xem ảnh ${p.code}`}>
                    <ProductThumb imagePath={p.coverImagePath} fill />
                  </button>
                </td>
                <td>
                  <div className="product-name">{p.name}</div>
                  <div className="product-sub">{p.code}</div>
                </td>
                <td>{p.category}</td>
                <td>{unitLabel(p.unit)}</td>
                <td>{p.rawSizeText || '—'}</td>
                <td className="num">{formatVND(p.unitPriceVnd)}</td>
                <td>
                  <div className="product-table-actions">
                    <button className="icon-btn" onClick={() => onPreview(p)} aria-label={`Xem ${p.code}`}>
                      <Eye size={16} />
                    </button>
                    <button className="icon-btn" disabled={duplicatingId === p.id} onClick={() => onDuplicate(p)} aria-label={`Nhân bản ${p.code}`}>
                      <Copy size={16} />
                    </button>
                    <button className="icon-btn" onClick={() => onEdit(p)} aria-label={`Sửa ${p.code}`}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => onDelete(p)} aria-label={`Xoá ${p.code}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
