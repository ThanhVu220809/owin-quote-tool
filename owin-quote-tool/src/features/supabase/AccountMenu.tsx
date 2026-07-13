import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { signOut, useAuthenticatedSession } from './auth';
import { OWIN_LOGIN_EMAIL, OWIN_LOGIN_USERNAME } from './authIdentifier';
import { flushPendingWork } from '@/lib/pendingWork';

export function AccountMenu() {
  const { session } = useAuthenticatedSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const email = session?.user.email ?? '';
  const accountName = email.toLowerCase() === OWIN_LOGIN_EMAIL
    ? OWIN_LOGIN_USERNAME
    : email.split('@')[0] || 'Tài khoản';

  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      // Uploads and debounced Supabase writes must finish while the current
      // authenticated session is still available.
      await flushPendingWork();
      await signOut();
    } catch (logoutError) {
      setError(logoutError instanceof Error
        ? logoutError.message
        : 'Không thể đăng xuất lúc này. Vui lòng thử lại.');
      setBusy(false);
    }
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setError('');
          setOpen((current) => !current);
        }}
      >
        <span className="account-menu-avatar" aria-hidden="true"><UserRound size={16} /></span>
        <span className="account-menu-identity">
          <strong>{accountName}</strong>
          <small>{email}</small>
        </span>
        <ChevronDown className={open ? 'is-open' : ''} size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className="account-menu-popover" role="menu" aria-label="Tài khoản">
          <div className="account-menu-details">
            <span className="account-menu-avatar" aria-hidden="true"><UserRound size={17} /></span>
            <span>
              <strong>{accountName}</strong>
              <small>{email}</small>
            </span>
          </div>
          {error && <p className="account-menu-error" role="alert">{error}</p>}
          <button
            type="button"
            className="btn btn-ghost account-menu-logout"
            role="menuitem"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={15} /> {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      )}
    </div>
  );
}
