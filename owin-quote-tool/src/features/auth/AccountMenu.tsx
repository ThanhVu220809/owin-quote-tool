import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { signOut, useAuthenticatedSession } from '@/features/auth/authSession';
import { flushPendingWork } from '@/lib/browser/pendingWork';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { canManageMembers, useCurrentStore } from '@/features/auth/currentStoreContext';
import { StoreAdminDialog } from '@/features/admin/StoreAdminDialog';
import { LandingContentDialog } from '@/features/landing/LandingContentDialog';
import './accountMenu.css';

export function AccountMenu() {
  const { session } = useAuthenticatedSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [landingOpen, setLandingOpen] = useState(false);
  const [error, setError] = useState('');
  const { store, role, isPlatformAdmin } = useCurrentStore();
  const canAdminister = canManageMembers(role) || isPlatformAdmin;
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
  const accountName = email.split('@')[0] || 'Tài khoản';

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
          <p className="account-menu-store">{store.name}</p>
          {error && <p className="account-menu-error" role="alert">{error}</p>}
          <button
            type="button"
            className="btn btn-ghost account-menu-action"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Settings size={15} /> Cài đặt
          </button>
          {canAdminister && (
            <button
              type="button"
              className="btn btn-ghost account-menu-action"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setAdminOpen(true);
              }}
            >
              <ShieldCheck size={15} /> Quản trị cửa hàng
            </button>
          )}
          {canManageMembers(role) && (
            <button
              type="button"
              className="btn btn-ghost account-menu-action"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setLandingOpen(true);
              }}
            >
              <Globe size={15} /> Nội dung trang web
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost account-menu-action account-menu-logout"
            role="menuitem"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={15} /> {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {adminOpen && <StoreAdminDialog onClose={() => setAdminOpen(false)} />}
      {landingOpen && <LandingContentDialog onClose={() => setLandingOpen(false)} />}
    </div>
  );
}
