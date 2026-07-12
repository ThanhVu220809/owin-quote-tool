import { describe, expect, it } from 'vitest';
import { parseApiResponse } from './apiResponse';

function makeResponse(body: string, init?: { ok?: boolean; status?: number; contentType?: string }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    headers: new Headers({ 'content-type': init?.contentType ?? 'application/json' }),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('parseApiResponse', () => {
  it('phân tích JSON hợp lệ', async () => {
    await expect(parseApiResponse(makeResponse('{"access_token":"x"}'))).resolves.toEqual({
      access_token: 'x',
    });
  });

  it('báo rõ khi backend trả HTML thay vì JSON', async () => {
    const res = makeResponse('<!DOCTYPE html><html><body>login</body></html>', { contentType: 'text/html' });
    await expect(parseApiResponse(res)).rejects.toThrow('Apps Script trả về HTML thay vì JSON');
  });

  it('báo rõ khi body rỗng', async () => {
    await expect(parseApiResponse(makeResponse('   '))).rejects.toThrow('Backend trả về phản hồi rỗng.');
  });

  it('báo rõ khi JSON hỏng, không lộ raw JSON.parse', async () => {
    await expect(parseApiResponse(makeResponse('{not json'))).rejects.toThrow(
      'Phản hồi backend không phải JSON hợp lệ.',
    );
  });

  it('báo status khi HTTP không ok', async () => {
    const res = makeResponse('{"error":"x"}', { ok: false, status: 500 });
    await expect(parseApiResponse(res)).rejects.toThrow('Backend trả về lỗi HTTP 500.');
  });

  it('nhận HTML ngay cả khi content-type không khai báo', async () => {
    const res = makeResponse('<html><head></head></html>', { contentType: '' });
    await expect(parseApiResponse(res)).rejects.toThrow('Apps Script trả về HTML thay vì JSON');
  });
});
