import { describe, expect, it } from 'vitest';
import { privateQuoteImageReference } from '@/services/supabase/imagesRepo';
import {
  DEFAULT_LOGO_PATH,
  resolveImageUrl,
  resolveImageUrlSync,
  withBasePath,
} from '@/lib/media/imagePaths';

describe('resolveImageUrlSync', () => {
  it('dựng URL công khai của ảnh sản phẩm ngay, không cần async', () => {
    const url = resolveImageUrlSync('product-images/img/abc123');

    expect(url).toBeTypeOf('string');
    expect(url).toContain('product-images/img/abc123');
  });

  it('giữ nguyên URL tuyệt đối và trả logo khi thiếu đường dẫn', () => {
    expect(resolveImageUrlSync('https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp');
    expect(resolveImageUrlSync('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
    expect(resolveImageUrlSync(null)).toBe(withBasePath(DEFAULT_LOGO_PATH));
    expect(resolveImageUrlSync('  ')).toBe(withBasePath(DEFAULT_LOGO_PATH));
  });

  it('trả null cho ảnh báo giá riêng tư vì nhánh đó buộc phải tải blob', () => {
    const reference = privateQuoteImageReference('quotes/q1/items/i1/cover.webp');

    expect(resolveImageUrlSync(reference)).toBeNull();
  });

  it('resolveImageUrl trả cùng kết quả với bản đồng bộ khi không phải tải blob', async () => {
    for (const path of ['product-images/img/abc123', 'https://cdn.example/a.webp', null]) {
      await expect(resolveImageUrl(path)).resolves.toEqual({
        url: resolveImageUrlSync(path),
        revoke: false,
      });
    }
  });
});
