/**
 * Chạy song song có giới hạn.
 *
 * Các trình xuất (Word/Excel/PDF) trước đây tải ảnh tuần tự trong vòng lặp:
 * N ảnh = N lượt đi–về mạng nối đuôi nhau, nên bảng giá vài trăm dòng phải chờ
 * rất lâu mới hiện tab tải về. Hàm này giữ nguyên thứ tự kết quả nhưng cho phép
 * `limit` việc chạy cùng lúc — đủ nhanh mà không làm nghẽn kết nối trình duyệt.
 */
/**
 * 32 lượt cùng lúc: Supabase chạy HTTP/2 nên nhiều luồng nhỏ không bị xếp hàng
 * như HTTP/1.1, và bảng giá vài trăm ảnh là bài toán độ trễ chứ không phải một
 * file lớn.
 *
 * Mỗi ảnh xuất nay chỉ còn ~15KB, tức gần như toàn bộ thời gian của một lượt là
 * độ trễ đi–về. 300 ảnh chia 16 luồng là 19 đợt chờ nối đuôi nhau; chia 32 luồng
 * còn một nửa, mà vẫn dưới xa giới hạn luồng song song của trình duyệt.
 */
export const DEFAULT_IMAGE_CONCURRENCY = 32;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const workers = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await task(items[index]!, index);
      }
    }),
  );

  return results;
}
