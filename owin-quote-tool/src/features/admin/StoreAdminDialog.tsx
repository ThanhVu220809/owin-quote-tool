import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Store, UserRoundX, X } from 'lucide-react';
import { canManageMembers, useCurrentStore } from '@/features/auth/currentStoreContext';
import type { MembershipStatus, StoreRole } from '@/features/auth/storeSession';
import type { StoreMemberRow, StoreRequestRow } from '@/features/admin/storeAdminRepo';
import {
  listStoreMembers,
  listStoreRequests,
  removeMember,
  setMemberRole,
  setMemberStatus,
  setStoreStatus,
} from '@/features/admin/storeAdminRepo';
import './storeAdmin.css';

const statusLabels: Record<MembershipStatus, string> = {
  pending: 'Chờ duyệt',
  active: 'Đang hoạt động',
  disabled: 'Đã khoá',
};

const roleLabels: Record<StoreRole, string> = {
  owner: 'Chủ cửa hàng',
  manager: 'Quản lý',
  staff: 'Nhân viên',
};

/**
 * Trang quản trị: duyệt nhân viên xin vào cửa hàng, và (với Quản trị viên hệ
 * thống) duyệt cửa hàng mới đăng ký.
 *
 * Render qua portal ra <body>: thanh điều hướng có `backdrop-filter` nên nó là
 * containing block của con `position: fixed` — để nguyên tại chỗ thì lớp phủ bị
 * bó lại trong header.
 */
export function StoreAdminDialog({ onClose }: { onClose: () => void }) {
  const { store, role, isPlatformAdmin, reload } = useCurrentStore();
  const manages = canManageMembers(role);

  const [members, setMembers] = useState<StoreMemberRow[]>([]);
  const [storeRequests, setStoreRequests] = useState<StoreRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const [reloadToken, setReloadToken] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  // Hàm tải KHÔNG đụng state — state chỉ đặt trong .then, để effect không gây
  // một vòng render đồng bộ thừa.
  const loadAdminData = useCallback(async () => {
    const [nextMembers, nextStores] = await Promise.all([
      manages ? listStoreMembers(store.id) : Promise.resolve<StoreMemberRow[]>([]),
      isPlatformAdmin ? listStoreRequests() : Promise.resolve<StoreRequestRow[]>([]),
    ]);
    return { nextMembers, nextStores };
  }, [manages, isPlatformAdmin, store.id]);

  useEffect(() => {
    let active = true;
    loadAdminData()
      .then(({ nextMembers, nextStores }) => {
        if (!active) return;
        setMembers(nextMembers);
        setStoreRequests(nextStores);
        setError('');
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không đọc được dữ liệu quản trị.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [loadAdminData, reloadToken]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busyKey) return;
    setBusyKey(key);
    setError('');
    try {
      await action();
      setReloadToken((value) => value + 1);
      // Tự nâng/hạ quyền chính mình thì phải đọc lại quyền của phiên hiện tại.
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác không thành công.');
    } finally {
      setBusyKey('');
    }
  };

  return createPortal(
    <div className="store-admin-backdrop" role="presentation" onClick={onClose}>
      <div
        className="store-admin"
        role="dialog"
        aria-modal="true"
        aria-label="Quản trị cửa hàng"
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="store-admin-header">
          <div>
            <h2>Quản trị cửa hàng</h2>
            <p>{store.name} · mã <code>{store.slug ?? store.id}</code></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </header>

        {error && <p className="store-admin-error" role="alert">{error}</p>}
        {loading && <p className="store-admin-empty">Đang tải…</p>}

        {!loading && manages && (
          <section className="store-admin-section">
            <h3>Thành viên cửa hàng</h3>
            <p className="store-admin-note">
              Đưa mã <code>{store.slug ?? store.id}</code> cho nhân viên để họ gửi yêu cầu xin vào.
            </p>
            {members.length === 0 && <p className="store-admin-empty">Chưa có thành viên nào.</p>}
            <ul className="store-admin-list">
              {members.map((member) => (
                <li key={member.userId} data-status={member.status}>
                  <div className="store-admin-who">
                    <strong>{member.displayName}</strong>
                    <span>{member.email}</span>
                    <span className="store-admin-tag">
                      {roleLabels[member.role]} · {statusLabels[member.status]}
                    </span>
                  </div>
                  <div className="store-admin-buttons">
                    {member.status !== 'active' && (
                      <button
                        type="button"
                        className="store-admin-approve"
                        disabled={busyKey !== ''}
                        onClick={() => run(`m-${member.userId}`, () => setMemberStatus(store.id, member.userId, 'active'))}
                      >
                        <Check size={16} /> Duyệt
                      </button>
                    )}
                    {member.status === 'active' && member.role !== 'owner' && (
                      <button
                        type="button"
                        disabled={busyKey !== ''}
                        onClick={() => run(`m-${member.userId}`, () => setMemberStatus(store.id, member.userId, 'disabled'))}
                      >
                        Khoá
                      </button>
                    )}
                    {member.role !== 'owner' && (
                      <button
                        type="button"
                        disabled={busyKey !== ''}
                        onClick={() => run(`r-${member.userId}`, () => setMemberRole(
                          store.id,
                          member.userId,
                          member.role === 'manager' ? 'staff' : 'manager',
                        ))}
                      >
                        {member.role === 'manager' ? 'Hạ xuống nhân viên' : 'Nâng lên quản lý'}
                      </button>
                    )}
                    {member.status === 'pending' && (
                      <button
                        type="button"
                        className="store-admin-reject"
                        disabled={busyKey !== ''}
                        onClick={() => run(`d-${member.userId}`, () => removeMember(store.id, member.userId))}
                      >
                        <UserRoundX size={16} /> Từ chối
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && isPlatformAdmin && (
          <section className="store-admin-section">
            <h3><Store size={18} /> Cửa hàng chờ duyệt</h3>
            <p className="store-admin-note">
              Duyệt thì chủ cửa hàng dùng được ngay. Từ chối vẫn giữ lại yêu cầu,
              đổi ý lúc nào cũng duyệt lại được.
            </p>
            {storeRequests.length === 0 && <p className="store-admin-empty">Không có cửa hàng nào đang chờ.</p>}
            <ul className="store-admin-list is-compact">
              {storeRequests.map((request) => (
                <li key={request.id} data-status={request.status}>
                  <div className="store-admin-who">
                    <strong>
                      {request.name}
                      <code>{request.slug ?? request.id}</code>
                      {request.status === 'rejected' && <em>Đã từ chối</em>}
                    </strong>
                    <span className="store-admin-tag">{request.ownerName} · {request.ownerEmail}</span>
                  </div>
                  <div className="store-admin-buttons">
                    <button
                      type="button"
                      className="store-admin-approve"
                      disabled={busyKey !== ''}
                      onClick={() => run(`s-${request.id}`, () => setStoreStatus(request.id, 'active'))}
                    >
                      <Check size={16} /> {request.status === 'rejected' ? 'Duyệt lại' : 'Duyệt'}
                    </button>
                    {request.status === 'pending' && (
                      <button
                        type="button"
                        className="store-admin-reject"
                        disabled={busyKey !== ''}
                        onClick={() => run(`sr-${request.id}`, () => setStoreStatus(request.id, 'rejected'))}
                      >
                        <X size={16} /> Từ chối
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && !manages && !isPlatformAdmin && (
          <p className="store-admin-empty">Bạn không có quyền quản trị cửa hàng này.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
