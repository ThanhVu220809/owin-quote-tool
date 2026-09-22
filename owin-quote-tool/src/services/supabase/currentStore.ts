/**
 * Cửa hàng đang làm việc của phiên hiện tại.
 *
 * Mọi bảng nghiệp vụ đều mang `store_id`, nên repository cần biết đang đọc/ghi
 * cho cửa hàng nào. Giữ ở một chỗ thay vì truyền qua mọi lời gọi: cả app chỉ
 * mở đúng một cửa hàng tại một thời điểm, và store/hook gọi repository nằm rải
 * khắp 4 tính năng.
 *
 * StoreGate đặt giá trị này NGAY TRƯỚC khi render app và xoá khi đăng xuất.
 * RLS vẫn là hàng rào thật: đặt sai id cũng không đọc được dữ liệu cửa hàng khác.
 */
let currentStoreId: string | null = null;

export function setCurrentStoreId(storeId: string | null): void {
  currentStoreId = storeId;
}

export function getCurrentStoreId(): string | null {
  return currentStoreId;
}

/**
 * Id cửa hàng cho một thao tác đọc/ghi. Ném lỗi thay vì ghi thiếu `store_id`,
 * vì ghi thiếu sẽ bị Postgres từ chối với thông báo khó hiểu hơn nhiều.
 */
export function requireCurrentStoreId(): string {
  if (!currentStoreId) {
    throw new Error('Chưa xác định cửa hàng đang làm việc. Vui lòng tải lại trang.');
  }
  return currentStoreId;
}
