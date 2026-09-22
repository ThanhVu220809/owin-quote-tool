/**
 * Auth admin qua Supabase. Đăng nhập 1 lần, phiên tự lưu (persistSession).
 */
import { createContext, createElement, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase/client';
import { normalizeLoginIdentifier } from '@/features/auth/authIdentifier';

// Ô "Ghi nhớ đăng nhập" quyết định phiên nằm ở localStorage hay sessionStorage,
// nên nó thuộc về lớp client; tái xuất ở đây để màn đăng nhập chỉ cần một import.
export { getRememberSignIn, setRememberSignIn } from '@/services/supabase/client';

export interface SessionState {
  session: Session | null;
  loading: boolean;
  /** Người dùng vừa mở link đặt lại mật khẩu, phải nhập mật khẩu mới trước khi vào app. */
  passwordRecovery?: boolean;
}

/** Nơi Supabase trả người dùng về sau khi bấm link Google/Facebook/đặt lại mật khẩu. */
function appRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/**
 * Link khôi phục gắn `type=recovery` vào URL trả về. Phải đọc trực tiếp từ URL
 * chứ không chỉ dựa vào sự kiện PASSWORD_RECOVERY: supabase-js xử lý URL ngay
 * khi import, có thể xong trước lúc React kịp đăng ký listener.
 */
function urlHasRecoveryMarker(): boolean {
  if (typeof window === 'undefined') return false;
  const { hash, search } = window.location;
  if (new URLSearchParams(search).get('type') === 'recovery') return true;
  return new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery';
}

const SupabaseSessionContext = createContext<SessionState | null>(null);

export function SupabaseSessionProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return createElement(
    SupabaseSessionContext.Provider,
    { value: { session, loading: false } },
    children,
  );
}

export function useAuthenticatedSession(): SessionState {
  const value = useContext(SupabaseSessionContext);
  if (!value) throw new Error('SupabaseSessionProvider is missing.');
  return value;
}

function safeSignInError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Không thể đăng nhập lúc này. Vui lòng thử lại.';

  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const status = 'status' in error && typeof error.status === 'number' ? error.status : 0;
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : '';

  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) {
    return 'Bạn đã thử quá nhiều lần. Vui lòng chờ một chút rồi đăng nhập lại.';
  }
  if (code === 'email_not_confirmed') {
    return 'Tài khoản chưa được kích hoạt. Vui lòng liên hệ quản trị viên.';
  }
  if (code === 'invalid_credentials' || status === 400 || status === 401) {
    return 'Tên đăng nhập hoặc mật khẩu không đúng.';
  }
  if (message.includes('fetch') || message.includes('network')) {
    return 'Không thể kết nối. Vui lòng kiểm tra mạng rồi thử lại.';
  }
  return 'Không thể đăng nhập lúc này. Vui lòng thử lại.';
}

export async function signInWithPassword(identifier: string, password: string): Promise<void> {
  const email = normalizeLoginIdentifier(identifier);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (error) {
    throw new Error(safeSignInError(error), { cause: error });
  }
}

export type OAuthProviderId = 'google' | 'facebook';

const providerLabels: Record<OAuthProviderId, string> = {
  google: 'Google',
  facebook: 'Facebook',
};

/**
 * Chuyển sang trang đăng nhập của Google/Facebook. Không trả về khi thành công
 * vì trình duyệt rời khỏi trang; phiên được nhận lại qua onAuthStateChange.
 */
export async function signInWithOAuth(provider: OAuthProviderId): Promise<void> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: appRedirectUrl() },
    });
    if (error) throw error;
  } catch (error) {
    throw new Error(
      `Không thể đăng nhập bằng ${providerLabels[provider]} lúc này. Vui lòng thử lại.`,
      { cause: error },
    );
  }
}

/**
 * Gửi mã xác nhận đặt lại mật khẩu tới email của tài khoản.
 *
 * KHÔNG tiết lộ email có tồn tại hay không: email lạ cũng trả về bình thường,
 * để người ngoài không dò được danh sách tài khoản. Trả về email đã chuẩn hoá
 * vì bước nhập mã cần đúng địa chỉ đó để đối chiếu.
 */
export async function sendPasswordResetOtp(identifier: string): Promise<string> {
  const email = normalizeLoginIdentifier(identifier);
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appRedirectUrl(),
    });
    if (error) throw error;
  } catch (error) {
    const message = safeSignInError(error);
    // Sai mật khẩu không phải lỗi của luồng này; chỉ giữ lại lỗi mạng/quá tải.
    if (message.includes('quá nhiều lần') || message.includes('kết nối')) {
      throw new Error(message, { cause: error });
    }
  }
  return email;
}

export const PASSWORD_RESET_OTP_LENGTH = 6;

/**
 * Đổi mật khẩu bằng mã gửi qua email. Mã đúng mới mở được phiên, nên đây là
 * bằng chứng người đổi thực sự đọc được hộp thư của tài khoản.
 */
export async function resetPasswordWithOtp(
  email: string,
  token: string,
  newPassword: string,
): Promise<void> {
  try {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) throw error;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'otp_expired') {
      throw new Error('Mã đã hết hạn. Bấm gửi lại để nhận mã mới.', { cause: error });
    }
    throw new Error('Mã xác nhận không đúng. Vui lòng kiểm tra lại email.', { cause: error });
  }
  await updatePassword(newPassword);
}

/** Đặt mật khẩu mới cho phiên đang mở từ link khôi phục. */
export async function updatePassword(password: string): Promise<void> {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'weak_password' || code === 'same_password') {
      throw new Error(
        'Mật khẩu mới quá yếu hoặc trùng mật khẩu cũ. Vui lòng chọn mật khẩu khác.',
        { cause: error },
      );
    }
    throw new Error('Không thể đổi mật khẩu lúc này. Vui lòng thử lại.', { cause: error });
  }
}

export async function signOut(): Promise<void> {
  try {
    // Chỉ đăng xuất trình duyệt hiện tại; không đá các máy OWIN khác đang làm việc.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch {
    throw new Error('Không thể đăng xuất lúc này. Vui lòng thử lại.');
  }
}

/** Hook trạng thái đăng nhập; `loading` cho lần khôi phục phiên đầu tiên. */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(urlHasRecoveryMarker);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      // Link khôi phục mở ra một phiên hợp lệ. Không cho vào thẳng app: bắt
      // đặt mật khẩu mới trước, nếu không link cũ trong hộp thư vẫn mở được app.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') setPasswordRecovery(false);
      setSession(next);
      setLoading(false);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { session, loading, passwordRecovery };
}
