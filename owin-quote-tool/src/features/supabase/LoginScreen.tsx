import { useState } from 'react';
import { signInWithPassword } from './auth';

/** Màn đăng nhập admin. Đăng nhập 1 lần, phiên tự nhớ. */
export function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithPassword(identifier, password);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể đăng nhập lúc này. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src={`${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`} alt="OWIN" />
          <h1>OWIN · Công cụ báo giá</h1>
          <p className="muted">Đăng nhập để tiếp tục</p>
        </div>
        <label className="field">
          <span>Tên đăng nhập hoặc email</span>
          <input
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Nhập tên đăng nhập hoặc email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
