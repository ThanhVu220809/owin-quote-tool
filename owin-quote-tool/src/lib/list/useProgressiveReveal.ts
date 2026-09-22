import { useEffect, useMemo, useState } from 'react';

/**
 * Trải danh sách dài ra làm nhiều khung hình thay vì dựng hết trong một lần.
 *
 * Dựng 400 dòng cùng lúc là một tác vụ dài vài trăm ms — trình duyệt không kịp
 * vẽ, người dùng thấy khựng. Hook trả về phần đầu danh sách rồi nới dần theo
 * từng khung hình, nên mỗi lần commit chỉ tốn một phần nhỏ thời gian.
 *
 * Đã trải hết một lần rồi thì thôi không thu lại: lọc / sắp xếp sau đó vẫn
 * dựng trọn danh sách, tránh việc danh sách co lại làm nhảy vị trí cuộn.
 */
export function useProgressiveReveal<T>(items: T[], chunkSize = 40): T[] {
  const [state, setState] = useState(() => ({
    items,
    count: Math.min(items.length, chunkSize),
  }));

  // Đổi danh sách: kẹp lại theo độ dài mới, giữ nguyên mức đã trải được.
  if (state.items !== items) {
    setState({ items, count: Math.min(Math.max(state.count, chunkSize), items.length) });
  }

  const { count } = state;
  const complete = count >= items.length;

  useEffect(() => {
    if (complete) return;

    const grow = () => {
      setState((current) => ({
        items: current.items,
        count: Math.min(current.items.length, current.count + chunkSize),
      }));
    };
    // rAF canh đúng nhịp vẽ, nhưng tab ở nền thì rAF không chạy — hẹn thêm một
    // timer để danh sách vẫn trải xong khi người dùng đang ở tab khác.
    const frame = requestAnimationFrame(grow);
    const timer = setTimeout(grow, 200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [chunkSize, complete, count]);

  return useMemo(() => (complete ? items : items.slice(0, count)), [complete, count, items]);
}
