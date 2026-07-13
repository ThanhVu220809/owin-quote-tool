import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { LOCAL_DATA_CHANGED_EVENT } from '@/lib/dataChangeEvents';
import { isSupabaseConfigured } from './supabaseClient';
import { useSession } from './auth';
import { LoginScreen } from './LoginScreen';
import { pullAll, pushAll } from './supabaseSync';

/**
 * Cổng đăng nhập + đồng bộ Supabase.
 *  - Chưa cấu hình Supabase → render app như cũ (không chặn).
 *  - Chưa đăng nhập → màn login.
 *  - Đã đăng nhập → pull dữ liệu về (1 lần) rồi push mỗi khi có thay đổi local.
 */
export function SupabaseGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const bootstrapped = useRef(false);
  const pushTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!session || bootstrapped.current) return;
    bootstrapped.current = true;
    void pullAll().catch(() => undefined);
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;
    const onChange = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => void pushAll().catch(() => undefined), 2_000);
    };
    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, onChange);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [session]);

  if (!isSupabaseConfigured) return <>{children}</>;
  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} className="muted">Đang tải…</div>;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}
