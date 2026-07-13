import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSuggestionMap, type SuggestionType } from './suggestions';
import { subscribeToSuggestions } from '@/features/supabase/sharedDataRepo';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Không thể tải dữ liệu gợi ý từ Supabase.';
}

export function useSuggestions(types: readonly SuggestionType[]) {
  const key = Array.from(new Set(types.map(String))).join('\u0000');
  const stableTypes = useMemo(
    () => (key ? key.split('\u0000') : []) as SuggestionType[],
    [key],
  );
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const latestRequestRef = useRef(0);

  const refreshSuggestions = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    if (mountedRef.current) {
      setLoading(!hasLoadedRef.current);
      setError(null);
    }

    try {
      const next = await getSuggestionMap(stableTypes);
      if (!mountedRef.current || requestId !== latestRequestRef.current) return;
      hasLoadedRef.current = true;
      setSuggestions(next);
      setLoading(false);
    } catch (nextError) {
      if (!mountedRef.current || requestId !== latestRequestRef.current) return;
      setLoading(false);
      setError(errorMessage(nextError));
    }
  }, [stableTypes]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Ignore a response that arrives after this hook has unmounted.
      latestRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        // refreshSuggestions catches hosted-data failures and exposes them as state.
        void refreshSuggestions();
      }, 80);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    void refreshSuggestions();
    window.addEventListener('online', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    const unsubscribe = subscribeToSuggestions(scheduleRefresh, (status) => {
      if (status === 'SUBSCRIBED') {
        // Close both the initial REST/subscription race and any reconnect gap.
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('online', scheduleRefresh);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      unsubscribe();
    };
  }, [refreshSuggestions]);

  return {
    suggestions,
    loading,
    error,
    refreshSuggestions,
    retry: refreshSuggestions,
  };
}
