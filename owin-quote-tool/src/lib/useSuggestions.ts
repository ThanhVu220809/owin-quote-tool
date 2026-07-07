import { useCallback, useEffect, useState } from 'react';
import { getSuggestionMap, type SuggestionType } from './suggestions';

export function useSuggestions(types: readonly SuggestionType[]) {
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const key = types.join('|');

  const refreshSuggestions = useCallback(async () => {
    setSuggestions(await getSuggestionMap([...types]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void refreshSuggestions();
  }, [refreshSuggestions]);

  return { suggestions, refreshSuggestions };
}
