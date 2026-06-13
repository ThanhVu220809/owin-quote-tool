import { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { compressAndStore, getImageUrl, ImageError } from '@/utils/imageStorage';

interface Props {
  /** id ảnh hiện tại (đã lưu IndexedDB). */
  imageId?: string;
  /** Gọi khi nén+lưu xong, trả id mới để form gắn vào sản phẩm. */
  onImageStored: (id: string) => void;
}

/**
 * iOS Image Dropzone. Chọn/kéo-thả ảnh → nén (EXIF auto, BR-5) → lưu IndexedDB (BR-9)
 * → trả imageId. Hiển thị preview từ IndexedDB.
 */
export function ImageDropzone({ imageId, onImageStored }: Props) {
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
      if (!imageId) {
        setUrl(null);
        return;
      }
      getImageUrl(imageId).then((u) => {
        if (active && u) {
          revoked = u;
          setUrl(u);
        }
      });
    });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imageId]);

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
