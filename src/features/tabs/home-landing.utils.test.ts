import {
  canEditLandingByRole,
  getEffectiveLandingMarkdown,
  getLandingWidgetKeysInMarkdown,
  getMissingLandingWidgetKeys,
  getSavedLandingMarkdown,
  shouldResetDraftOnDialogClose
} from "./home-landing.utils";

describe("home landing utils", () => {
  it("returns empty string when saved markdown is nullish", () => {
    expect(getSavedLandingMarkdown(undefined)).toBe("");
    expect(getSavedLandingMarkdown(null)).toBe("");
  });

  it("keeps saved markdown as-is when present", () => {
    expect(getSavedLandingMarkdown("# Hello")).toBe("# Hello");
  });

  it("uses fallback markdown when saved markdown is empty", () => {
    expect(getEffectiveLandingMarkdown("", "# fallback")).toBe("# fallback");
    expect(getEffectiveLandingMarkdown("   ", "# fallback")).toBe("# fallback");
  });

  it("uses saved markdown when it has content", () => {
    expect(getEffectiveLandingMarkdown("# saved", "# fallback")).toBe("# saved");
  });

  it("extracts known widget keys from markdown tokens", () => {
    const keys = getLandingWidgetKeysInMarkdown(`
      Intro
      {{widget:tasks-overview}}
      {{ widget:fairness-score }}
      {{widget:unknown-widget}}
    `);
    expect([...keys]).toEqual(["tasks-overview", "fairness-score"]);
  });

  it("returns missing widget keys", () => {
    expect(getMissingLandingWidgetKeys("{{widget:tasks-overview}}")).toEqual([
      "fairness-score",
      "expenses-by-month",
      "fairness-by-member"
    ]);
  });

  it("allows editing only for owners", () => {
    expect(canEditLandingByRole("owner")).toBe(true);
    expect(canEditLandingByRole("member")).toBe(false);
    expect(canEditLandingByRole(null)).toBe(false);
  });

  it("resets draft on close only when not saving", () => {
    expect(shouldResetDraftOnDialogClose(false, false)).toBe(true);
    expect(shouldResetDraftOnDialogClose(false, true)).toBe(false);
    expect(shouldResetDraftOnDialogClose(true, false)).toBe(false);
  });
});
