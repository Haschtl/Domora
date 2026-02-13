import { canEditLandingByRole, getSavedLandingMarkdown, shouldResetDraftOnDialogClose } from "./home-landing.utils";

describe("home landing utils", () => {
  it("returns empty string when saved markdown is nullish", () => {
    expect(getSavedLandingMarkdown(undefined)).toBe("");
    expect(getSavedLandingMarkdown(null)).toBe("");
  });

  it("keeps saved markdown as-is when present", () => {
    expect(getSavedLandingMarkdown("# Hello")).toBe("# Hello");
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
