import { useState } from 'react';
import { LogOut, Plus, Store, Users } from 'lucide-react';
import { signOut } from '@/features/auth/authSession';
import { requestJoinStore, requestNewStore } from '@/features/auth/storeSession';
import './storeGate.css';

type Mode = 'choose' | 'create' | 'join';

/**
 * Màn cho người vừa đăng nhập nhưng chưa thuộc cửa hàng nào. Hai lối đi:
 * mở cửa hàng mới (Quản trị viên hệ thống duyệt) hoặc xin vào cửa hàng có sẵn
 * (chủ cửa hàng đó duyệt). Cả hai đều chỉ tạo yêu cầu, không cấp quyền ngay.
 */
export function StoreOnboarding({ email, onSent }: { email: string; onSent: () => void }) {
  const [mode, setMode] = useState<Mode>('choose');
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'create') await requestNewStore(storeName);
      else await requestJoinStore(storeCode);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'choose') {
    return (
      <div className="store-gate">
        <div className="store-gate-card">
          <span className="store-gate-icon" aria-hidden="true"><Store size={26} /></span>
          <h1>Chưa có cửa hàng</h1>
          <div className="store-gate-body">
            <p>Tài khoản <strong>{email}</strong> chưa thuộc cửa hàng nào. Chọn một trong hai:</p>
          </div>
          <div className="store-gate-choices">
            <button type="button" onClick={() => { setMode('create'); setError(''); }}>
              <Plus size={18} />
              <span>
                <strong>Mở cửa hàng mới</strong>
                Bạn là chủ cửa hàng. Quản trị viên sẽ duyệt yêu cầu.
              </span>
            </button>
            <button type="button" onClick={() => { setMode('join'); setError(''); }}>
              <Users size={18} />
              <span>
                <strong>Xin vào cửa hàng có sẵn</strong>
                Bạn là nhân viên. Cần mã cửa hàng và chủ cửa hàng duyệt.
              </span>
            </button>
          </div>
          <div className="store-gate-actions">
            <button type="button" className="store-gate-logout" onClick={() => void signOut()}>
              <LogOut size={17} /> Đăng xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  const creating = mode === 'create';

  return (
    <div className="store-gate">
      <form className="store-gate-card" onSubmit={submit} aria-busy={busy}>
        <span className="store-gate-icon" aria-hidden="true">
          {creating ? <Plus size={26} /> : <Users size={26} />}
        </span>
        <h1>{creating ? 'Mở cửa hàng mới' : 'Xin vào cửa hàng'}</h1>
        <div className="store-gate-body">
          <p>
            {creating
              ? 'Yêu cầu sẽ được gửi tới Quản trị viên hệ thống. Cửa hàng chỉ dùng được sau khi duyệt.'
              : 'Hỏi chủ cửa hàng mã cửa hàng, rồi nhập vào đây. Chủ cửa hàng sẽ duyệt yêu cầu của bạn.'}
          </p>
        </div>

        <div className="store-gate-fields">
          {creating ? (
            <>
              <label htmlFor="store-name">Tên cửa hàng</label>
              <input
                id="store-name"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                disabled={busy}
                required
              />
              <p className="store-gate-hint">
                Mã cửa hàng được tạo tự động từ tên này. Bạn sẽ thấy mã sau khi gửi,
                và đưa nó cho nhân viên để họ xin vào.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="store-code">Mã cửa hàng</label>
              <input
                id="store-code"
                value={storeCode}
                onChange={(event) => setStoreCode(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="Mã do chủ cửa hàng cung cấp"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                required
              />
              <p className="store-gate-hint">Chữ thường, số và dấu gạch ngang.</p>
            </>
          )}
          {error && <p className="store-gate-error" role="alert">{error}</p>}
        </div>

        <div className="store-gate-actions">
          <button
            type="submit"
            className="store-gate-retry"
            disabled={busy || (creating ? !storeName.trim() : !storeCode.trim())}
          >
            {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
          </button>
          <button
            type="button"
            className="store-gate-logout"
            onClick={() => { setMode('choose'); setError(''); }}
            disabled={busy}
          >
            Quay lại
          </button>
        </div>
      </form>
    </div>
  );
}
