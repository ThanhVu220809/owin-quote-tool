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
}

/**
 * iOS Image Dropzone. Chọn/kéo-thả ảnh → nén (EXIF auto, BR-5) → lưu IndexedDB (BR-9)
 * → trả imageId. Hiển thị preview từ IndexedDB.
 */
export function ImageDropzone({ imageId, imagePath, onImageStored }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className={`dropzone ${dragover ? 'dragover' : ''}`}
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
        if (f) handleFile(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      {busy ? (
        <div className="hint">
          <LoaderCircle size={22} className="spin" /> Đang nén ảnh…
        </div>
      ) : url ? (
        <img src={url} alt="Ảnh sản phẩm" />
      ) : (
        <div className="hint">
          <ImagePlus size={26} />
          <div>Chạm để chọn ảnh hoặc kéo-thả vào đây</div>
        </div>
      )}
      {error && <div style={{ color: 'var(--ios-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
