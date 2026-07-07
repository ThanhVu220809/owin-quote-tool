import { Pencil, Trash2 } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { formatVND } from '@/utils/format';
import { ProductThumb } from './ProductThumb';

interface Props {
  products: ProductRecord[];
  onEdit: (p: ProductRecord) => void;
  onDelete: (p: ProductRecord) => void;
}

function unitLabel(unit: ProductRecord['unit']): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

export function ProductList({ products, onEdit, onDelete }: Props) {
  if (products.length === 0) {
    return <div className="product-sub" style={{ padding: 16 }}>Chưa có sản phẩm nào.</div>;
  }
  return (
    <div>
      {products.map((p) => (
        <div key={p.id} className="product-row" data-ma={p.code}>
          <ProductThumb imagePath={p.coverImagePath} />
          <div className="product-meta">
            <div className="product-name">{p.name}</div>
            <div className="product-sub">
              {p.code} · {p.category} · {formatVND(p.unitPriceVnd)}/{unitLabel(p.unit)}
              {p.rawSizeText ? ` · ${p.rawSizeText}` : ''}
            </div>
          </div>
          <span className="badge">{unitLabel(p.unit)}</span>
          <div className="row-actions">
            <button className="icon-btn" onClick={() => onEdit(p)} aria-label={`Sửa ${p.code}`}>
              <Pencil size={16} />
            </button>
            <button className="icon-btn danger" onClick={() => onDelete(p)} aria-label={`Xoá ${p.code}`}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
