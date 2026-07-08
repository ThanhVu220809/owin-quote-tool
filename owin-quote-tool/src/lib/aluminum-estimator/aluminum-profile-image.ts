import { withBasePath } from '@/utils/imagePaths';

export type AluminumProfileImageDisplay =
  | { kind: "image"; src: string }
  | { kind: "placeholder"; label: string };

const PUBLIC_IMAGE_PREFIX = "/aluminum-profiles/";

export function isSafeAluminumProfileImagePath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  if (value.startsWith("\\\\") || value.startsWith("//")) return false;
  if (value.includes("..")) return false;

  return value.startsWith(PUBLIC_IMAGE_PREFIX);
}

export function getAluminumProfileImageDisplay(image: string | null | undefined): AluminumProfileImageDisplay {
  if (isSafeAluminumProfileImagePath(image)) {
    return { kind: "image", src: withBasePath(image) };
  }

  return { kind: "placeholder", label: "Chưa có ảnh" };
}
