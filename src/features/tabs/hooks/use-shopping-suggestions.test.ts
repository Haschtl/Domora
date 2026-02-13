import { getHouseholdItemSuggestions } from "../../../lib/household-items";
import type { ShoppingItemCompletion } from "../../../lib/types";
import { buildShoppingSuggestions } from "./use-shopping-suggestions";

const completion = (partial: Partial<ShoppingItemCompletion>): ShoppingItemCompletion => ({
  id: partial.id ?? "c-1",
  shopping_item_id: partial.shopping_item_id ?? "s-1",
  household_id: partial.household_id ?? "h-1",
  title_snapshot: partial.title_snapshot ?? "Milch",
  tags_snapshot: partial.tags_snapshot ?? [],
  completed_by: partial.completed_by ?? "u-1",
  completed_at: partial.completed_at ?? "2026-02-13T12:00:00.000Z"
});

describe("buildShoppingSuggestions", () => {
  it("ranks history suggestions by usage count and title", () => {
    const suggestions = buildShoppingSuggestions(
      [
        completion({ id: "1", title_snapshot: "Zucker" }),
        completion({ id: "2", title_snapshot: "Apfel" }),
        completion({ id: "3", title_snapshot: "Apfel" }),
        completion({ id: "4", title_snapshot: "Zucker" })
      ],
      "de"
    );

    const apfel = suggestions.find((entry) => entry.title === "Apfel");
    const zucker = suggestions.find((entry) => entry.title === "Zucker");
    expect(apfel?.count).toBe(2);
    expect(zucker?.count).toBe(2);
    expect(suggestions.findIndex((entry) => entry.title === "Apfel")).toBeLessThan(
      suggestions.findIndex((entry) => entry.title === "Zucker")
    );
  });

  it("prefers history over library for same normalized title", () => {
    const libraryTitle = getHouseholdItemSuggestions("de")[0]?.title ?? "Milch";
    const suggestions = buildShoppingSuggestions(
      [
        completion({ id: "1", title_snapshot: libraryTitle }),
        completion({ id: "2", title_snapshot: libraryTitle })
      ],
      "de"
    );

    const sameTitle = suggestions.filter((entry) => entry.title.toLocaleLowerCase() === libraryTitle.toLocaleLowerCase());
    expect(sameTitle).toHaveLength(1);
    expect(sameTitle[0]?.source).toBe("history");
    expect(sameTitle[0]?.count).toBe(2);
  });
});
