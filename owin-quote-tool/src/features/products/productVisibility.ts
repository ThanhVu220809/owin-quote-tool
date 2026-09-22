import type { ProductRecord } from '@/types/models';

/**
 * Sản phẩm này có hiện trên trang công khai không?
 *
 * Cờ công khai nằm ở HAI nơi phải luôn khớp nhau:
 *  - cột quan hệ `products.is_public` — nơi RLS lọc để quyết định anon đọc được
 *    dòng nào (`products_anon_read`);
 *  - `data.isPublic` trong document jsonb — nơi app đọc lên (`productFromRow`).
 * `rowFromProduct` ghi cả hai trong cùng một lần lưu, nên đường ghi duy nhất
 * được phép dùng là `saveProduct`. Ghi lẻ một bên là admin thấy một đằng, web
 * công khai làm một nẻo.
 *
 * Cột quan hệ mặc định `true`, nên **thiếu giá trị nghĩa là ĐANG công khai**.
 * Đừng viết `Boolean(product.isPublic)`: sản phẩm tạo trước khi có cờ này sẽ
 * hiện là "đang ẩn" trong admin trong khi web công khai vẫn phục vụ chúng —
 * chủ cửa hàng tưởng đã ẩn mà thực ra chưa.
 */
export function isProductPublic(product: Pick<ProductRecord, 'isPublic'>): boolean {
  return product.isPublic !== false;
}

/** Trạng thái sau khi bấm nút bật/tắt. */
export function nextPublicState(product: Pick<ProductRecord, 'isPublic'>): boolean {
  return !isProductPublic(product);
}

/**
 * Sản phẩm này có nằm trong nhóm nổi bật trên trang công khai không?
 *
 * Khác `isPublic` ở hai điểm, và cả hai đều cố ý:
 *  - mặc định là KHÔNG. Nổi bật là chọn ra vài món, không phải trạng thái mà cả
 *    danh mục rơi vào.
 *  - cờ này chỉ nằm trong `data` jsonb, KHÔNG có cột quan hệ. `is_public` buộc
 *    phải có cột vì RLS lọc theo nó; còn nổi bật chỉ là chuyện hiển thị, nên
 *    giữ ở một nơi duy nhất thì không bao giờ lệch. Trang công khai lọc bằng
 *    `data->>isFeatured`.
 */
export function isProductFeatured(product: Pick<ProductRecord, 'isFeatured'>): boolean {
  return product.isFeatured === true;
}

/** Trạng thái sau khi bấm nút nổi bật. */
export function nextFeaturedState(product: Pick<ProductRecord, 'isFeatured'>): boolean {
  return !isProductFeatured(product);
}
