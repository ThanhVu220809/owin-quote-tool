import { useEffect, useState } from 'react';
import { openImageLightbox } from '@/components/imageLightboxStore';
import { resolveImageUrl, thumbUrlFor } from '@/utils/imagePaths';
import { resolveItemImage, type ImageItem } from '@/lib/media/itemImageResolver';
import type { ProductRecord } from '@/types/models';

const OWIN_LOGO = `${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`;

// Stable empty default: a fresh `[]` per render would change the effect's
// dependency every render → the resolve effect re-runs endlessly → 142 thumbnails
// re-render in a loop (Bảng giá freeze).
const NO_PRODUCTS: ProductRecord[] = [];

/**
 * Product image thumbnail with OWIN logo fallback when missing.
 * fill = fill parent frame with 95% contain semantics (CSS class).
 */
export function ProductThumb({
  imageId,
  imagePath,
  size = 52,
  fill = false,
  item,
  products = NO_PRODUCTS,
  thumb = false,
  previewable = true,
}: {
  imageId?: string;
  imagePath?: string | null;
  size?: number;
  fill?: boolean;
  item?: ImageItem;
  products?: ProductRecord[];
  /** Dùng bản thumbnail nhẹ cho list/bảng giá; tự fallback về master nếu thiếu. Lightbox luôn master. */
  thumb?: boolean;
  /**
   * Khi true (mặc định): bấm ảnh mở lightbox xem lớn.
   * Tắt khi parent tự xử lý click (vd. chọn file khi đang sửa hạng mục).
   */
  previewable?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    // Reset loading/fallback UI when the image inputs change, before re-resolving.
    /* eslint-disable react-hooks/set-state-in-effect */
    setResolving(true);
    setFailed(false);
    setThumbFailed(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    const resolve = async () => {
      setFailed(false);
      const path = imagePath || imageId || null;
      if (!path) {
        if (item) {
          const resolved = await resolveItemImage(item, products);
          if (resolved.revoke) revoked = resolved.url;
          return resolved.url;
        }
        return null;
      }
      const resolved = item
        ? await resolveItemImage({ ...item, imagePath: path }, products)
        : await resolveImageUrl(path);
      if (resolved.revoke) revoked = resolved.url;
      return resolved.url;
    };

    void resolve()
      .then((resolvedUrl) => {
        if (!active) {
          if (revoked) URL.revokeObjectURL(revoked);
          revoked = null;
          return;
        }
        setUrl(resolvedUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      })
      .finally(() => {
        if (active) setResolving(false);
      });

    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imageId, imagePath, item, products]);

  const masterUrl = !failed && url ? url : null;
  const thumbUrl = thumb && !thumbFailed && masterUrl ? thumbUrlFor(masterUrl) : null;
  const showingThumb = Boolean(thumbUrl);
  const displayUrl = thumbUrl ?? masterUrl ?? OWIN_LOGO;
  const sizeStyle = fill ? { width: '95%', height: '95%' } : { width: size, height: size };
  const className = fill ? 'ph image-fit-contain' : 'product-thumb image-fit-contain';
  const canPreview = Boolean(previewable && masterUrl);

  return (
    <img
      className={className}
      src={displayUrl}
      alt=""
      loading="lazy"
      decoding="async"
      data-image-loading={resolving ? 'true' : 'false'}
      aria-busy={resolving}
      style={{ ...sizeStyle, cursor: canPreview ? 'zoom-in' : undefined }}
      onClick={
        canPreview
          ? (e) => {
              e.stopPropagation();
              openImageLightbox(masterUrl!);
            }
          : undefined
      }
      onError={() => {
        setResolving(false);
        // thumb thiếu → thử master; master lỗi → logo.
        if (showingThumb) setThumbFailed(true);
        else if (!failed) setFailed(true);
      }}
    />
  );
}

export { OWIN_LOGO };
