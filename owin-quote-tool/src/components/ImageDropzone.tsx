import { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { compressAndStore, getImageUrl, ImageError } from '@/utils/imageStorage';
import { resolveImageUrl } from '@/utils/imagePaths';

interface Props {
  /** id ảnh hiện tại (đã lưu IndexedDB). */
  imageId?: string;
  /** Logical image path, e.g. products/<folder>/images/cover.webp. */
  imagePath?: string | null;
  /** Gọi khi nén+lưu xong, trả id mới để form gắn vào sản phẩm. */
  onImageStored: (id: string) => void;
  /** Optional class for layout variants. */
  className?: string;
}

function isImageFile(file: File | null | undefined): file is File {
  if (!file) return false;
  if (file.type.startsWith('image/')) return true;
  // Some browsers omit type for clipboard PNG/JPG/WebP.
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || '');
}

/**
 * iOS Image Dropzone. Chọn/kéo-thả/Ctrl+V ảnh → nén → lưu IndexedDB → trả imageId.
 * Text paste in inputs is never intercepted; only clipboard image files.
 */
export function ImageDropzone({ imageId, imagePath, onImageStored, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Nạp preview từ IndexedDB khi imageId đổi; revoke URL cũ khi unmount/đổi.
  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (!imageId && !imagePath) {
        setUrl(null);
        return;
      }
      const load = imageId ? getImageUrl(imageId).then((u) => ({ url: u, revoke: Boolean(u) })) : resolveImageUrl(imagePath);
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

  // Ctrl+V image paste: only when dropzone (or product form) has focus context and clipboard has image files.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never intercept normal text paste inside inputs/textareas/contenteditable.
      if (
        target
        && (target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.isContentEditable)
      ) {
        return;
      }

      const items = event.clipboardData?.items;
      const files = event.clipboardData?.files;
      let imageFile: File | null = null;

      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            imageFile = item.getAsFile();
            if (imageFile) break;
          }
        }
      }
      if (!imageFile && files) {
        imageFile = Array.from(files).find(isImageFile) || null;
      }
      if (!imageFile) return;

      // Only handle when the dropzone is focused, hovered, or inside the product form card.
      const root = rootRef.current;
      const active = document.activeElement;
      const inDropzone = root && (root.contains(active) || focused || root.matches(':hover'));
      const inProductForm = root?.closest('.product-editor-card, .quote-item-card');
      if (!inDropzone && !inProductForm) return;

      event.preventDefault();
      void handleFile(imageFile);
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [focused, handleFile]);

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
        <div className="hint">
          <ImagePlus size={26} />
          <div>Chạm để chọn ảnh, kéo-thả, hoặc Ctrl+V</div>
        </div>
      )}
      {error && <div style={{ color: 'var(--ios-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
