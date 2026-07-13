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

import { getValidatedGoogleClientId } from './googleClientId';
import { parseApiResponse } from './apiResponse';
import { isOAuthConfigured } from './publicConfig';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.trim() ?? '';
const SHARED_SECRET = import.meta.env.VITE_SHARED_SECRET?.trim() ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

let accessToken: string | null = null;
let tokenExpiryMs = 0;

/**
 * OAuth đã cấu hình chưa. Backend/shared value là cấu hình đồng bộ riêng và không
 * được dùng để ẩn nút OAuth.
 */
export function isConfigured(): boolean {
  return isOAuthConfigured();
}

interface BackendResponse {
  access_token?: string | null;
  expires_in?: number | null;
  error?: string | null;
  need_relogin?: boolean;
}

interface GooglePopupError {
  type?: 'popup_failed_to_open' | 'popup_closed' | 'unknown' | string;
}

function popupErrorMessage(error: GooglePopupError): string {
  if (error.type === 'popup_failed_to_open') {
    return 'Không mở được cửa sổ Google. Hãy cho phép popup rồi thử lại.';
  }
  if (error.type === 'popup_closed') {
    return 'Đã đóng cửa sổ chọn tài khoản Google.';
  }
  return 'Không thể mở cửa sổ xác thực Google. Vui lòng thử lại.';
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
  return parseApiResponse<BackendResponse>(res);
}

/**
 * LẦN ĐẦU: thợ bấm "Kết nối Google". initCodeClient popup mode,
 * access_type offline + prompt consent để Google CHỊU cấp refresh_token lần đầu.
 */
export function connectGoogle(): Promise<string> {
  return new Promise((resolve, reject) => {
    let clientId: string;
    try {
      clientId = getValidatedGoogleClientId();
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Cấu hình Google Client ID không hợp lệ.'));
      return;
    }
    const g = (window as unknown as { google?: GoogleAccounts }).google;
    if (!g?.accounts?.oauth2) {
      reject(new Error('Chưa nạp Google Identity Services (GIS)'));
      return;
    }
    const codeClient = g.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: SCOPE,
      ux_mode: 'popup',
      access_type: 'offline',
      prompt: 'consent',
      callback: async (response: { code?: string; error?: string }) => {
        if (response.error || !response.code) {
          reject(new Error('Người dùng huỷ hoặc lỗi cấp quyền'));
          return;
        }
        try {
          const data = await callBackend({ action: 'exchange', code: response.code });
          if (data.error || !data.access_token) {
            reject(new Error('Backend đổi token thất bại: ' + (data.error || 'unknown')));
            return;
          }
          accessToken = data.access_token;
          tokenExpiryMs = Date.now() + ((data.expires_in ?? 0) - 60) * 1000;
          resolve(accessToken);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Không kết nối được backend Google.'));
        }
      },
      error_callback: (error: GooglePopupError) => reject(new Error(popupErrorMessage(error))),
    });
    codeClient.requestCode();
  });
}

/**
 * Token 1 lần cho tài khoản Google KHÁC. Không qua backend, không lấy refresh_token.
 * Dùng cho thao tác thủ công: đẩy/lấy kho sang appDataFolder của tài khoản được chọn.
 */
export function requestOneTimeGoogleToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    let clientId: string;
    try {
      clientId = getValidatedGoogleClientId();
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Cấu hình Google Client ID không hợp lệ.'));
      return;
    }

    const g = (window as unknown as { google?: GoogleAccounts }).google;
    if (!g?.accounts?.oauth2?.initTokenClient) {
      reject(new Error('Chưa nạp Google Identity Services (GIS)'));
      return;
    }

    const tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt: 'select_account consent',
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.error || !response.access_token) {
          reject(new Error('Người dùng huỷ hoặc lỗi cấp quyền'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error: GooglePopupError) => reject(new Error(popupErrorMessage(error))),
    });
    tokenClient.requestAccessToken({ prompt: 'select_account consent' });
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
        error_callback?: (error: GooglePopupError) => void;
      }) => { requestCode: () => void };
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        prompt: string;
        callback: (response: { access_token?: string; error?: string }) => void;
        error_callback?: (error: GooglePopupError) => void;
      }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
    };
  };
}
