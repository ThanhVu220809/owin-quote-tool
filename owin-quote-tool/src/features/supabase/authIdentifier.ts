export const OWIN_LOGIN_USERNAME = 'hoanganhowin';
export const OWIN_LOGIN_EMAIL = 'hoanganhowin@gmail.com';

/** Cho phép dùng tên đăng nhập ngắn cho tài khoản OWIN, đồng thời chuẩn hóa email. */
export function normalizeLoginIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  return normalized === OWIN_LOGIN_USERNAME ? OWIN_LOGIN_EMAIL : normalized;
}
