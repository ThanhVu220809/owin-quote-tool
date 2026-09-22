/**
 * Lối vào cũ của engine giá — giờ chỉ là lớp mỏng trỏ sang `@owin/quote-engine`.
 *
 * Code thật đã chuyển vào package để web công khai dùng chung. Giữ file này để
 * hàng chục chỗ đang import đường dẫn cũ không phải đổi, và để mọi thay đổi
 * công thức chỉ có đúng MỘT nơi để sửa.
 */
export * from '@owin/quote-engine';
