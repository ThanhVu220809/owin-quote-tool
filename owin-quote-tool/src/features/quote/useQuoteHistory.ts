import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { QuoteRecord } from '@/types/models';
import { getAllQuotes } from '@/features/quote/quoteStore';
import { subscribeToQuotes } from '@/services/supabase/quotesRepo';
import { operationError } from '@/features/quote/quoteFormat';

/**
 * Danh sách báo giá đã lưu: tải lần đầu (retry 2 lần), theo dõi Realtime và
 * nạp lại khi online / focus / tab hiện lại. Trả về cả bộ lọc theo từ khoá + trạng thái.
 */
export function useQuoteHistory(
  quoteSearch: string,
  quoteStatusFilter: QuoteRecord['status'] | '',
) {
  const [history, setHistory] = useState<QuoteRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const historyRequestIdRef = useRef(0);
  const hasLoadedHistoryRef = useRef(false);
  const deferredQuoteSearch = useDeferredValue(quoteSearch);

  const refreshHistory = async (): Promise<boolean> => {
    const requestId = ++historyRequestIdRef.current;
    const quotes = await getAllQuotes();
    if (requestId !== historyRequestIdRef.current) return false;
    const applyHistory = () => {
      setHistory((current) => {
        const unchanged = current.length === quotes.length
          && current.every((quote, index) => {
            const next = quotes[index];
            return quote.id === next.id
              && quote.revision === next.revision
              && quote.updatedAt === next.updatedAt;
          });
        return unchanged ? current : quotes;
      });
    };
    if (hasLoadedHistoryRef.current) startTransition(applyHistory);
    else applyHistory();
    hasLoadedHistoryRef.current = true;
    return true;
  };

  useEffect(() => {
    let active = true;
    const retryTimers = new Set<number>();
    let reloadTimer: number | null = null;
    const reload = (attempt = 0) => {
      // Background refreshes keep the current page interactive instead of
      // replacing it with the full-screen loading state.
      if (attempt === 0 && !hasLoadedHistoryRef.current) setHistoryLoading(true);
      void refreshHistory()
        .then((applied) => {
          if (!active || !applied) return;
          setHistoryError('');
          setHistoryLoading(false);
        })
        .catch((error) => {
          if (!active) return;
          if (attempt < 2 && navigator.onLine) {
            const timer = window.setTimeout(() => {
              retryTimers.delete(timer);
              reload(attempt + 1);
            }, (attempt + 1) * 1_000);
            retryTimers.add(timer);
            return;
          }
          setHistoryLoading(false);
          setHistoryError(operationError('Không thể tải danh sách báo giá từ Supabase', error));
        });
    };
    const scheduleReload = () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        reload(0);
      }, 160);
    };
    const reloadWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleReload();
    };
    reload();
    const unsubscribe = subscribeToQuotes(scheduleReload, (status) => {
      // The first SUBSCRIBED closes the REST/socket race; later ones repair
      // anything missed while Realtime was reconnecting.
      if (status === 'SUBSCRIBED') scheduleReload();
    });
    window.addEventListener('online', scheduleReload);
    window.addEventListener('focus', scheduleReload);
    document.addEventListener('visibilitychange', reloadWhenVisible);
    return () => {
      active = false;
      historyRequestIdRef.current += 1;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      unsubscribe();
      window.removeEventListener('online', scheduleReload);
      window.removeEventListener('focus', scheduleReload);
      document.removeEventListener('visibilitychange', reloadWhenVisible);
    };
  }, []);

  // Build the normalized search text once per fetched record set. Typing only
  // performs includes() checks, while useDeferredValue keeps the input urgent.
  const searchableHistory = useMemo(() => history.map((quote) => ({
    quote,
    text: [
      quote.code,
      quote.customerName,
      quote.customerPhone,
      quote.customerEmail,
      quote.customerAddress,
      quote.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  })), [history]);

  const filteredHistory = useMemo(() => {
    const q = deferredQuoteSearch.trim().toLowerCase();
    const matches: QuoteRecord[] = [];
    for (const { quote, text } of searchableHistory) {
      if (quoteStatusFilter && quote.status !== quoteStatusFilter) continue;
      if (q && !text.includes(q)) continue;
      matches.push(quote);
    }
    return matches;
  }, [deferredQuoteSearch, quoteStatusFilter, searchableHistory]);

  return {
    history,
    filteredHistory,
    historyLoading,
    historyError,
    refreshHistory,
    setHistoryLoading,
    setHistoryError,
  };
}
