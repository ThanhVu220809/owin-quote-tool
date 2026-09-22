import { withBasePath } from '@/lib/media/imagePaths';

export type AluminumProfileImageDisplay =
  | { kind: "image"; src: string }
  | { kind: "placeholder"; label: string };

const PUBLIC_IMAGE_PREFIX = "/aluminum-profiles/";

export function isSafeAluminumProfileImagePath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  if (value.startsWith("\\\\") || value.startsWith("//")) return false;
  if (value.includes("..")) return false;

  // Catalogue mặc định dùng file public; cây thêm thủ công dùng URL public từ
  // Supabase Storage (cùng đường tải ảnh với sản phẩm).
  return value.startsWith(PUBLIC_IMAGE_PREFIX) || /^https:\/\//i.test(value);
}

export function getAluminumProfileImageDisplay(image: string | null | undefined): AluminumProfileImageDisplay {
  if (isSafeAluminumProfileImagePath(image)) {
    return { kind: "image", src: image.startsWith(PUBLIC_IMAGE_PREFIX) ? withBasePath(image) : image };
  }

  return { kind: "placeholder", label: "Chưa có ảnh" };
}
