import type { ReactNode } from 'react';
import { isSupabaseConfigured } from './supabaseClient';
import { SupabaseSessionProvider, useSession } from './auth';
import { LoginScreen } from './LoginScreen';

/**
 * Cổng đăng nhập. Sau khi mở gate, các repository đọc/ghi Supabase trực tiếp.
 */
export function SupabaseGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" role="alert">Ứng dụng chưa được cấu hình kết nối dữ liệu. Vui lòng liên hệ quản trị viên.</div>
      </div>
    );
  }
  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} className="muted">Đang tải…</div>;
  if (!session) return <LoginScreen />;
  return <SupabaseSessionProvider session={session}>{children}</SupabaseSessionProvider>;
}
