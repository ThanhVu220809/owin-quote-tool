import { describe, expect, it } from 'vitest';
import { normalizeLoginIdentifier } from '@/features/auth/authIdentifier';

describe('normalizeLoginIdentifier', () => {
  it('chuẩn hóa email trước khi gửi tới Supabase Auth', () => {
    expect(normalizeLoginIdentifier('  ThanhVu@Gmail.COM ')).toBe('thanhvu@gmail.com');
  });

  it('không đổi thứ người dùng gõ thành một email ghi cứng nào', () => {
    expect(normalizeLoginIdentifier('admin')).toBe('admin');
    expect(normalizeLoginIdentifier('hoanganhowin')).toBe('hoanganhowin');
  });
});
