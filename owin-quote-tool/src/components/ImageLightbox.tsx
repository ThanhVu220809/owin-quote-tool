import { useEffect, useState, useSyncExternalStore } from 'react';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { OWIN_LOGO } from '@/features/products/ProductThumb';
import {
  closeImageLightbox,
  getImageLightboxSrc,
  subscribeImageLightbox,
} from './imageLightboxStore';

interface Props {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

/** 1× = fit khung xem (không phải pixel gốc — ảnh thanh nhôm ~100px sẽ được phóng to). */
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.5;
/** Tỉ lệ lấp khung ở 1× (ảnh nhỏ kỹ thuật + ảnh SP đều fill stage). */
const FIT_WIDTH_PCT = 92;

/**
 * Fullscreen image viewer: click backdrop or X to close.
 * 1× fills the stage (scales tiny aluminum drawings up); zoom multiplies that fit size.
 */
export function ImageLightbox({ src, alt = 'Ảnh sản phẩm', open, onClose }: Props) {
  const [zoom, setZoom] = useState(MIN_ZOOM);

  // Reset zoom whenever the viewer opens or the image changes.
  useEffect(() => {
    // Resetting local viewer state is intentional when the viewed resource changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(MIN_ZOOM);
  }, [open, src]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === '+' || event.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      else if (event.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
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

  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;
  const widthPct = FIT_WIDTH_PCT * zoom;

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
          <div className="image-lightbox-zoom">
            <button type="button" className="icon-btn" onClick={zoomOut} disabled={!canZoomOut} aria-label="Thu nhỏ">
              <ZoomOut size={17} />
            </button>
            <span className="image-lightbox-zoom-level">{Math.round(zoom * 100)}%</span>
            <button type="button" className="icon-btn" onClick={zoomIn} disabled={!canZoomIn} aria-label="Phóng to">
              <ZoomIn size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setZoom(MIN_ZOOM)}
              disabled={zoom === MIN_ZOOM}
              aria-label="Vừa khung"
              title="Vừa khung xem"
            >
              <Maximize2 size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="image-lightbox-stage">
          <img
            src={src || OWIN_LOGO}
            alt={alt}
            className="image-lightbox-img"
            style={{
              // Force fill stage — native max-* left tiny aluminum PNGs as postage stamps.
              width: `${widthPct}%`,
              maxWidth: 'none',
              height: 'auto',
              maxHeight: `calc(min(78vh, 820px) * ${zoom})`,
            }}
          />
        </div>
        <div className="image-lightbox-hint">
          1× = vừa khung · phím +/− phóng to/thu nhỏ · nền tối hoặc ✕ để đóng
        </div>
      </div>
    </div>
  );
}

/** Mount 1 lần ở App; các nơi gọi openImageLightbox(url) để mở. */
export function GlobalImageLightbox() {
  const src = useSyncExternalStore(
    subscribeImageLightbox,
    getImageLightboxSrc,
    () => null,
  );
  return <ImageLightbox src={src} open={src !== null} onClose={closeImageLightbox} />;
}
