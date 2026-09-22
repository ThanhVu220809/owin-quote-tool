import { describe, expect, it } from 'vitest';
import {
  isProductFeatured,
  isProductPublic,
  nextFeaturedState,
  nextPublicState,
} from '@/features/products/productVisibility';

describe('isProductPublic', () => {
  it('coi sản phẩm thiếu cờ là ĐANG công khai', () => {
    // Cột quan hệ mặc định `true`. Nếu hàm này trả `false` ở đây thì admin báo
    // "đang ẩn" cho toàn bộ sản phẩm cũ trong khi web công khai vẫn hiện chúng.
    expect(isProductPublic({ isPublic: undefined as unknown as boolean })).toBe(true);
  });

  it('chỉ đúng `false` mới là ẩn', () => {
    expect(isProductPublic({ isPublic: false })).toBe(false);
    expect(isProductPublic({ isPublic: true })).toBe(true);
  });
});

describe('nextPublicState', () => {
  it('đảo trạng thái đang hiển thị', () => {
    expect(nextPublicState({ isPublic: true })).toBe(false);
    expect(nextPublicState({ isPublic: false })).toBe(true);
  });

  it('sản phẩm thiếu cờ thì lần bấm đầu tiên là ẩn đi', () => {
    // Đây là thao tác chủ cửa hàng cần nhất lúc này: 333 sản phẩm đang công
    // khai sẵn, bấm lần đầu phải ẩn được, không phải bật lại cái đã bật.
    expect(nextPublicState({ isPublic: undefined as unknown as boolean })).toBe(false);
  });
});

describe('isProductFeatured', () => {
  it('mặc định là KHÔNG nổi bật', () => {
    // Ngược hẳn với isPublic: nổi bật là chọn ra vài món, không phải trạng
    // thái mà cả 333 sản phẩm rơi vào.
    expect(isProductFeatured({ isFeatured: undefined as unknown as boolean })).toBe(false);
    expect(isProductFeatured({ isFeatured: false })).toBe(false);
  });

  it('chỉ đúng `true` mới là nổi bật', () => {
    expect(isProductFeatured({ isFeatured: true })).toBe(true);
  });
});

describe('nextFeaturedState', () => {
  it('đảo trạng thái, và sản phẩm chưa có cờ thì lần bấm đầu là bật', () => {
    expect(nextFeaturedState({ isFeatured: true })).toBe(false);
    expect(nextFeaturedState({ isFeatured: false })).toBe(true);
    expect(nextFeaturedState({ isFeatured: undefined as unknown as boolean })).toBe(true);
  });
});
