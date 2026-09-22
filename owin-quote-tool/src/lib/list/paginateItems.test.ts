import { describe, expect, it } from 'vitest';
import { paginateItems } from '@/lib/list/paginateItems';

describe('paginateItems', () => {
  const items = Array.from({ length: 61 }, (_, index) => index + 1);

  it('chỉ trả về 25 phần tử của trang hiện tại theo mặc định UI', () => {
    const result = paginateItems(items, 2, 25);

    expect(result.items).toEqual(items.slice(25, 50));
    expect(result.firstItemNumber).toBe(26);
    expect(result.lastItemNumber).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it('hỗ trợ 50 phần tử mỗi trang và trang cuối ngắn hơn', () => {
    const result = paginateItems(items, 2, 50);

    expect(result.items).toEqual(items.slice(50));
    expect(result.firstItemNumber).toBe(51);
    expect(result.lastItemNumber).toBe(61);
  });

  it('hỗ trợ hiển thị 100 phần tử mỗi trang', () => {
    const result = paginateItems(items, 1, 100);

    expect(result.items).toEqual(items);
    expect(result.totalPages).toBe(1);
  });

  it('đưa số trang vượt phạm vi về trang hợp lệ gần nhất', () => {
    expect(paginateItems(items, 99, 25).page).toBe(3);
    expect(paginateItems(items, 0, 25).page).toBe(1);
  });

  it('trả về trạng thái rỗng ổn định', () => {
    const result = paginateItems([], 4, 25);

    expect(result.items).toEqual([]);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.firstItemNumber).toBe(0);
    expect(result.lastItemNumber).toBe(0);
  });
});
