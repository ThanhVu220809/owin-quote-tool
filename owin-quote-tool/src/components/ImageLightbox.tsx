import { useEffect, useState, useSyncExternalStore } from 'react';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { OWIN_LOGO } from '@/features/products/ProductThumb';

interface Props {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

/**
 * Fullscreen image viewer: click backdrop or X to close.
 * Real zoom in/out (1×–3×) for non-technical users inspecting product photos;
 * when enlarged the stage scrolls so any corner can be panned into view.
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
              aria-label="Về kích thước gốc"
              title="Về kích thước gốc"
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
            style={{ maxWidth: `${95 * zoom}%`, maxHeight: `calc(min(68vh, 640px) * ${zoom})` }}
          />
        </div>
        <div className="image-lightbox-hint">Nhấn nền tối hoặc nút đóng để thu nhỏ · phím +/− để phóng to/thu nhỏ</div>
      </div>
    </div>
  );
}

// ---- Opener toàn cục: bấm ảnh ở bất kỳ đâu để phóng to ----
let globalSrc: string | null = null;
const globalListeners = new Set<() => void>();

export function openImageLightbox(url: string | null | undefined): void {
  if (!url) return;
  globalSrc = url;
  globalListeners.forEach((l) => l());
}

function closeGlobalLightbox(): void {
  globalSrc = null;
  globalListeners.forEach((l) => l());
}

/** Mount 1 lần ở App; các nơi gọi openImageLightbox(url) để mở. */
export function GlobalImageLightbox() {
  const src = useSyncExternalStore(
    (cb) => { globalListeners.add(cb); return () => { globalListeners.delete(cb); }; },
    () => globalSrc,
    () => null,
  );
  return <ImageLightbox src={src} open={src !== null} onClose={closeGlobalLightbox} />;
}
