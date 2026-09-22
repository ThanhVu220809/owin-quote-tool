/**
 * Xác định cửa hàng của tài khoản đang đăng nhập.
 *
 * Đăng nhập thành công CHƯA đủ để vào app: tài khoản còn phải là thành viên
 * `active` của ít nhất một cửa hàng. Người vừa đăng nhập Google lần đầu chưa
 * thuộc cửa hàng nào nên phải chờ chủ cửa hàng duyệt.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase/client';
import { setCurrentStoreId } from '@/services/supabase/currentStore';

/** Vai trò TRONG một cửa hàng. Quản trị viên hệ thống là thứ khác hẳn,
 *  nằm ở profiles.is_platform_admin — nên ở đây không có 'admin'. */
export type StoreRole = 'owner' | 'manager' | 'staff';
export type MembershipStatus = 'pending' | 'active' | 'disabled';

export type StoreStatus = 'pending' | 'active' | 'rejected';

export interface StoreSummary {
  id: string;
  name: string;
  slug: string | null;
  status: StoreStatus;
}

export type StoreAccess =
  /** Đang hỏi Supabase. */
  | { status: 'loading' }
  /** Có cửa hàng dùng được. */
  | {
      status: 'ready';
      store: StoreSummary;
      stores: StoreSummary[];
      role: StoreRole;
      /** Duyệt được cửa hàng mới của toàn hệ thống, không chỉ cửa hàng này. */
      isPlatformAdmin: boolean;
    }
  /** Đã được thêm vào cửa hàng nhưng chủ cửa hàng chưa duyệt. */
  | { status: 'pending' }
  /** Đã mở cửa hàng nhưng Quản trị viên hệ thống chưa duyệt cửa hàng đó. */
  | { status: 'store_pending'; store: StoreSummary }
  /** Cửa hàng đã bị từ chối. */
  | { status: 'store_rejected'; store: StoreSummary }
  /** Tài khoản bị khoá ở mọi cửa hàng. */
  | { status: 'disabled' }
  /** Chưa thuộc cửa hàng nào. */
  | { status: 'none' }
  /**
   * Quản trị viên hệ thống không thuộc cửa hàng nào. Công việc của vai trò này
   * là quản lý các cửa hàng, không phải dùng dữ liệu của một cửa hàng cụ thể,
   * nên vẫn phải vào được app — chỉ là vào thẳng màn quản trị.
   */
  | { status: 'platform_admin' }
  | { status: 'error'; message: string };

export interface MembershipRow {
  store_id: string;
  role: StoreRole;
  status: MembershipStatus;
}

/**
 * Quy ra quyền truy cập từ danh sách thành viên và cửa hàng đọc được.
 * Tách riêng khỏi phần gọi mạng để kiểm thử được từng nhánh trạng thái.
 */
export function resolveStoreAccess(
  memberships: readonly MembershipRow[],
  stores: readonly StoreSummary[],
  rememberedStoreId: string | null,
  isPlatformAdmin = false,
): StoreAccess {
  const active = memberships.filter((row) => row.status === 'active');

  if (active.length === 0) {
    if (isPlatformAdmin) return { status: 'platform_admin' };
    if (memberships.some((row) => row.status === 'pending')) return { status: 'pending' };
    if (memberships.some((row) => row.status === 'disabled')) return { status: 'disabled' };
    return { status: 'none' };
  }

  // Cửa hàng bị xoá mềm không đọc được, nên tư cách thành viên còn lại cũng vô nghĩa.
  const mine = stores.filter((store) => active.some((row) => row.store_id === store.id));
  const usable = mine.filter((store) => store.status === 'active');

  if (usable.length === 0) {
    // Người vừa mở cửa hàng đã là 'owner' + 'active' ngay lúc tạo, nhưng cửa
    // hàng thì chưa được duyệt. Không có nhánh này thì họ vào thẳng app và
    // thấy một cửa hàng rỗng không dùng được.
    const waiting = mine.find((store) => store.status === 'pending');
    if (waiting && !isPlatformAdmin) return { status: 'store_pending', store: waiting };

    const rejected = mine.find((store) => store.status === 'rejected');
    if (rejected && !isPlatformAdmin) return { status: 'store_rejected', store: rejected };

    // Quản trị viên hệ thống tự duyệt được cửa hàng của mình từ màn quản trị,
    // nên đưa thẳng họ tới đó thay vì bắt ngồi chờ chính mình.
    if (isPlatformAdmin) return { status: 'platform_admin' };

    return { status: 'none' };
  }

  const store = usable.find((candidate) => candidate.id === rememberedStoreId) ?? usable[0];
  const role = active.find((row) => row.store_id === store.id)?.role ?? 'staff';

  return { status: 'ready', store, stores: usable, role, isPlatformAdmin };
}

