export const getSavedLandingMarkdown = (markdown: string | null | undefined) => markdown ?? "";

export const LANDING_WIDGET_KEYS = [
  "tasks-overview",
  "tasks-for-you",
  "your-balance",
  "household-balance",
  "recent-activity",
  "bucket-short-list",
  "fairness-score",
  "reliability-score",
  "expenses-by-month",
  "fairness-by-member",
  "reliability-by-member"
] as const;

export type LandingWidgetKey = (typeof LANDING_WIDGET_KEYS)[number];

const LANDING_WIDGET_KEY_SET = new Set<string>(LANDING_WIDGET_KEYS);
const LANDING_WIDGET_TOKEN_PATTERN = /\{\{\s*widget:([a-z-]+)\s*\}\}/g;

export const getEffectiveLandingMarkdown = (savedMarkdown: string, fallbackMarkdown: string) =>
  savedMarkdown.trim().length > 0 ? savedMarkdown : fallbackMarkdown;

export const getLandingWidgetKeysInMarkdown = (markdown: string): Set<LandingWidgetKey> => {
  const keys = new Set<LandingWidgetKey>();
  for (const match of markdown.matchAll(LANDING_WIDGET_TOKEN_PATTERN)) {
    const key = match[1];
    if (LANDING_WIDGET_KEY_SET.has(key)) {
      keys.add(key as LandingWidgetKey);
    }
  }
  return keys;
};

export const getMissingLandingWidgetKeys = (markdown: string): LandingWidgetKey[] => {
  const present = getLandingWidgetKeysInMarkdown(markdown);
  return LANDING_WIDGET_KEYS.filter((key) => !present.has(key));
};

export const canEditLandingByRole = (role: "owner" | "member" | null | undefined) => role === "owner";

export const shouldResetDraftOnDialogClose = (open: boolean, isSaving: boolean) => !open && !isSaving;
