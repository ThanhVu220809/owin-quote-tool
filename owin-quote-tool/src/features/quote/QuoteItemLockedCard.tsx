/* Effect below intentionally resolves the lightbox URL into local state. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { ProductRecord, QuoteItemInput } from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import { formatVND } from '@/lib/format/currency';
import { titleCaseVi } from '@/lib/format/titleCase';
import { DragHandle } from '@/components/DragReorder';
import { ImageLightbox } from '@/components/ImageLightbox';
import { ProductThumb, OWIN_LOGO } from '@/components/ProductThumb';
import { resolveImageUrl } from '@/lib/media/imagePaths';

/** Thẻ hạng mục ở chế độ thu gọn: ảnh + tên + tổng tiền, bấm ảnh để xem lớn. */
export function QuoteItemLockedCard({
  index,
  item,
  products,
  imagePath,
  calculated,
  dragHandleProps,
  onExpand,
  onDuplicate,
  onDelete,
}: {
  index: number;
  item: QuoteItemInput;
  products: ProductRecord[];
  imagePath: string | null;
  calculated: ReturnType<typeof calculateQuote>['items'][number] | undefined;
  dragHandleProps: Record<string, unknown>;
  onExpand: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    if (!imagePath) {
      setLightboxUrl(OWIN_LOGO);
      return undefined;
    }
    void resolveImageUrl(imagePath).then((resolved) => {
      if (!active) return;
      if (resolved.revoke) revoked = resolved.url;
      setLightboxUrl(resolved.url || OWIN_LOGO);
    });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imagePath]);

  return (
    <div className="card quote-item-card quote-item-card-locked">
      <div className="quote-item-locked-row quote-item-locked-row-compact">
        <button
          type="button"
          className="quote-item-thumb quote-item-thumb-btn quote-item-thumb-compact"
          onClick={() => setLightboxOpen(true)}
          aria-label="Xem ảnh lớn"
          title="Bấm để xem ảnh lớn"
        >
          <ProductThumb item={item} products={products} imagePath={imagePath} fill thumb />
        </button>
        <button
          type="button"
          className="quote-item-locked-main"
          onClick={onExpand}
          aria-label={`Sửa hạng mục ${item.itemName || 'Hạng mục'}`}
          title="Bấm để sửa hạng mục"
        >
          <div className="quote-item-locked-title">
            <span className="quote-item-locked-index">#{index + 1}</span>
            <strong>{titleCaseVi(item.itemName || '') || 'Hạng Mục'}</strong>
          </div>
          <div className="quote-item-locked-meta">
            {(item.quoteItemCode || item.productCode) && (
              <span className="quote-item-locked-code">{item.quoteItemCode || item.productCode}</span>
            )}
            <span className="quote-item-locked-total">{formatVND(calculated?.itemTotalVnd ?? 0)}</span>
          </div>
        </button>
        <div className="quote-item-actions quote-item-locked-actions">
          <button className="icon-btn" type="button" onClick={onDuplicate} aria-label="Nhân bản hạng mục">
            <Copy size={16} />
          </button>
          <button className="icon-btn danger" type="button" onClick={onDelete} aria-label="Xóa hạng mục">
            <Trash2 size={16} />
          </button>
          <DragHandle {...dragHandleProps} label="Kéo để đổi thứ tự hạng mục" />
        </div>
      </div>
      <ImageLightbox
        open={lightboxOpen}
        src={lightboxUrl}
        alt={item.itemName || 'Ảnh hạng mục'}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
