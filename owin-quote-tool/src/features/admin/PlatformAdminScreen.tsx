import { useCallback, useEffect, useState } from 'react';
import { Check, LogOut, RefreshCw, Store, Users, X } from 'lucide-react';
import { signOut } from '@/features/auth/authSession';
import type { ActiveStoreRow, StoreRequestRow } from '@/features/admin/storeAdminRepo';
import {
  listActiveStores,
  listStoreRequests,
  setStoreStatus,
} from '@/features/admin/storeAdminRepo';
import './storeAdmin.css';

/**
 * Màn chính của Quản trị viên hệ thống.
 *
 * Vai trò này quản lý các cửa hàng chứ không dùng dữ liệu của cửa hàng nào, nên
 * họ không cần — và thường không có — tư cách thành viên ở đâu cả. Bắt họ phải
 * thuộc một cửa hàng mới vào được app là chặn nhầm người.
 */
export function PlatformAdminScreen({ email }: { email: string }) {
  const [requests, setRequests] = useState<StoreRequestRow[]>([]);
  const [stores, setStores] = useState<ActiveStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    const [nextRequests, nextStores] = await Promise.all([
      listStoreRequests(),
      listActiveStores(),
    ]);
    return { nextRequests, nextStores };
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .then(({ nextRequests, nextStores }) => {
        if (!active) return;
        setRequests(nextRequests);
        setStores(nextStores);
        setError('');
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không đọc được danh sách cửa hàng.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [load, reloadToken]);

  const decide = async (storeId: string, status: 'active' | 'rejected') => {
    if (busyKey) return;
    setBusyKey(storeId);
    setError('');
    try {
      await setStoreStatus(storeId, status);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác không thành công.');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="platform-admin">
      <header className="platform-admin-bar">
        <div>
          <h1>Quản trị hệ thống</h1>
          <p>{email}</p>
        </div>
        <div className="platform-admin-bar-actions">
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw size={16} /> Tải lại
          </button>
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </header>

      <main className="platform-admin-body">
        {error && <p className="store-admin-error" role="alert">{error}</p>}
        {loading && <p className="store-admin-empty">Đang tải…</p>}

        {!loading && (
          <>
            <section className="store-admin-section">
              <h3><Store size={18} /> Cửa hàng chờ duyệt</h3>
              <p className="store-admin-note">
                Duyệt thì chủ cửa hàng dùng được ngay. Từ chối vẫn giữ lại yêu cầu,
                đổi ý lúc nào cũng duyệt lại được.
              </p>
              {requests.length === 0 && (
                <p className="store-admin-empty">Không có cửa hàng nào đang chờ.</p>
              )}
              <ul className="store-admin-list is-compact">
                {requests.map((request) => (
                  <li key={request.id} data-status={request.status}>
                    <div className="store-admin-who">
                      <strong>
                        {request.name}
                        <code>{request.slug ?? request.id}</code>
                        {request.status === 'rejected' && <em>Đã từ chối</em>}
                      </strong>
                      <span className="store-admin-tag">
                        {request.ownerName} · {request.ownerEmail}
                      </span>
                    </div>
                    <div className="store-admin-buttons">
                      <button
                        type="button"
                        className="store-admin-approve"
                        disabled={busyKey !== ''}
                        onClick={() => decide(request.id, 'active')}
                      >
                        <Check size={16} /> {request.status === 'rejected' ? 'Duyệt lại' : 'Duyệt'}
                      </button>
                      {request.status === 'pending' && (
                        <button
                          type="button"
                          className="store-admin-reject"
                          disabled={busyKey !== ''}
                          onClick={() => decide(request.id, 'rejected')}
                        >
                          <X size={16} /> Từ chối
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="store-admin-section">
              <h3><Users size={18} /> Cửa hàng đang hoạt động</h3>
              {stores.length === 0 && (
                <p className="store-admin-empty">Chưa có cửa hàng nào hoạt động.</p>
              )}
              <ul className="store-admin-list is-compact">
                {stores.map((store) => (
                  <li key={store.id}>
                    <div className="store-admin-who">
                      <strong>
                        {store.name}
                        <code>{store.slug ?? store.id}</code>
                      </strong>
                      <span className="store-admin-tag">
                        Chủ: {store.ownerName} · {store.memberCount} thành viên
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
