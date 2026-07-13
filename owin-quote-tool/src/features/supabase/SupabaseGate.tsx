import type { ReactNode } from 'react';
import { isSupabaseConfigured } from './supabaseClient';
import { useSession } from './auth';
import { LoginScreen } from './LoginScreen';

/**
 * Cổng đăng nhập. Sau khi mở gate, các repository đọc/ghi Supabase trực tiếp.
 */
export function SupabaseGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" role="alert">Thiếu cấu hình Supabase. Kiểm tra biến môi trường của bản deploy.</div>
      </div>
    );
  }
  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} className="muted">Đang tải…</div>;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}
