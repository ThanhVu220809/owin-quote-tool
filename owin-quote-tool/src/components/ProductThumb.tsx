import { useEffect, useState } from 'react';
import { openImageLightbox } from '@/components/imageLightboxStore';
import { resolveImageUrl, resolveImageUrlSync, thumbUrlFor } from '@/lib/media/imagePaths';
import { resolveItemImage, type ImageItem } from '@/lib/media/itemImageResolver';
import type { ProductRecord } from '@/types/models';

const OWIN_LOGO = `${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`;

// Stable empty default: a fresh `[]` per render would change the effect's
// dependency every render → the resolve effect re-runs endlessly → 142 thumbnails
// re-render in a loop (Bảng giá freeze).
const NO_PRODUCTS: ProductRecord[] = [];

/**
 * Product image thumbnail with OWIN logo fallback when missing.
 * fill = lấp khung cha với object-fit: contain (khung catalogue đã là 95% ô).
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
  // Ảnh sản phẩm / bảng giá là URL công khai nên dựng được ngay trong lúc render:
  // không effect, không commit thêm. Danh sách vài trăm dòng nhờ vậy chỉ còn một
  // lần render thay vì một lần commit cho mỗi ảnh. Chỉ ảnh phải tải blob (báo giá
  // riêng tư) hoặc phải dò theo `item` mới đi đường async bên dưới.
  const directUrl = item ? null : resolveImageUrlSync(imagePath ?? imageId ?? null);
  const [asyncUrl, setAsyncUrl] = useState<string | null>(null);
  const [resolvingAsync, setResolvingAsync] = useState(true);
  // Gộp cờ lỗi vào một state có kèm "nguồn ảnh": đổi ảnh là cờ tự hết hiệu lực,
  // khỏi cần effect reset (effect reset sẽ lại sinh commit cho từng ảnh).
  const sourceKey = `${imagePath ?? ''}|${imageId ?? ''}`;
  const [errorFor, setErrorFor] = useState({ key: sourceKey, master: false, thumb: false });
  const failed = errorFor.key === sourceKey && errorFor.master;
  const thumbFailed = errorFor.key === sourceKey && errorFor.thumb;
  const resolving = directUrl === null && resolvingAsync;

  useEffect(() => {
    if (directUrl !== null) return;
    let revoked: string | null = null;
    let active = true;
    // Reset trạng thái "đang tải" trước khi dò lại nguồn ảnh mới.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setResolvingAsync(true);

    const resolve = async () => {
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
        setAsyncUrl(resolvedUrl);
      })
      .catch(() => {
        if (active) setAsyncUrl(null);
      })
      .finally(() => {
        if (active) setResolvingAsync(false);
      });

    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [directUrl, imageId, imagePath, item, products]);

  const url = directUrl ?? asyncUrl;
  const masterUrl = !failed && url ? url : null;
  const thumbUrl = thumb && !thumbFailed && masterUrl ? thumbUrlFor(masterUrl) : null;
  const showingThumb = Boolean(thumbUrl);
  const displayUrl = thumbUrl ?? masterUrl ?? OWIN_LOGO;
  // fill: lấp khung cha (contain). Fixed size: ô vuông list.
  const sizeStyle = fill
    ? { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }
    : { width: size, height: size };
  const className = fill
    ? 'ph image-fit-contain image-fit-fill'
    : 'product-thumb image-fit-contain';
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
        setResolvingAsync(false);
        // thumb thiếu → thử master; master lỗi → logo.
        if (showingThumb) setErrorFor({ key: sourceKey, master: failed, thumb: true });
        else if (!failed) setErrorFor({ key: sourceKey, master: true, thumb: false });
      }}
    />
  );
}

export { OWIN_LOGO };
