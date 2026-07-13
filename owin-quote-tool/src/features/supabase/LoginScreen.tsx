import { useState } from 'react';
import { signInWithPassword } from './auth';

/** Màn đăng nhập admin. Đăng nhập 1 lần, phiên tự nhớ. */
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form className="card" onSubmit={submit} style={{ width: 'min(380px, 92vw)', display: 'grid', gap: 14, padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <img src={`${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`} alt="OWIN" style={{ height: 44 }} />
          <h1 style={{ fontSize: 18, margin: '10px 0 2px' }}>OWIN · Công cụ báo giá</h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Đăng nhập để tiếp tục</p>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>Email</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>Mật khẩu</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div style={{ color: 'var(--ios-red, #d00)', fontSize: 13 }}>{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}
