import { useCallback, useMemo, useState } from "react";
import Fuse from "fuse.js";
import type { KeyboardEvent } from "react";
import type { FuseOptions } from "fuse.js";

interface UseSmartSuggestionsOptions<T> {
  items: T[];
  query: string;
  fuseOptions: FuseOptions<T>;
  getLabel: (item: T) => string;
  onApply: (item: T) => void;
  limit?: number;
}

export const useSmartSuggestions = <T>({
  items,
  query,
  fuseOptions,
  getLabel,
  onApply,
  limit = 6
}: UseSmartSuggestionsOptions<T>) => {
  const [focused, setFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1);

  const suggestionIndex = useMemo(() => new Fuse(items, fuseOptions), [fuseOptions, items]);

  const suggestions = useMemo(() => {
    if (items.length === 0) return [];
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return items.slice(0, limit);

    const queryLower = normalizedQuery.toLocaleLowerCase();
    return suggestionIndex
      .search(normalizedQuery, { limit })
      .map((entry) => entry.item)
      .filter((entry) => getLabel(entry).toLocaleLowerCase() !== queryLower);
  }, [getLabel, items, limit, query, suggestionIndex]);

  const resolvedActiveSuggestionIndex =
    suggestions.length === 0
      ? -1
      : activeSuggestionIndex < 0
        ? 0
        : Math.min(activeSuggestionIndex, suggestions.length - 1);

  const applySuggestion = useCallback(
    (suggestion: T) => {
      onApply(suggestion);
      setFocused(false);
      setActiveSuggestionIndex(-1);
    },
    [onApply]
  );

  const onFocus = useCallback(() => {
    setFocused(true);
    setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions.length]);

  const onBlur = useCallback(() => {
    window.setTimeout(() => setFocused(false), 120);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!focused || suggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
        return;
      }

      if (event.key === "Escape") {
        setFocused(false);
        setActiveSuggestionIndex(-1);
        return;
      }

      if (event.key === "Enter" && resolvedActiveSuggestionIndex >= 0) {
        event.preventDefault();
        const selected = suggestions[resolvedActiveSuggestionIndex];
        if (selected) applySuggestion(selected);
      }
    },
    [applySuggestion, focused, resolvedActiveSuggestionIndex, suggestions]
  );

  return {
    suggestions,
    focused,
    activeSuggestionIndex: resolvedActiveSuggestionIndex,
    onFocus,
    onBlur,
    onKeyDown,
    applySuggestion
  };
};
