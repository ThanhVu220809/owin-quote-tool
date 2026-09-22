import { useCallback, useEffect, useRef, useState } from 'react';

/** Đủ lâu để đọc xong một câu ngắn, đủ nhanh để không nằm chắn màn hình. */
const DEFAULT_DURATION_MS = 2000;

/**
 * Lời báo thành công tự biến mất.
 *
 * Trước đây các màn hình tự giữ `useState('')` rồi chỉ đặt mà không bao giờ xoá,
 * nên toast "Đã lưu…" nằm lại trên màn hình cho tới lần thao tác sau. Ít người
 * để ý khi thao tác thưa, nhưng chỗ nào bấm liên tục (bật/tắt hiển thị sản
 * phẩm) thì nó thành một dòng chữ đứng hoài.
 *
 * Hook này XOÁ hẳn state chứ không chỉ ẩn đi. Nhờ vậy đặt lại ĐÚNG câu cũ vẫn
 * hiện ra lần nữa — nếu chỉ ẩn mà giữ state thì React thấy giá trị không đổi,
 * không render lại, và lần bấm thứ hai sẽ im lặng (bấm "Hiện tất cả" hai lần
 * liền là gặp).
 */
export function useTransientMessage(
  durationMs = DEFAULT_DURATION_MS,
): [string, (text: string) => void] {
  const [message, setMessageState] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearTimer = () => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  };

  // Dọn khi rời màn hình: hẹn giờ còn sống sau khi component unmount sẽ gọi
  // setState trên thứ đã biến mất.
  useEffect(() => clearTimer, []);

  const setMessage = useCallback((text: string) => {
    clearTimer();
    setMessageState(text);
    // Chuỗi rỗng là "tắt ngay", các màn hình dùng nó để dọn trước một thao tác
    // mới — không cần hẹn giờ cho việc đó.
    if (!text) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setMessageState('');
    }, durationMs);
  }, [durationMs]);

  return [message, setMessage];
}