const LAST_STORE_KEY = 'owin-current-store';

/** Nhớ cửa hàng đã chọn để lần sau vào đúng chỗ. Hỏng storage thì bỏ qua. */
function readLastStoreId(): string | null {
  try {
    return localStorage.getItem(LAST_STORE_KEY);
  } catch {
    return null;
  }
}

function writeLastStoreId(storeId: string): void {
  try {
    localStorage.setItem(LAST_STORE_KEY, storeId);
  } catch {
    // Cửa sổ ẩn danh hoặc bị chặn storage: không nhớ được cũng không sao.
  }
}

export async function loadStoreAccess(userId: string): Promise<StoreAccess> {
  const [membershipResult, profileResult] = await Promise.all([
    supabase.from('store_members').select('store_id,role,status').eq('user_id', userId),
    supabase.from('profiles').select('is_platform_admin').eq('id', userId).maybeSingle(),
  ]);

  if (membershipResult.error) return { status: 'error', message: membershipResult.error.message };

  const isPlatformAdmin = Boolean(
    (profileResult.data as { is_platform_admin?: boolean } | null)?.is_platform_admin,
  );
  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  const active = memberships.filter((row) => row.status === 'active');
  if (active.length === 0) return resolveStoreAccess(memberships, [], null, isPlatformAdmin);

  const { data: storeRows, error: storeError } = await supabase
    .from('stores')
    .select('id,name,slug,status')
    .in('id', active.map((row) => row.store_id))
    .is('deleted_at', null)
    .order('name');

  if (storeError) return { status: 'error', message: storeError.message };

  return resolveStoreAccess(
    memberships,
    (storeRows ?? []) as StoreSummary[],
    readLastStoreId(),
    isPlatformAdmin,
  );
}

/**
 * Gửi yêu cầu mở cửa hàng mới; Quản trị viên hệ thống sẽ duyệt.
 * Mã cửa hàng do server sinh từ tên, người dùng không phải nghĩ ra.
 */
export async function requestNewStore(name: string): Promise<void> {
  const { error } = await supabase.rpc('request_new_store', { p_name: name });
  if (!error) return;
  const code = error.message;
  if (code.includes('store_name_required')) throw new Error('Chưa nhập tên cửa hàng.');
  if (code.includes('store_request_pending')) throw new Error('Bạn đã có một yêu cầu mở cửa hàng đang chờ duyệt.');
  throw new Error('Không gửi được yêu cầu lúc này. Vui lòng thử lại.');
}

/** Xin vào một cửa hàng đang hoạt động bằng mã cửa hàng. */
export async function requestJoinStore(slug: string): Promise<void> {
  const { error } = await supabase.rpc('request_join_store', { p_slug: slug });
  if (!error) return;
  const code = error.message;
  if (code.includes('store_not_found')) throw new Error('Không tìm thấy cửa hàng với mã này.');
  if (code.includes('store_member_disabled')) throw new Error('Tài khoản của bạn đã bị khoá ở cửa hàng này.');
  throw new Error('Không gửi được yêu cầu lúc này. Vui lòng thử lại.');
}

/**
 * Trạng thái cửa hàng cho một phiên đăng nhập. `reload` dùng sau khi được
 * duyệt để vào app mà không phải đăng xuất rồi đăng nhập lại.
 */
export function useStoreAccess(userId: string): {
  access: StoreAccess;
  reload: () => void;
} {
  const [access, setAccess] = useState<StoreAccess>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setAccess({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setCurrentStoreId(null);

    loadStoreAccess(userId)
      .then((next) => {
        if (!active) return;
        // Đặt store TRƯỚC khi báo ready: repository đọc giá trị này ngay ở
        // lần render đầu của app, muộn một nhịp là ném lỗi thiếu cửa hàng.
        if (next.status === 'ready') {
          setCurrentStoreId(next.store.id);
          writeLastStoreId(next.store.id);
        }
        setAccess(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAccess({
          status: 'error',
          message: error instanceof Error ? error.message : 'Không đọc được thông tin cửa hàng.',
        });
      });

    return () => {
      active = false;
      // Đăng xuất rồi mà id cũ còn nằm lại thì tài khoản kế tiếp có thể ghi
      // nhầm sang cửa hàng của người trước.
      setCurrentStoreId(null);
    };
  }, [userId, attempt]);

  return { access, reload };
}
