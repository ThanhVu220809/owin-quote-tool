import { useEffect, useState } from 'react';
import { resolveImageUrl } from '@/utils/imagePaths';

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
}: {
  imageId?: string;
  imagePath?: string | null;
  size?: number;
  fill?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    setFailed(false);
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
        } else if (active) {
          setUrl(null);
        }
      });
    });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imageId, imagePath]);

  const displayUrl = !failed && url ? url : OWIN_LOGO;
  const sizeStyle = fill ? { width: '95%', height: '95%' } : { width: size, height: size };
  const className = fill ? 'ph image-fit-contain' : 'product-thumb image-fit-contain';

  return (
    <img
      className={className}
      src={displayUrl}
      alt=""
      style={sizeStyle}
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}

export { OWIN_LOGO };
