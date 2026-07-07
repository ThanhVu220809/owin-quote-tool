import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { resolveImageUrl } from '@/utils/imagePaths';

/**
 * Thumbnail sản phẩm — đọc ảnh từ IndexedDB theo imageId.
 * `fill` = lấp đầy khung cha (dùng cho card grid); ngược lại dùng kích thước `size` cố định.
 */
export function ProductThumb({
  imageId,
  imagePath,
  size = 52,
  fill = false,
}: {
  imageId?: string;
  imagePath?: string | null;
  size?: number;
  fill?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const path = imagePath || (imageId ? `legacy-images/${imageId}` : null);
      if (!path) {
        setUrl(null);
        return;
      }
      resolveImageUrl(path).then((resolved) => {
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

  const sizeStyle = fill ? { width: '100%', height: '100%' } : { width: size, height: size };
  if (url) {
    return <img className={fill ? 'ph' : 'product-thumb'} src={url} alt="" style={sizeStyle} />;
  }
  return (
    <div
      className={fill ? 'ph' : 'product-thumb'}
      style={{ ...sizeStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Package size={22} color="var(--ios-gray1)" />
    </div>
  );
}
