/**
 * DỌN CẤU HÌNH OAUTH CŨ — chỉ xoá các KEY CẤU HÌNH OAuth legacy có thể còn sót trong
 * storage của thiết bị. Client ID/backend runtime nay chỉ lấy từ import.meta.env
 * ([[googleClientId]]) nên các key này không được dùng làm nguồn config nữa.
 *
 * TUYỆT ĐỐI KHÔNG đụng dữ liệu: products, quotes, suggestions, aluminum, images,
 * hay sync metadata dữ liệu. Chỉ xoá đúng danh sách key cấu hình dưới đây.
 */
import { appMetaStore } from '@/utils/appMeta';
import localforage from 'localforage';

const LEGACY_OAUTH_KEYS = ['googleClientId', 'clientId', 'oauthClient', 'googleConfig', 'authConfig'] as const;

const syncMetaStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'sync-meta',
  driver: localforage.INDEXEDDB,
});

function purgeFromWebStorage(storage: Storage | undefined): void {
  if (!storage) return;
  for (const key of LEGACY_OAUTH_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      /* Bỏ qua storage bị chặn/không truy cập được — không được ném lỗi lúc khởi động. */
    }
  }
}

/** Gọi một lần lúc khởi động app. Bất đồng bộ, không chặn UI, không bao giờ ném lỗi. */
export async function purgeLegacyOAuthConfig(): Promise<void> {
  if (typeof window !== 'undefined') {
    purgeFromWebStorage(window.localStorage);
    purgeFromWebStorage(window.sessionStorage);
  }
  await Promise.all(
    LEGACY_OAUTH_KEYS.flatMap((key) => [
      appMetaStore.removeItem(key).catch(() => undefined),
      syncMetaStore.removeItem(key).catch(() => undefined),
    ]),
  );
}
