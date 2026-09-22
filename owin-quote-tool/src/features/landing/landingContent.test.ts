import { describe, expect, it } from 'vitest';
import {
  normalizeLandingContent,
  safeExternalUrl,
  safePhoneNumber,
} from '@/features/landing/landingContent';

describe('safeExternalUrl', () => {
  it('nhận http và https', () => {
    expect(safeExternalUrl('https://zalo.me/0912345678')).toBe('https://zalo.me/0912345678');
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com');
  });

  it('CHẶN javascript: và các giao thức khác', () => {
    // Trường này đi thẳng vào href trên trang công khai — lọt một cái là XSS
    // lưu trữ, chạy trên máy của khách chứ không phải của người nhập.
    expect(safeExternalUrl('javascript:alert(1)')).toBe('');
    expect(safeExternalUrl('JavaScript:alert(1)')).toBe('');
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeExternalUrl('file:///etc/passwd')).toBe('');
  });

  it('bỏ chuỗi không phải URL', () => {
    expect(safeExternalUrl('zalo.me/0912345678')).toBe('');
    expect(safeExternalUrl('')).toBe('');
    expect(safeExternalUrl(null)).toBe('');
    expect(safeExternalUrl(123)).toBe('');
  });
});

describe('safePhoneNumber', () => {
  it('giữ chữ số, bỏ khoảng trắng và dấu phân cách', () => {
    expect(safePhoneNumber('0912 345 678')).toBe('0912345678');
    expect(safePhoneNumber('(024) 3456-7890')).toBe('02434567890');
    expect(safePhoneNumber('+84912345678')).toBe('+84912345678');
  });

  it('bỏ giá trị không phải số điện thoại', () => {
    // Giá trị này ghép vào href="tel:...".
    expect(safePhoneNumber('javascript:alert(1)')).toBe('');
    expect(safePhoneNumber('12345')).toBe(''); // quá ngắn
    expect(safePhoneNumber('091234567890123456')).toBe(''); // quá dài
    expect(safePhoneNumber('')).toBe('');
  });
});

describe('normalizeLandingContent', () => {
  it('tài liệu rỗng ra hình dạng đầy đủ toàn chuỗi rỗng', () => {
    // Chuỗi rỗng nghĩa là "dùng mặc định của trang", nên điền dở dang cũng
    // không làm trang thủng lỗ chỗ.
    const result = normalizeLandingContent(null);
    expect(result.version).toBe(1);
    expect(result.hero.title).toBe('');
    expect(result.contact.phone).toBe('');
  });

  it('cắt khoảng trắng thừa', () => {
    const result = normalizeLandingContent({ hero: { title: '  Cửa nhôm OWIN  ' } });
    expect(result.hero.title).toBe('Cửa nhôm OWIN');
  });

  it('bỏ trường lạ và giữ đúng hình dạng', () => {
    const result = normalizeLandingContent({ hero: { title: 'A' }, rac: 'x', contact: 'sai kiểu' });
    expect(Object.keys(result).sort()).toEqual(['brand', 'contact', 'hero', 'version']);
    expect(result.contact.address).toBe('');
  });

  it('lọc URL độc ngay khi đọc từ database', () => {
    // Tài liệu có thể bị sửa bằng đường khác ngoài giao diện này, nên đường đọc
    // cũng phải lọc chứ không chỉ đường ghi.
    const result = normalizeLandingContent({
      contact: { zaloUrl: 'javascript:alert(1)', messengerUrl: 'https://m.me/owin' },
    });
    expect(result.contact.zaloUrl).toBe('');
    expect(result.contact.messengerUrl).toBe('https://m.me/owin');
  });
});
