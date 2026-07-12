/**
 * NGUỒN DUY NHẤT CỦA GOOGLE CLIENT ID — chỉ đọc từ import.meta.env.VITE_GOOGLE_CLIENT_ID.
 *
 * Không lấy Client ID từ IndexedDB, localStorage, sessionStorage hay config cũ.
 * Không fallback sang giá trị hard-code. Không dùng client_secret.
 *
 * Chuẩn hoá: trim khoảng trắng/newline và bỏ cặp quote bao ngoài (nếu người dùng từng
 * dán "value" vào GitHub Secret), rồi kiểm tra đúng định dạng Google OAuth client web.
 */

const CLIENT_ID_PATTERN = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

/** Bỏ đúng một cặp quote bao ngoài (" hoặc ') nếu có. */
function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1).trim();
  }
  return value;
}

/** Chuẩn hoá một giá trị Client ID thô (trim + bỏ quote bao ngoài). */
export function normalizeGoogleClientId(raw: string | null | undefined): string {
  if (!raw) return '';
  return stripWrappingQuotes(raw.trim());
}

/** Đúng định dạng Google OAuth web client id chưa. */
export function isValidGoogleClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value);
}

/** Client ID runtime đã chuẩn hoá — nguồn DUY NHẤT cho GIS. Có thể chưa hợp lệ. */
export function getGoogleClientId(): string {
  return normalizeGoogleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

/** Client ID đã chuẩn hoá VÀ hợp lệ; nếu không hợp lệ thì ném lỗi rõ ràng. */
export function getValidatedGoogleClientId(): string {
  const id = getGoogleClientId();
  if (!isValidGoogleClientId(id)) {
    throw new Error('Cấu hình Google Client ID không hợp lệ (không đúng dạng *.apps.googleusercontent.com).');
  }
  return id;
}

/** Chẩn đoán AN TOÀN — không lộ giá trị Client ID trên production. */
export function describeGoogleClientId(): {
  clientIdConfigured: boolean;
  clientIdLength: number;
  clientIdSuffixValid: boolean;
  currentOrigin: string;
} {
  const id = getGoogleClientId();
  return {
    clientIdConfigured: id.length > 0,
    clientIdLength: id.length,
    clientIdSuffixValid: isValidGoogleClientId(id),
    currentOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  };
}
