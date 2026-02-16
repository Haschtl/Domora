import { addMinutesToIso, formatDateOnly, formatDateTime, formatShortDay, isDueNow } from "./date";

describe("date utils", () => {
  it("returns fallback for invalid input", () => {
    expect(formatDateOnly("invalid", "de", "fallback")).toBe("fallback");
    expect(formatDateTime("invalid", "en", "fallback")).toBe("fallback");
    expect(formatShortDay("invalid", "de", "fallback")).toBe("fallback");
  });

  it("adds minutes to iso values", () => {
    const result = addMinutesToIso("2026-01-01T12:00:00.000Z", 30);
    expect(result?.toISOString()).toBe("2026-01-01T12:30:00.000Z");
  });

  it("detects due tasks compared to now", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    expect(isDueNow(past)).toBe(true);
    expect(isDueNow(future)).toBe(false);
    expect(isDueNow(past, -5)).toBe(true);
  });
});
