import { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { compressAndStore, getImageUrl, ImageError } from '@/utils/imageStorage';
import { resolveImageUrl } from '@/utils/imagePaths';

const OWIN_LOGO = `${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`;

interface Props {
  /** id ảnh hiện tại (đã lưu IndexedDB). */
  imageId?: string;
  /** Logical image path, e.g. products/<folder>/images/cover.webp. */
  imagePath?: string | null;
  /** Gọi khi nén+lưu xong, trả id mới để form gắn vào sản phẩm. */
  onImageStored: (id: string) => void;
  /** Optional class for layout variants. */
  className?: string;
  /**
   * pasteScope:
   * - "dropzone": only when dropzone focused/hovered
   * - "form": when parent product/quote form is open (clipboard image → cover)
   */
  pasteScope?: 'dropzone' | 'form';
}

function isImageFile(file: File | null | undefined): file is File {
  if (!file) return false;
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || '');
}

function clipboardHasImage(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  const files = event.clipboardData?.files;
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }
  if (files) {
    const found = Array.from(files).find(isImageFile);
    if (found) return found;
  }
  return null;
}

/**
 * Image dropzone: click / drag-drop / Ctrl+V image → compress → IndexedDB → onImageStored.
 * Text paste in inputs is never broken: we only intercept when clipboard contains image files.
 */
export function ImageDropzone({
  imageId,
  imagePath,
  onImageStored,
  className,
  pasteScope = 'dropzone',
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (!imageId && !imagePath) {
        setUrl(null);
        return;
      }
      const load = imageId
        ? getImageUrl(imageId).then((u) => ({ url: u, revoke: Boolean(u) }))
        : resolveImageUrl(imagePath);
      load.then((resolved) => {
        if (active && resolved.url) {
          if (resolved.revoke) revoked = resolved.url;
          setUrl(resolved.url);
        }
      });
    });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imageId, imagePath]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const { id } = await compressAndStore(file);
        onImageStored(id);
      } catch (e) {
        setError(e instanceof ImageError ? e.message : 'Lỗi xử lý ảnh');
      } finally {
        setBusy(false);
      }
    },
    [onImageStored],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const imageFile = clipboardHasImage(event);
      // No image file → never intercept (normal text paste works everywhere).
      if (!imageFile) return;

      const root = rootRef.current;
      if (!root) return;

      const formHost = root.closest('.product-editor-card, .quote-item-card');
      const active = document.activeElement as HTMLElement | null;
      const inDropzone = root.contains(active) || focused || root.matches(':hover');
      const inForm = Boolean(formHost && (formHost.contains(active) || formHost.contains(root)));

      if (pasteScope === 'form') {
        if (!inForm && !inDropzone) return;
      } else if (!inDropzone) {
        return;
      }

      // Clipboard has image → set cover. Do not treat as text paste.
      event.preventDefault();
      event.stopPropagation();
      void handleFile(imageFile);
    };

    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [focused, handleFile, pasteScope]);

  return (
    <div
      ref={rootRef}
      className={`dropzone image-fit-frame ${dragover ? 'dragover' : ''} ${className || ''}`.trim()}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
        const f = e.dataTransfer.files?.[0];
        if (f && isImageFile(f)) void handleFile(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      {busy ? (
        <div className="hint">
          <LoaderCircle size={22} className="spin" /> Đang nén ảnh…
        </div>
      ) : url ? (
        <img className="image-fit-contain" src={url} alt="Ảnh sản phẩm" />
      ) : (
        <div className="dropzone-empty">
          <img className="image-fit-contain dropzone-logo-fallback" src={OWIN_LOGO} alt="OWIN" />
          <div className="hint">
            <ImagePlus size={20} />
            <div>Chạm / kéo-thả / Ctrl+V ảnh</div>
          </div>
        </div>
      )}
      {error && <div style={{ color: 'var(--ios-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
