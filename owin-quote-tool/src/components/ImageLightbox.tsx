import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { OWIN_LOGO } from '@/components/ProductThumb';
import {
  closeImageLightbox,
  getImageLightboxSrc,
  subscribeImageLightbox,
} from '@/components/imageLightboxStore';

interface Props {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

/** 100% = vừa khung xem (không phải pixel gốc — ảnh thanh nhôm ~100px vẫn được phóng lên). */
const FIT_ZOOM = 1;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
/** Mở lên ở 60% khung cho dễ nhìn tổng thể, muốn to thì zoom thêm. */
const DEFAULT_ZOOM = 0.6;
const ZOOM_FACTOR = 1.2;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
/** Đi 1 nấc zoom, dừng lại đúng 100% khi bước qua mốc vừa khung. */
const stepZoom = (current: number, direction: 1 | -1) => {
  const next = clampZoom(direction > 0 ? current * ZOOM_FACTOR : current / ZOOM_FACTOR);
  if ((current < FIT_ZOOM && next > FIT_ZOOM) || (current > FIT_ZOOM && next < FIT_ZOOM)) return FIT_ZOOM;
  return next;
};

/**
 * Fullscreen image viewer: click backdrop or X to close.
 * Khung modal có kích thước cố định: zoom chỉ phóng to ảnh bên trong stage
 * (stage cuộn được), không kéo modal to theo. 100% = ảnh vừa đúng stage.
 */
export function ImageLightbox({ src, alt = 'Ảnh sản phẩm', open, onClose }: Props) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  /** Tỉ lệ w/h của ảnh — quyết định fit theo chiều ngang hay chiều dọc. */
  const [imgRatio, setImgRatio] = useState<number | null>(null);
  const [stageRatio, setStageRatio] = useState(1);
  const [panning, setPanning] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  /** Điểm neo (con trỏ / tâm stage) giữ nguyên vị trí sau khi đổi zoom. */
  const anchorRef = useRef<{ x: number; y: number; ratioX: number; ratioY: number } | null>(null);
  const panRef = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  /** Các ngón đang chạm trên stage + trạng thái bắt đầu của thao tác chụm 2 ngón. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  // Reset zoom whenever the viewer opens or the image changes.
  useEffect(() => {
    // Resetting local viewer state is intentional when the viewed resource changes.
    /* eslint-disable react-hooks/set-state-in-effect */
    setZoom(DEFAULT_ZOOM);
    setImgRatio(null);
    pointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, src]);

  /** next: giá trị zoom mới, hoặc hàm cập nhật để nhiều event wheel liên tiếp cộng dồn đúng. */
  const zoomTo = useCallback((next: number | ((current: number) => number), clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      const x = clientX === undefined ? rect.width / 2 : clientX - rect.left;
      const y = clientY === undefined ? rect.height / 2 : clientY - rect.top;
      anchorRef.current = {
        x,
        y,
        ratioX: (stage.scrollLeft + x) / Math.max(1, stage.scrollWidth),
        ratioY: (stage.scrollTop + y) / Math.max(1, stage.scrollHeight),
      };
    }
    setZoom((current) => clampZoom(typeof next === 'function' ? next(current) : next));
  }, []);

  // Giữ điểm neo sau khi ảnh đổi kích thước (chạy trước khi vẽ nên không giật).
  // Lặp lại ở frame kế tiếp: nếu ảnh đổi cỡ có transition thì layout chưa cập nhật
  // ngay trong layout effect, lần chạy thứ hai mới ra đúng vị trí.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!stage || !anchor) return undefined;
    const apply = () => {
      stage.scrollLeft = anchor.ratioX * stage.scrollWidth - anchor.x;
      stage.scrollTop = anchor.ratioY * stage.scrollHeight - anchor.y;
    };
    apply();
    const frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [zoom]);

  // Wheel phải là listener native non-passive: onWheel của React là passive
  // nên preventDefault() không chặn được cuộn stage/trang.
  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo((current) => stepZoom(current, event.deltaY > 0 ? -1 : 1), event.clientX, event.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [open, zoomTo]);

  // Đo khung stage để biết ảnh nên fit theo chiều nào (stage không đổi khi zoom).
  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return undefined;
    const measure = () => {
      const style = getComputedStyle(stage);
      const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width > 0 && height > 0) setStageRatio(width / height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === '+' || event.key === '=') zoomTo((current) => stepZoom(current, 1));
      else if (event.key === '-') zoomTo((current) => stepZoom(current, -1));
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, zoomTo]);

  if (!open) return null;

  const stopPan = () => {
    const pan = panRef.current;
    panRef.current = null;
    if (pan && stageRef.current?.hasPointerCapture(pan.id)) stageRef.current.releasePointerCapture(pan.id);
    setPanning(false);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || event.button !== 0) return;
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      // Chụm 2 ngón: bỏ kéo, chuyển sang zoom liên tục quanh trung điểm.
      stopPan();
      const [a, b] = [...pointers.values()];
      pinchRef.current = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom };
      return;
    }
    if (pointers.size > 2) return;
    const scrollable = stage.scrollWidth > stage.clientWidth || stage.scrollHeight > stage.clientHeight;
    if (!scrollable) return;
    panRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
    // Giữ pointer để kéo ra ngoài stage vẫn tiếp tục di chuyển ảnh.
    stage.setPointerCapture(event.pointerId);
    setPanning(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointers = pointersRef.current;
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) zoomTo((pinch.zoom * dist) / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const start = panRef.current;
    if (!start) return;
    stage.scrollLeft = start.left - (event.clientX - start.x);
    stage.scrollTop = start.top - (event.clientY - start.y);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchRef.current = null;
    if (panRef.current) stopPan();
  };

  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;
  const canPan = zoom > FIT_ZOOM;
  /** Ảnh rộng hơn khung → fit theo chiều ngang, ngược lại fit theo chiều dọc. */
  const fitByWidth = imgRatio === null || imgRatio >= stageRatio;
  const sizePct = `${zoom * 100}%`;

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
            <button type="button" className="icon-btn image-lightbox-zoom-out" onClick={() => zoomTo((current) => stepZoom(current, -1))} disabled={!canZoomOut} aria-label="Thu nhỏ" title="Thu nhỏ">
              <ZoomOut size={17} />
            </button>
            <span className="image-lightbox-zoom-level">{Math.round(zoom * 100)}%</span>
            <button type="button" className="icon-btn image-lightbox-zoom-in" onClick={() => zoomTo((current) => stepZoom(current, 1))} disabled={!canZoomIn} aria-label="Phóng to" title="Phóng to">
              <ZoomIn size={17} />
            </button>
            <button
              type="button"
              className="icon-btn image-lightbox-zoom-fit"
              onClick={() => zoomTo(FIT_ZOOM)}
              disabled={zoom === FIT_ZOOM}
              aria-label="Vừa khung"
              title="Vừa khung xem"
            >
              <Maximize2 size={16} />
            </button>
            <button type="button" className="icon-btn image-lightbox-close" onClick={onClose} aria-label="Đóng" title="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          ref={stageRef}
          className={`image-lightbox-stage${canPan ? ' is-pannable' : ''}${panning ? ' is-panning' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={src || OWIN_LOGO}
            alt={alt}
            className="image-lightbox-img"
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) setImgRatio(naturalWidth / naturalHeight);
            }}
            style={{
              // 100% = đúng khung stage (ảnh kỹ thuật nhỏ vẫn được phóng lên),
              // zoom nhân lên từ đó rồi cho stage cuộn — modal giữ nguyên cỡ.
              width: fitByWidth ? sizePct : 'auto',
              height: fitByWidth ? 'auto' : sizePct,
              maxWidth: 'none',
              maxHeight: 'none',
            }}
          />
        </div>
        <div className="image-lightbox-hint">
          <span className="image-lightbox-hint-mouse">
            Cuộn chuột hoặc phím +/− để phóng to · kéo ảnh để di chuyển · 100% là vừa khung · Esc hoặc ✕ để đóng
          </span>
          <span className="image-lightbox-hint-touch">
            Chụm 2 ngón hoặc nút +/− để phóng to · kéo ảnh để di chuyển · ✕ để đóng
          </span>
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
