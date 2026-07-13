import { describe, expect, it } from 'vitest';
import {
  normalizeLoginIdentifier,
  OWIN_LOGIN_EMAIL,
} from './authIdentifier';

describe('normalizeLoginIdentifier', () => {
  it('đổi tên đăng nhập OWIN thành email tài khoản', () => {
    expect(normalizeLoginIdentifier('hoanganhowin')).toBe(OWIN_LOGIN_EMAIL);
    expect(normalizeLoginIdentifier('  HoangAnHoWin  ')).toBe(OWIN_LOGIN_EMAIL);
  });

  it('chuẩn hóa email trước khi gửi tới Supabase Auth', () => {
    expect(normalizeLoginIdentifier('  HOANGANHOWIN@GMAIL.COM ')).toBe(OWIN_LOGIN_EMAIL);
  });
});
