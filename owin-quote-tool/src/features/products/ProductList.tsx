import { Pencil, Trash2 } from 'lucide-react';
import type { Product } from '@/types/models';
import { formatVND } from '@/utils/format';
import { ProductThumb } from './ProductThumb';

interface Props {
  products: Product[];
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
}

export function ProductList({ products, onEdit, onDelete }: Props) {
  if (products.length === 0) {
    return <div className="product-sub" style={{ padding: 16 }}>Chưa có sản phẩm nào.</div>;
  }
  return (
    <div>
      {products.map((p) => (
        <div key={p.id} className="product-row" data-ma={p.ma}>
          <ProductThumb imageId={p.imageId} />
          <div className="product-meta">
            <div className="product-name">{p.ten}</div>
            <div className="product-sub">
              {p.ma} · {formatVND(p.donGiaGoc)}/{p.dvt}
            </div>
          </div>
          <span className="badge">{p.dvt}</span>
          <div className="row-actions">
            <button className="icon-btn" onClick={() => onEdit(p)} aria-label={`Sửa ${p.ma}`}>
              <Pencil size={16} />
            </button>
            <button className="icon-btn danger" onClick={() => onDelete(p)} aria-label={`Xoá ${p.ma}`}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
