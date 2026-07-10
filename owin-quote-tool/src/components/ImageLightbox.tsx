import { useEffect } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { OWIN_LOGO } from '@/features/products/ProductThumb';

interface Props {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Fullscreen image viewer: click backdrop or X to close.
 * Zoom in/out for non-technical users inspecting product photos.
 */
export function ImageLightbox({ src, alt = 'Ảnh sản phẩm', open, onClose }: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="image-lightbox-backdrop" role="presentation" onClick={onClose}>
      <div
        className="image-lightbox-panel"
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="image-lightbox-toolbar">
          <span>Xem ảnh lớn</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="image-lightbox-stage">
          <img src={src || OWIN_LOGO} alt={alt} className="image-lightbox-img" />
        </div>
        <div className="image-lightbox-hint">
          <ZoomIn size={14} /> Nhấn nền tối hoặc nút đóng để thu nhỏ
          <ZoomOut size={14} />
        </div>
      </div>
    </div>
  );
}
