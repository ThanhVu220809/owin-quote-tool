/**
 * HELPER PHÂN TÍCH PHẢN HỒI BACKEND — dùng chung cho Apps Script và Drive.
 *
 * Đọc body đúng MỘT lần, rồi báo lỗi rõ ràng thay vì để `JSON.parse: unexpected...`
 * lọt ra UI. Không log token/shared secret (chỉ trả về thông báo tiếng Việt an toàn).
 */
export async function parseApiResponse<T = unknown>(response: Response): Promise<T> {
  // 1. Đọc text đúng một lần (không gọi .json() để tránh raw JSON.parse error).
  const text = await response.text();

  // 2. HTTP không ok → báo status, không parse mù.
  if (!response.ok) {
    throw new Error(`Backend trả về lỗi HTTP ${response.status}.`);
  }

  const trimmed = text.trim();

  // 3. Body rỗng.
  if (trimmed.length === 0) {
    throw new Error('Backend trả về phản hồi rỗng.');
  }

  // 4. HTML thay vì JSON (Apps Script trả trang lỗi/đăng nhập).
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') || /^<(!doctype|html)/i.test(trimmed)) {
    throw new Error('Apps Script trả về HTML thay vì JSON (kiểm tra lại triển khai backend).');
  }

  // 5. JSON hỏng.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error('Phản hồi backend không phải JSON hợp lệ.');
  }
}
