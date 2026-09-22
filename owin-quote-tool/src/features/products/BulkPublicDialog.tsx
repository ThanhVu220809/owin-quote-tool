import { useState } from 'react';
import { Globe, GlobeLock, X } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { bulkSetProductsPublic } from '@/features/products/productStore';
import { isProductPublic } from '@/features/products/productVisibility';

/**
 * Bật/tắt hiển thị công khai cho cả danh mục trong một lượt.
 *
 * Hai chiều đặt cạnh nhau một cách cân xứng và mỗi chiều nói rõ sẽ chạm bao
 * nhiêu sản phẩm: thao tác này sửa hàng trăm dòng một lúc, nên người bấm phải
 * thấy trước con số chứ không phải đoán.
 */
export function BulkPublicDialog({
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
  const [saving, setSaving] = useState(false);

  const publicCount = products.filter(isProductPublic).length;
  const hiddenCount = products.length - publicCount;

  const apply = async (isPublic: boolean) => {
    const affected = isPublic ? hiddenCount : publicCount;
    if (affected === 0) return;
    const verb = isPublic ? 'hiện' : 'ẩn';
    if (!confirm(`${isPublic ? 'Hiện' : 'Ẩn'} ${affected} sản phẩm trên trang công khai?`)) return;
    setSaving(true);
    try {
      const changed = await bulkSetProductsPublic(isPublic);
      onDone(changed === 0
        ? 'Không có sản phẩm nào cần đổi trạng thái.'
        : `Đã ${verb} ${changed} sản phẩm trên trang công khai.`);
    } catch {
      onError('Không thể đổi trạng thái hiển thị trên Supabase. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="product-modal bulk-public-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-public-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="product-modal-header">
          <div className="product-modal-title">
            <div className="product-modal-title-copy">
              <div className="product-modal-kicker">Danh mục sản phẩm</div>
              <h2 id="bulk-public-title">Hiển thị trên trang công khai</h2>
              <div className="product-sub">Chỉ áp dụng cho sản phẩm đang hoạt động · không chạm sản phẩm đã xoá</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="bulk-public-body">
          <div className="bulk-public-status">
            <div>
              <Globe size={18} aria-hidden="true" />
              <strong>{publicCount}</strong>
              <span>đang hiện trên web</span>
            </div>
            <div>
              <GlobeLock size={18} aria-hidden="true" />
              <strong>{hiddenCount}</strong>
              <span>đang ẩn</span>
            </div>
          </div>

          <div className="bulk-public-actions">
            <button
              className="btn btn-ghost"
              onClick={() => void apply(false)}
              disabled={saving || publicCount === 0}
            >
              <GlobeLock size={16} aria-hidden="true" />
              Ẩn tất cả
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void apply(true)}
              disabled={saving || hiddenCount === 0}
            >
              <Globe size={16} aria-hidden="true" />
              Hiện tất cả
            </button>
          </div>

          <p className="bulk-public-note">
            Sau khi ẩn hàng loạt, bạn vẫn bật lại từng sản phẩm được bằng nút <strong>Web</strong> ở mỗi dòng.
          </p>
        </div>
      </div>
    </div>
  );
}
