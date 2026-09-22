import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/services/supabase/client';
import { SupabaseSessionProvider, useSession } from '@/features/auth/authSession';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { StoreGate } from '@/features/auth/StoreGate';

/**
 * Cổng đăng nhập. Thứ tự: cấu hình → phiên → đặt lại mật khẩu → cửa hàng.
 * Sau khi mở hết các cổng, các repository đọc/ghi Supabase trực tiếp theo
 * cửa hàng mà StoreGate đã chọn.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading, passwordRecovery } = useSession();
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" role="alert">Ứng dụng chưa được cấu hình kết nối dữ liệu. Vui lòng liên hệ quản trị viên.</div>
      </div>
    );
  }
  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} className="muted">Đang tải…</div>;
  if (!session) return <LoginScreen />;
  if (passwordRecovery) return <ResetPasswordScreen />;
  return (
    <SupabaseSessionProvider session={session}>
      <StoreGate session={session}>{children}</StoreGate>
    </SupabaseSessionProvider>
  );
}
