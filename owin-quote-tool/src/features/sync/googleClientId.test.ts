import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGoogleClientId,
  isValidGoogleClientId,
  normalizeGoogleClientId,
} from './googleClientId';

const VALID = '123456789-abcDEF_gh.apps.googleusercontent.com';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeGoogleClientId', () => {
  it('giữ nguyên giá trị hợp lệ đã trim', () => {
    expect(normalizeGoogleClientId(VALID)).toBe(VALID);
  });

  it('trim newline/khoảng trắng ở cuối', () => {
    expect(normalizeGoogleClientId(`  ${VALID}\n`)).toBe(VALID);
  });

  it('bỏ cặp quote kép bao ngoài', () => {
    expect(normalizeGoogleClientId(`"${VALID}"`)).toBe(VALID);
  });

  it('bỏ cặp nháy đơn bao ngoài', () => {
    expect(normalizeGoogleClientId(`'${VALID}'`)).toBe(VALID);
  });

  it('trả chuỗi rỗng cho null/undefined', () => {
    expect(normalizeGoogleClientId(undefined)).toBe('');
    expect(normalizeGoogleClientId(null)).toBe('');
  });
});

describe('isValidGoogleClientId', () => {
  it('nhận đúng dạng client id web', () => {
    expect(isValidGoogleClientId(VALID)).toBe(true);
  });

  it('từ chối dạng sai (test-client-id, thiếu hậu tố, còn quote)', () => {
    expect(isValidGoogleClientId('test-client-id')).toBe(false);
    expect(isValidGoogleClientId('123-abc.apps.googleusercontent')).toBe(false);
    expect(isValidGoogleClientId(`"${VALID}"`)).toBe(false);
  });
});

describe('getGoogleClientId', () => {
  it('chỉ lấy từ import.meta.env, đã chuẩn hoá', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', `"${VALID}"\n`);
    expect(getGoogleClientId()).toBe(VALID);
  });

  it('KHÔNG dùng config legacy trong localStorage', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', VALID);
    const legacy = 'legacy-999.apps.googleusercontent.com';
    const store: Record<string, string> = { googleClientId: legacy, clientId: legacy };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
    } as unknown as Storage);
    expect(getGoogleClientId()).toBe(VALID);
  });
});
