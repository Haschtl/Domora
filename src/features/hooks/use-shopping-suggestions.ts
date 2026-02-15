import { useMemo } from "react";
import { getHouseholdItemSuggestions } from "../../lib/household-items";
import type { ShoppingItemCompletion } from "../../lib/types";

export interface ShoppingSuggestion {
  key: string;
  title: string;
  count: number;
  tags: string[];
  source: "history" | "library";
}

export const buildShoppingSuggestions = (completions: ShoppingItemCompletion[], language: string): ShoppingSuggestion[] => {
  const purchaseHistory = (() => {
    const byTitle = new Map<
      string,
      {
        title: string;
        count: number;
        tags: Map<string, number>;
      }
    >();

    completions.forEach((entry) => {
      const title = entry.title_snapshot.trim();
      if (!title) return;
      const key = title.toLocaleLowerCase();

      const current = byTitle.get(key) ?? {
        title,
        count: 0,
        tags: new Map<string, number>()
      };

      current.count += 1;
      entry.tags_snapshot.forEach((tag) => {
        const normalizedTag = tag.trim().toLocaleLowerCase();
        if (!normalizedTag) return;
        current.tags.set(normalizedTag, (current.tags.get(normalizedTag) ?? 0) + 1);
      });

      byTitle.set(key, current);
    });

    return [...byTitle.values()]
      .map((entry) => ({
        key: `history:${entry.title.toLocaleLowerCase()}`,
        title: entry.title,
        count: entry.count,
        source: "history" as const,
        tags: [...entry.tags.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tag]) => tag)
          .slice(0, 3)
      }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  })();

  const householdLibrarySuggestions = getHouseholdItemSuggestions(language).map((entry) => ({
    key: `library:${entry.key}`,
    title: entry.title,
    count: 0,
    source: "library" as const,
    tags: entry.tags
  }));

  const map = new Map<string, ShoppingSuggestion>();

  purchaseHistory.forEach((entry) => {
    map.set(entry.title.toLocaleLowerCase(), entry);
  });

  householdLibrarySuggestions.forEach((entry) => {
    const key = entry.title.toLocaleLowerCase();
    if (!map.has(key)) map.set(key, entry);
  });

  return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
};

export const useShoppingSuggestions = (completions: ShoppingItemCompletion[], language: string) =>
  useMemo(() => buildShoppingSuggestions(completions, language), [completions, language]);
