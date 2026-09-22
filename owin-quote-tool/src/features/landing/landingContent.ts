/**
 * Nội dung trang công khai, do chủ/quản lý cửa hàng tự sửa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HỢP ĐỒNG DÙNG CHUNG VỚI PROJECT `owin-landing`
 * ────────────────────────────────────────────────────────────────────────────
 * Tài liệu này lưu trong `app_documents` dưới khoá dưới đây, và trang công khai
 * đọc đúng nó (`owin-landing/src/lib/siteContent.ts`). Đổi tên trường ở đây mà
 * không đổi bên kia thì trang lặng lẽ rơi về nội dung mặc định — không có lỗi,
 * chỉ là chữ của chủ cửa hàng biến mất.
 *
 * Quy ước: **chuỗi rỗng nghĩa là "dùng mặc định của trang"**, không phải "xoá
 * trắng chỗ đó". Nhờ vậy điền dở dang cũng không làm trang thủng lỗ chỗ.
 *
 * Khoá này cũng nằm trong policy `app_documents_public_read` — sửa tên là phải
 * sửa migration.
 */
export const LANDING_CONTENT_KEY = 'owin_landing_content_v1';

export interface LandingContent {
  version: 1;
  brand: { name: string };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    imageUrl: string;
  };
  contact: {
    phone: string;
    phoneLabel: string;
    zaloUrl: string;
    messengerUrl: string;
    address: string;
    workingHours: string;
  };
}

export function emptyLandingContent(): LandingContent {
  return {
    version: 1,
    brand: { name: '' },
    hero: { eyebrow: '', title: '', description: '', primaryCta: '', secondaryCta: '', imageUrl: '' },
    contact: { phone: '', phoneLabel: '', zaloUrl: '', messengerUrl: '', address: '', workingHours: '' },
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Chỉ nhận đường dẫn http/https.
 *
 * Mấy trường này đi thẳng vào `href` trên TRANG CÔNG KHAI. `javascript:` nhét
 * vào đây là XSS lưu trữ, chạy trên máy của khách chứ không phải của người
 * nhập. Trang công khai cũng lọc lại lần nữa — nó không được tin tài liệu này,
 * vì tài liệu có thể bị sửa bằng đường khác ngoài giao diện này.
 */
export function safeExternalUrl(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}

/**
 * Số điện thoại dùng cho `tel:` — chỉ giữ chữ số và dấu `+` đứng đầu.
 *
 * Lý do giống `safeExternalUrl`: giá trị này ghép vào `href="tel:..."`.
 */
export function safePhoneNumber(value: unknown): string {
  const raw = text(value).replace(/[\s.()-]/g, '');
  const match = /^\+?\d{6,15}$/.exec(raw);
  return match ? raw : '';
}

/** Đọc tài liệu từ database về đúng hình dạng, bỏ mọi thứ lạ. */
export function normalizeLandingContent(input: unknown): LandingContent {
  const source = (input ?? {}) as Partial<LandingContent>;
  const hero = (source.hero ?? {}) as Partial<LandingContent['hero']>;
  const contact = (source.contact ?? {}) as Partial<LandingContent['contact']>;
  const brand = (source.brand ?? {}) as Partial<LandingContent['brand']>;

  return {
    version: 1,
    brand: { name: text(brand.name) },
    hero: {
      eyebrow: text(hero.eyebrow),
      title: text(hero.title),
      description: text(hero.description),
      primaryCta: text(hero.primaryCta),
      secondaryCta: text(hero.secondaryCta),
      imageUrl: safeExternalUrl(hero.imageUrl),
    },
    contact: {
      phone: safePhoneNumber(contact.phone),
      phoneLabel: text(contact.phoneLabel),
      zaloUrl: safeExternalUrl(contact.zaloUrl),
      messengerUrl: safeExternalUrl(contact.messengerUrl),
      address: text(contact.address),
      workingHours: text(contact.workingHours),
    },
  };
}
