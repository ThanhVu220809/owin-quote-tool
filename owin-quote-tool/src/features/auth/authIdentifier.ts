/**
 * Chuẩn hóa thứ người dùng gõ ở ô đăng nhập trước khi gửi tới Supabase Auth.
 *
 * KHÔNG ghi cứng email tài khoản nào ở đây. Bản cũ có phím tắt đổi `admin`
 * thành một email cố định, nhưng hệ thống nay có nhiều cửa hàng và nhiều tài
 * khoản quản trị, nên một email cố định vừa sai vừa là dữ liệu cá nhân nằm
 * trong repo. Ai muốn gõ ngắn thì dùng nút đăng nhập Google.
 */
export function normalizeLoginIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}
