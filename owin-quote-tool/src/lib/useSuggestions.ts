import { useCallback, useEffect, useState } from 'react';
import { getSuggestionMap, type SuggestionType } from './suggestions';
import { subscribeToSuggestions } from '@/features/supabase/sharedDataRepo';

export function useSuggestions(types: readonly SuggestionType[]) {
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const key = types.join('|');

  const refreshSuggestions = useCallback(async () => {
    setSuggestions(await getSuggestionMap([...types]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void getSuggestionMap([...types]).then((next) => {
          if (active) setSuggestions(next);
        });
      }, 80);
    };
    refresh();
    const unsubscribe = subscribeToSuggestions(refresh);
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
    // Types are represented by the stable joined key to avoid caller array identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSuggestions]);

  return { suggestions, refreshSuggestions };
}
