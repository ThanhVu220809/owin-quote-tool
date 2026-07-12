import { afterEach, describe, expect, it, vi } from 'vitest';

interface TokenClientConfig {
  callback: (response: { access_token?: string; error?: string }) => void;
  error_callback?: (error: { type?: string }) => void;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, 'window');
});

async function setupTokenClient(onRequest: (config: TokenClientConfig) => void) {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '123456789-abcdef.apps.googleusercontent.com');
  let config: TokenClientConfig | null = null;
  const requestAccessToken = vi.fn(() => {
    if (!config) throw new Error('Token client chưa khởi tạo');
    onRequest(config);
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (nextConfig: TokenClientConfig) => {
              config = nextConfig;
              return { requestAccessToken };
            },
          },
        },
      },
    },
  });

  return import('./googleAuth');
}

describe('requestOneTimeGoogleToken', () => {
  it('thoát trạng thái chờ khi người dùng đóng popup', async () => {
    const auth = await setupTokenClient((config) => config.error_callback?.({ type: 'popup_closed' }));

    await expect(auth.requestOneTimeGoogleToken()).rejects.toThrow(
      'Đã đóng cửa sổ chọn tài khoản Google.',
    );
  });

  it('báo rõ khi trình duyệt chặn popup', async () => {
    const auth = await setupTokenClient((config) =>
      config.error_callback?.({ type: 'popup_failed_to_open' }),
    );

    await expect(auth.requestOneTimeGoogleToken()).rejects.toThrow(
      'Không mở được cửa sổ Google. Hãy cho phép popup rồi thử lại.',
    );
  });
});

describe('ensureToken', () => {
  it('tự lấy access token mới từ backend và dùng lại trong RAM, không mở popup', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '123456789-abcdef.apps.googleusercontent.com');
    vi.stubEnv('VITE_BACKEND_URL', 'https://backend.example.test');
    vi.stubEnv('VITE_SHARED_SECRET', 'test-secret');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ access_token: 'restored-token', expires_in: 3600 })),
    });
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./googleAuth');

    await expect(auth.ensureToken()).resolves.toBe('restored-token');
    await expect(auth.ensureToken()).resolves.toBe('restored-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
