/**
 * MIRROR DỮ LIỆU RA GOOGLE SHEET (backup dễ tìm, dễ xem).
 *
 * Không đổi cơ chế sync hiện tại: sau mỗi lần sync thành công, client gửi bản
 * chiếu (columnar, gọn) của products + quotes cho Apps Script backend. Backend
 * (chạy bằng tài khoản xưởng) ghi vào 1 Google Sheet trong Drive của tài khoản đó
 * — nên KHÔNG cần thêm scope Google, KHÔNG cần user đăng nhập lại.
 *
 * Best-effort: mọi lỗi mirror đều nuốt êm, KHÔNG được làm hỏng luồng sync chính.
 */
import type { ProductRecord, QuoteRecord } from '@/types/models';
import { callBackend } from './googleAuth';
import { appMetaStore } from '@/utils/appMeta';

/** Key lưu URL Sheet mirror để Menu nâng cao hiển thị link mở nhanh. */
export const MIRROR_URL_KEY = 'sheetMirrorUrl';
const MIRROR_AT_KEY = 'sheetMirrorAt';
/** Chặn gọi backend quá dày → bảo vệ quota Apps Script. */
const MIN_INTERVAL_MS = 90_000;

/** Cột sản phẩm cho Sheet — chỉ field người xem cần, không kèm ảnh/blob. */
function productRows(products: ProductRecord[]): (string | number)[][] {
  const header = ['Mã', 'Tên sản phẩm', 'Nhóm', 'ĐVT', 'Kích thước', 'Đơn giá (VND)', 'Mô tả'];
  const body = products
    .filter((p) => !p.deletedAt)
    .map((p) => [
      p.code ?? '',
      p.name ?? '',
      p.category ?? '',
      p.unit ?? '',
      p.rawSizeText ?? '',
      Number(p.unitPriceVnd ?? 0),
      p.shortDesc ?? '',
    ]);
  return [header, ...body];
}

/** Cột báo giá cho Sheet — tóm tắt 1 dòng / báo giá. */
function quoteRows(quotes: QuoteRecord[]): (string | number)[][] {
  const header = ['Mã báo giá', 'Khách hàng', 'Điện thoại', 'Ngày', 'Trạng thái', 'Số hạng mục', 'Tổng tiền (VND)'];
  const body = quotes
    .filter((q) => !q.deletedAt)
    .map((q) => [
      q.code ?? '',
      q.customerName ?? '',
      q.customerPhone ?? '',
      (q.quoteDate ?? q.createdAt ?? '').slice(0, 10),
      q.status ?? '',
      (q.items?.length ?? 0),
      Number(q.roundedTotalVnd ?? q.totalVnd ?? 0),
    ]);
  return [header, ...body];
}

/**
 * Đẩy bản chiếu ra Sheet. Trả URL Sheet nếu thành công, null nếu bỏ qua/lỗi.
 * @param force bỏ qua throttle (dùng cho nút "Lưu ra Google Sheet ngay").
 */
export async function mirrorToSheet(
  products: ProductRecord[],
  quotes: QuoteRecord[],
  force = false,
): Promise<string | null> {
  try {
    if (!force) {
      const last = Number((await appMetaStore.getItem<number>(MIRROR_AT_KEY)) ?? 0);
      if (last && Date.now() - last < MIN_INTERVAL_MS) return null;
    }
    const res = await callBackend({
      action: 'mirror',
      products: productRows(products),
      quotes: quoteRows(quotes),
    });
    await appMetaStore.setItem(MIRROR_AT_KEY, Date.now());
    if (res.error) return null;
    if (res.url) {
      await appMetaStore.setItem(MIRROR_URL_KEY, res.url);
      return res.url;
    }
    return null;
  } catch {
    // Best-effort — mirror hỏng không được ảnh hưởng sync/UI.
    return null;
  }
}

/** URL Sheet mirror đã lưu (nếu có) để hiển thị link mở nhanh. */
export async function getMirrorUrl(): Promise<string | null> {
  try {
    return (await appMetaStore.getItem<string>(MIRROR_URL_KEY)) ?? null;
  } catch {
    return null;
  }
}
