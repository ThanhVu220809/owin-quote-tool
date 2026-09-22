/** Phân trang dùng chung cho các màn danh sách (Báo giá, Sản phẩm…). */

export type PageSize = 10 | 25 | 50 | 100;

export const PAGE_SIZES: PageSize[] = [25, 50, 100];

export interface PaginationResult<T> {
  items: T[];
  page: number;
  totalItems: number;
  totalPages: number;
  firstItemNumber: number;
  lastItemNumber: number;
}

/**
 * Cắt một trang từ danh sách. `requestedPage` luôn được kẹp vào [1, totalPages]
 * nên khi bộ lọc thu hẹp danh sách, trang hiện tại tự lùi về trang cuối hợp lệ
 * thay vì trả về mảng rỗng.
 *
 * `pageSize` nhận số bất kỳ (không chỉ các mức trong `PAGE_SIZES`) để màn hình
 * nào tắt phân trang thì truyền đúng tổng số phần tử và lấy trọn một trang.
 */
export function paginateItems<T>(
  items: T[],
  requestedPage: number,
  pageSize: number,
): PaginationResult<T> {
  const totalItems = items.length;
  const effectivePageSize = Math.max(1, Math.trunc(pageSize));
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const normalizedPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.min(Math.max(1, normalizedPage), totalPages);
  const startIndex = (page - 1) * effectivePageSize;

  return {
    items: items.slice(startIndex, startIndex + effectivePageSize),
    page,
    totalItems,
    totalPages,
    firstItemNumber: totalItems === 0 ? 0 : startIndex + 1,
    lastItemNumber: Math.min(startIndex + effectivePageSize, totalItems),
  };
}
