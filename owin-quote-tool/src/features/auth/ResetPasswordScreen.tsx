import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import { signOut, updatePassword } from '@/features/auth/authSession';
import './storeGate.css';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Màn hiện ra khi người dùng mở link đặt lại mật khẩu trong email.
 * Link đó đã tạo một phiên hợp lệ, nên phải đổi mật khẩu xong mới vào app —
 * nếu không, chính cái link cũ trong hộp thư vẫn mở được tài khoản.
 */
export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const submittable = password.length >= MIN_PASSWORD_LENGTH && password === confirm && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!submittable) return;
    setBusy(true);
    setError('');
    try {
      await updatePassword(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu lúc này.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="store-gate">
      <form className="store-gate-card" onSubmit={submit} aria-busy={busy}>
        <span className="store-gate-icon" aria-hidden="true"><KeyRound size={26} /></span>
        <h1>Đặt mật khẩu mới</h1>
        <div className="store-gate-body">
          <p>Nhập mật khẩu mới cho tài khoản của bạn, tối thiểu {MIN_PASSWORD_LENGTH} ký tự.</p>
        </div>

        <div className="store-gate-fields">
          <label htmlFor="reset-password">Mật khẩu mới</label>
          <div className="store-gate-password">
            <input
              id="reset-password"
              name="new-password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              required
            />
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={visible}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <label htmlFor="reset-confirm">Nhập lại mật khẩu</label>
          <input
            id="reset-confirm"
            name="confirm-password"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={busy}
            required
          />

          {tooShort && <p className="store-gate-hint">Mật khẩu cần ít nhất {MIN_PASSWORD_LENGTH} ký tự.</p>}
          {mismatch && <p className="store-gate-hint">Hai lần nhập chưa khớp nhau.</p>}
          {error && <p className="store-gate-error" role="alert">{error}</p>}
        </div>

        <div className="store-gate-actions">
          <button type="submit" className="store-gate-retry" disabled={!submittable}>
            {busy ? 'Đang lưu…' : 'Lưu mật khẩu'}
            {busy && <LoaderCircle className="store-gate-spinner" size={17} />}
          </button>
          <button type="button" className="store-gate-logout" onClick={() => void signOut()} disabled={busy}>
            Huỷ
          </button>
        </div>
      </form>
    </div>
  );
}
