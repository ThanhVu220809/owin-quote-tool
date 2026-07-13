import { useEffect, useState } from 'react';
import { resolveImageUrl } from '@/utils/imagePaths';
import { resolveItemImage, type ImageItem } from '@/lib/media/itemImageResolver';
import type { ProductRecord } from '@/types/models';

const OWIN_LOGO = `${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`;

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
  products = [],
}: {
  imageId?: string;
  imagePath?: string | null;
  size?: number;
  fill?: boolean;
  item?: ImageItem;
  products?: ProductRecord[];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    // Reset loading/fallback UI when the image inputs change, before re-resolving.
    /* eslint-disable react-hooks/set-state-in-effect */
    setResolving(true);
    setFailed(false);
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

  const displayUrl = !failed && url ? url : OWIN_LOGO;
  const sizeStyle = fill ? { width: '95%', height: '95%' } : { width: size, height: size };
  const className = fill ? 'ph image-fit-contain' : 'product-thumb image-fit-contain';

  return (
    <img
      className={className}
      src={displayUrl}
      alt=""
      data-image-loading={resolving ? 'true' : 'false'}
      aria-busy={resolving}
      style={sizeStyle}
      onError={() => {
        setResolving(false);
        if (!failed) setFailed(true);
      }}
    />
  );
}

export { OWIN_LOGO };
