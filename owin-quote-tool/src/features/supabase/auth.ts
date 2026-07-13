/**
 * Auth admin qua Supabase. Đăng nhập 1 lần, phiên tự lưu (persistSession).
 */
import { createContext, createElement, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { normalizeLoginIdentifier } from './authIdentifier';

export interface SessionState {
  session: Session | null;
  loading: boolean;
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { session, loading };
}
