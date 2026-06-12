/**
 * FRONT-END QUẢN LÝ TOKEN — Owin Quote Tool
 * Luồng: GIS lấy auth code -> gửi backend Apps Script -> nhận access_token.
 * Mọi lời gọi Drive API phải đi qua ensureToken() để chắc chắn token còn sống.
 *
 * Phụ thuộc: nạp script GIS trong index.html:
 *   <script src="https://accounts.google.com/gsi/client" async defer></script>
 */

const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // public, OK để lộ
const BACKEND_URL = 'https://script.google.com/macros/s/XXXX/exec'; // URL Apps Script /exec
const SHARED_SECRET = 'CHUOI_NGAU_NHIEN_TRUNG_VOI_BACKEND'; // phải khớp Script Property
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// Token sống trong RAM thôi (không lưu refresh_token ở client — backend giữ).
let accessToken = null;
let tokenExpiryMs = 0; // mốc thời gian (ms) token hết hạn

/**
 * Gọi backend với Content-Type text/plain để NÉ CORS preflight của Apps Script.
 * (Đây là mẹo bắt buộc — JSON content-type sẽ bị preflight chặn.)
 */
async function callBackend(payload) {
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, shared_secret: SHARED_SECRET }),
  });
  return res.json();
}

/**
 * LẦN ĐẦU: thợ bấm nút "Kết nối Google".
 * initCodeClient ở popup mode, access_type offline + prompt consent
 * để Google CHỊU cấp refresh_token cho lần đổi đầu tiên.
 */
function connectGoogle() {
  return new Promise((resolve, reject) => {
    const codeClient = google.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ux_mode: 'popup',
      access_type: 'offline', // ép cấp refresh_token
      prompt: 'consent',      // lần đầu cần để chắc chắn có refresh_token
      callback: async (response) => {
        if (response.error || !response.code) {
          reject(new Error('Người dùng huỷ hoặc lỗi cấp quyền'));
          return;
        }
        // Gửi auth code sang backend đổi lấy token (backend giữ refresh_token).
        const data = await callBackend({ action: 'exchange', code: response.code });
        if (data.error || !data.access_token) {
          reject(new Error('Backend đổi token thất bại: ' + (data.error || 'unknown')));
          return;
        }
        accessToken = data.access_token;
        tokenExpiryMs = Date.now() + (data.expires_in - 60) * 1000; // trừ 60s an toàn
        resolve(accessToken);
      },
    });
    codeClient.requestCode();
  });
}

/**
 * GỌI TRƯỚC MỌI THAO TÁC SYNC. Trả access_token còn sống, hoặc ném lỗi cần đăng nhập lại.
 * - Token còn hạn -> dùng luôn.
 * - Hết hạn -> nhờ backend refresh ngầm (không popup).
 * - Refresh hỏng (refresh_token chết) -> báo cần bấm Kết nối Google lại.
 */
async function ensureToken() {
  if (accessToken && Date.now() < tokenExpiryMs) {
    return accessToken;
  }
  const data = await callBackend({ action: 'refresh' });
  if (data.need_relogin) {
    accessToken = null;
    throw new Error('NEED_RELOGIN'); // UI bắt lỗi này -> hiện nút "Kết nối Google"
  }
  if (data.error || !data.access_token) {
    throw new Error('Refresh token thất bại: ' + (data.error || 'unknown'));
  }
  accessToken = data.access_token;
  tokenExpiryMs = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

/** Ví dụ gọi Drive appdata sau khi đã có token chắc chắn sống. */
async function listAppDataFiles() {
  const token = await ensureToken();
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  return res.json();
}

export { connectGoogle, ensureToken, listAppDataFiles };
