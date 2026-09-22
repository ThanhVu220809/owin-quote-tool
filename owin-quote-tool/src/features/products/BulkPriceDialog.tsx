import { useState } from 'react';
import { X } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { formatVND } from '@/lib/format/currency';
import { bulkAdjustProductPrices } from '@/features/products/productStore';

const PREVIEW_ROWS = 8;

/** Giá mới = giá cũ × (1 + %/100), làm tròn về đồng, không âm. Giữ nguyên công thức cũ. */
function adjustedPrice(unitPriceVnd: number, percent: number): number {
  return Math.max(0, Math.round(unitPriceVnd * (1 + percent / 100)));
}

/**
 * Cập nhật giá hàng loạt cho toàn bộ sản phẩm đang hoạt động.
 * Chỉ chạm sản phẩm chưa xoá — sản phẩm đã xoá mềm không bị sửa giá.
 */
export function BulkPriceDialog({
  products,
  onClose,
  onDone,
  onError,
}: {
  products: ProductRecord[];
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [percentText, setPercentText] = useState('');
  const [saving, setSaving] = useState(false);

  const percent = Number(percentText.replace(',', '.'));
  const hasPercent = percentText.trim() !== '' && Number.isFinite(percent);
  const preview = hasPercent
    ? products.map((product) => ({ product, nextPrice: adjustedPrice(product.unitPriceVnd, percent) }))
    : [];

  const apply = async () => {
    if (!hasPercent) return;
    if (!confirm(`Áp dụng thay đổi ${percent}% cho ${products.length} sản phẩm đang hoạt động?`)) return;
    setSaving(true);
    try {
      await bulkAdjustProductPrices(percent);
      onDone(`Đã cập nhật giá ${products.length} sản phẩm.`);
    } catch {
      onError('Không thể cập nhật giá trên Supabase. Không có dữ liệu cục bộ nào được dùng thay thế.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="product-modal bulk-price-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-price-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="product-modal-header">
          <div className="product-modal-title">
            <div className="product-modal-title-copy">
              <div className="product-modal-kicker">Danh mục sản phẩm</div>
              <h2 id="bulk-price-title">Cập nhật giá hàng loạt</h2>
              <div className="product-sub">Chỉ áp dụng cho sản phẩm đang hoạt động · không chạm sản phẩm đã xoá</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="bulk-price-body">
          <div className="field">
            <label htmlFor="bulk-percent">Điều chỉnh (%)</label>
            <input
              id="bulk-percent"
              className="input"
              inputMode="decimal"
              value={percentText}
              onChange={(event) => setPercentText(event.target.value)}
              placeholder="Ví dụ: 5 hoặc -3"
              autoFocus
            />
          </div>

          {hasPercent && (
            <div className="bulk-price-preview">
              <div className="bulk-price-preview-head">
                <span>Sản phẩm</span>
                <span>Giá cũ → giá mới</span>
              </div>
              {preview.slice(0, PREVIEW_ROWS).map(({ product, nextPrice }) => (
                <div key={product.id}>
                  <span>{product.name}</span>
                  <strong>{formatVND(product.unitPriceVnd)} → {formatVND(nextPrice)}</strong>
                </div>
              ))}
              {preview.length > PREVIEW_ROWS && (
                <small>… và {preview.length - PREVIEW_ROWS} sản phẩm khác</small>
              )}
            </div>
          )}

          <div className="bulk-price-actions">
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Huỷ</button>
            <button className="btn btn-primary" onClick={() => void apply()} disabled={saving || !hasPercent}>
              {saving ? 'Đang cập nhật…' : 'Xác nhận áp dụng'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
