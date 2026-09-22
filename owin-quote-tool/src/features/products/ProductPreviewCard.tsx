import { Pencil, X } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { formatVND } from '@/lib/format/currency';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import { titleCaseVi } from '@/lib/format/titleCase';
import { ProductThumb } from '@/components/ProductThumb';
import { parseExtraAccessoriesJson, parseFixedAccessoriesJson } from '@/lib/quote/accessoryDrafts';
import { unitLabel } from '@/features/products/productUnits';

function parseFixedItems(product: ProductRecord): Array<{ name: string; quantity: number }> {
  if (!product.fixedAccessoryPackage) {
    return product.accessories
      .map((item) => ({ name: item.name, quantity: item.quantityPerSet }))
      .filter((item) => item.name);
  }
  const draft = parseFixedAccessoriesJson(product.fixedAccessoryPackage, 1);
  return draft.items.filter((item) => item.name.trim()).map((item) => ({
    name: item.name,
    quantity: item.quantity,
  }));
}

function fixedPackageMeta(product: ProductRecord): { name: string; unitPrice: number } | null {
  if (!product.fixedAccessoryPackage) return null;
  const draft = parseFixedAccessoriesJson(product.fixedAccessoryPackage, 1);
  if (!draft.name.trim() && draft.unitPrice === 0) return null;
  return { name: draft.name || 'Bộ phụ kiện', unitPrice: draft.unitPrice };
}

function extraItems(product: ProductRecord): Array<{ name: string; unitPrice: number; quantity: number }> {
  return parseExtraAccessoriesJson(product.extraAccessories)
    .filter((item) => item.name.trim())
    .map((item) => ({
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    }));
}

export function ProductPreviewCard({
  product,
  onClose,
  onEdit,
  onSelect,
  selectLabel = 'Chọn sản phẩm',
}: {
  product: ProductRecord;
  onClose: () => void;
  onEdit?: (product: ProductRecord) => void;
  onSelect?: (product: ProductRecord) => void;
  selectLabel?: string;
}) {
  const fixedMeta = fixedPackageMeta(product);
  const accessories = parseFixedItems(product);
  const extras = extraItems(product);
  const specs = product.specs.filter((spec) => spec.key.trim());
  // Chỉ hiện mô tả thật. Trước đây khi thiếu shortDesc thì ô này ghép 4 thông số
  // đầu — trùng đúng bảng "Thông số kỹ thuật" ngay bên dưới.
  const description = product.shortDesc?.trim() || null;

  return (
    <div
      className="modal-backdrop product-preview-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="product-modal product-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Xem ${product.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="product-modal-header">
          <div className="product-modal-title">
            <div className="product-modal-title-copy">
              <div className="product-modal-kicker">{normalizeCategoryName(product.category) || 'Sản phẩm'}</div>
              <h2>{titleCaseVi(product.name) || product.name}</h2>
              <div className="product-sub">{product.code}{product.rawSizeText ? ` · KT mẫu ${product.rawSizeText}` : ''}</div>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="product-preview-body">
          <div className="product-preview-image">
            <ProductThumb imagePath={product.coverImagePath} fill />
          </div>

          <div className="product-preview-meta">
            <div className="product-preview-price-block">
              <span>Đơn giá</span>
              <strong className="product-preview-price">{formatVND(product.unitPriceVnd)}</strong>
              <small>/{unitLabel(product.unit)}</small>
            </div>

            {description && (
              <div className="product-preview-desc">
                <span>Mô tả</span>
                <p>{description}</p>
              </div>
            )}

            <div className="product-preview-detail-grid">
              {specs.length > 0 && (
                <div className="product-preview-specs">
                  <span>Thông số kỹ thuật</span>
                  <ul>
                    {specs.map((spec, index) => (
                      <li key={`${spec.key}-${index}`}>
                        <em>{spec.key}</em>
                        <strong>{spec.value || '—'}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="product-preview-accessories">
                <span>Phụ kiện đi kèm</span>
                {fixedMeta && (
                  <div className="product-preview-pkg-name">
                    <strong>{fixedMeta.name}</strong>
                    {fixedMeta.unitPrice > 0 && <em>{formatVND(fixedMeta.unitPrice)}/bộ</em>}
                  </div>
                )}
                {accessories.length === 0 ? (
                  <p className="product-preview-empty">Chưa khai báo phụ kiện.</p>
                ) : (
                  <ul className="product-preview-acc-list">
                    {accessories.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        <strong>{item.name}</strong>
                        <em>×{item.quantity || 0}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {extras.length > 0 && (
                <div className="product-preview-accessories">
                  <span>Phụ kiện phát sinh mẫu</span>
                  <ul className="product-preview-acc-list">
                    {extras.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        <strong>{item.name}</strong>
                        <em>
                          {item.quantity > 0 ? `×${item.quantity} · ` : ''}
                          {formatVND(item.unitPrice)}
                        </em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="product-preview-footer">
          {onEdit && (
            <button type="button" className="btn btn-ghost" onClick={() => onEdit(product)}>
              <Pencil size={16} aria-hidden="true" />
              Chỉnh sửa
            </button>
          )}
          {onSelect && (
            <button type="button" className="btn btn-primary" onClick={() => onSelect(product)}>
              {selectLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
