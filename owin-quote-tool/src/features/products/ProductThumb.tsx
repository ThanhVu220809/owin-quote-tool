import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { getImageUrl } from '@/utils/imageStorage';

/**
 * Thumbnail sản phẩm — đọc ảnh từ IndexedDB theo imageId.
 * `fill` = lấp đầy khung cha (dùng cho card grid); ngược lại dùng kích thước `size` cố định.
 */
export function ProductThumb({
  imageId,
  size = 52,
  fill = false,
}: {
  imageId?: string;
  size?: number;
  fill?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    if (imageId) {
      getImageUrl(imageId).then((u) => {
        if (active && u) {
          revoked = u;
          setUrl(u);
        }
      });
    } else {
      setUrl(null);
    }
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imageId]);

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
