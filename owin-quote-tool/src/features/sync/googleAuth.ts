/**
 * FRONT-END QUẢN LÝ TOKEN — Owin Quote Tool (port từ googleAuth.js đã cung cấp sang TS).
 *
 * Luồng: GIS lấy auth code → gửi backend Apps Script → nhận access_token (RAM).
 * Mọi lời gọi Drive phải đi qua ensureToken() để chắc token còn sống.
 *
 * BR-7: refresh_token + client_secret nằm ở backend (Apps Script). Client chỉ giữ
 *       access_token trong RAM, refresh ngầm qua backend.
 *
 * Cấu hình lấy từ biến môi trường Vite (KHÔNG hardcode/commit — xem .env.example):
 *   VITE_GOOGLE_CLIENT_ID, VITE_BACKEND_URL, VITE_SHARED_SECRET
 *
 * Phụ thuộc: nạp GIS trong index.html:
 *   <script src="https://accounts.google.com/gsi/client" async defer></script>
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';
const SHARED_SECRET = import.meta.env.VITE_SHARED_SECRET ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

let accessToken: string | null = null;
let tokenExpiryMs = 0;

/** Đã cấu hình đủ env chưa (để UI biết có nên hiện nút Kết nối không). */
export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && BACKEND_URL && SHARED_SECRET);
}

interface BackendResponse {
  access_token?: string | null;
  expires_in?: number | null;
  error?: string | null;
  need_relogin?: boolean;
}

/**
 * Gọi backend với Content-Type text/plain để NÉ CORS preflight của Apps Script
 * (mẹo bắt buộc — JSON content-type sẽ bị preflight chặn). VERIFY: xác nhận lại
 * khi deploy thật rằng Apps Script vẫn nhận được body text/plain.
 */
async function callBackend(payload: Record<string, unknown>): Promise<BackendResponse> {
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, shared_secret: SHARED_SECRET }),
  });
  return res.json();
}

/**
 * LẦN ĐẦU: thợ bấm "Kết nối Google". initCodeClient popup mode,
 * access_type offline + prompt consent để Google CHỊU cấp refresh_token lần đầu.
 */
export function connectGoogle(): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as unknown as { google?: GoogleAccounts }).google;
    if (!g?.accounts?.oauth2) {
      reject(new Error('Chưa nạp Google Identity Services (GIS)'));
      return;
    }
    const codeClient = g.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ux_mode: 'popup',
      access_type: 'offline',
      prompt: 'consent',
      callback: async (response: { code?: string; error?: string }) => {
        if (response.error || !response.code) {
          reject(new Error('Người dùng huỷ hoặc lỗi cấp quyền'));
          return;
        }
        const data = await callBackend({ action: 'exchange', code: response.code });
        if (data.error || !data.access_token) {
          reject(new Error('Backend đổi token thất bại: ' + (data.error || 'unknown')));
          return;
        }
        accessToken = data.access_token;
        tokenExpiryMs = Date.now() + ((data.expires_in ?? 0) - 60) * 1000;
        resolve(accessToken);
      },
    });
    codeClient.requestCode();
  });
}

/**
 * GỌI TRƯỚC MỌI THAO TÁC SYNC. Trả access_token còn sống, hoặc ném lỗi cần đăng nhập lại.
 * Token còn hạn → dùng luôn; hết hạn → backend refresh ngầm; refresh hỏng → NEED_RELOGIN.
 */
export async function ensureToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiryMs) return accessToken;
  const data = await callBackend({ action: 'refresh' });
  if (data.need_relogin) {
    accessToken = null;
    throw new Error('NEED_RELOGIN');
  }
  if (data.error || !data.access_token) {
    throw new Error('Refresh token thất bại: ' + (data.error || 'unknown'));
  }
  accessToken = data.access_token;
  tokenExpiryMs = Date.now() + ((data.expires_in ?? 0) - 60) * 1000;
  return accessToken;
}

/** Có đang giữ access_token còn hạn không (cho UI hiện trạng thái). */
export function hasLiveToken(): boolean {
  return Boolean(accessToken && Date.now() < tokenExpiryMs);
}

/** Quên token trong RAM (đăng xuất phía client; backend vẫn giữ refresh_token). */
export function forgetToken(): void {
  accessToken = null;
  tokenExpiryMs = 0;
}

/* ── Kiểu tối giản cho GIS global ── */
interface GoogleAccounts {
  accounts?: {
    oauth2?: {
      initCodeClient: (config: {
        client_id: string;
        scope: string;
        ux_mode: string;
        access_type: string;
        prompt: string;
        callback: (response: { code?: string; error?: string }) => void;
      }) => { requestCode: () => void };
    };
  };
}
