import type { LandingWidgetKey } from "../../../features/home-landing.utils";
import type { JsxEditorProps } from "@mdxeditor/editor";
import { LANDING_WIDGET_KEYS } from "../../../features/home-landing.utils";

export type LandingContentSegment =
  | { type: "markdown"; content: string }
  | { type: "widget"; key: LandingWidgetKey };

export const LANDING_WIDGET_COMPONENTS: Array<{ key: LandingWidgetKey; tag: string }> = [
  { key: "tasks-overview", tag: "LandingWidgetTasksOverview" },
  { key: "tasks-for-you", tag: "LandingWidgetTasksForYou" },
  { key: "your-balance", tag: "LandingWidgetYourBalance" },
  { key: "household-balance", tag: "LandingWidgetHouseholdBalance" },
  { key: "recent-activity", tag: "LandingWidgetRecentActivity" },
  { key: "bucket-short-list", tag: "LandingWidgetBucketShortList" },
  { key: "member-of-month", tag: "LandingWidgetMemberOfMonth" },
  { key: "fairness-score", tag: "LandingWidgetFairnessScore" },
  { key: "reliability-score", tag: "LandingWidgetReliabilityScore" },
  { key: "expenses-by-month", tag: "LandingWidgetExpensesByMonth" },
  { key: "fairness-by-member", tag: "LandingWidgetFairnessByMember" },
  { key: "reliability-by-member", tag: "LandingWidgetReliabilityByMember" },
  { key: "household-calendar", tag: "LandingWidgetHouseholdCalendar" },
  { key: "household-weather-daily", tag: "LandingWidgetHouseholdWeatherDaily" },
  { key: "household-weather-plot", tag: "LandingWidgetHouseholdWeatherPlot" },
  { key: "household-weather", tag: "LandingWidgetHouseholdWeather" },
  { key: "household-whiteboard", tag: "LandingWidgetHouseholdWhiteboard" },
  { key: "household-map", tag: "LandingWidgetHouseholdMap" }
];

export const widgetTokenFromKey = (key: LandingWidgetKey) => `{{widget:${key}}}`;

export const convertLandingTokensToEditorJsx = (markdown: string) => {
  const segments = splitLandingContentSegments(markdown);
  let widgetOrder = 0;
  return segments
    .map((segment) => {
      if (segment.type === "markdown") {
        return segment.content;
      }
      const component = LANDING_WIDGET_COMPONENTS.find((entry) => entry.key === segment.key);
      if (!component) {
        return widgetTokenFromKey(segment.key);
      }
      const jsx = `<${component.tag} domoraWidgetOrder="${widgetOrder}" />`;
      widgetOrder += 1;
      return jsx;
    })
    .join("");
};

export const convertEditorJsxToLandingTokens = (markdown: string) => {
  let next = markdown;
  LANDING_WIDGET_COMPONENTS.forEach(({ key, tag }) => {
    const selfClosingPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?\\s*/>`, "g");
    const wrappedPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>\\s*</${tag}>`, "g");
    next = next.replace(selfClosingPattern, widgetTokenFromKey(key));
    next = next.replace(wrappedPattern, widgetTokenFromKey(key));
  });
  return next;
};

export const splitLandingContentSegments = (markdown: string): LandingContentSegment[] => {
  const segments: LandingContentSegment[] = [];
  const widgetTokenPattern = /\{\{\s*widget:([a-z-]+)\s*\}\}/g;
  let lastIndex = 0;

  for (const match of markdown.matchAll(widgetTokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "markdown", content: markdown.slice(lastIndex, index) });
    }

    const key = match[1];
    if ((LANDING_WIDGET_KEYS as readonly string[]).includes(key)) {
      segments.push({ type: "widget", key: key as LandingWidgetKey });
    } else {
      segments.push({ type: "markdown", content: match[0] });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: "markdown", content: markdown.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "markdown", content: markdown });
  }

  return segments;
};

export const getWidgetOrderFromMdastNode = (mdastNode: JsxEditorProps["mdastNode"]): number | null => {
  const attributes = Array.isArray(mdastNode.attributes) ? mdastNode.attributes : [];
  for (const attribute of attributes) {
    if (!attribute || typeof attribute !== "object") continue;
    const candidate = attribute as { type?: string; name?: string; value?: unknown };
    if (candidate.type !== "mdxJsxAttribute" || candidate.name !== "domoraWidgetOrder") continue;
    if (typeof candidate.value !== "string" && typeof candidate.value !== "number") continue;
    const parsed = Number.parseInt(String(candidate.value), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

export const moveWidgetInMarkdown = (markdown: string, fromWidgetIndex: number, toWidgetIndex: number) => {
  if (fromWidgetIndex === toWidgetIndex) {
    return markdown;
  }

  const segments = splitLandingContentSegments(markdown);
  const widgetSegmentIndexes: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.type === "widget") {
      widgetSegmentIndexes.push(index);
    }
  });

  const fromSegmentIndex = widgetSegmentIndexes[fromWidgetIndex];
  const toSegmentIndex = widgetSegmentIndexes[toWidgetIndex];
  if (fromSegmentIndex === undefined || toSegmentIndex === undefined) {
    return markdown;
  }

  const nextSegments = [...segments];
  const [moved] = nextSegments.splice(fromSegmentIndex, 1);
  if (!moved) {
    return markdown;
  }
  const targetInsertionIndex = toSegmentIndex - (fromSegmentIndex < toSegmentIndex ? 1 : 0);
  nextSegments.splice(targetInsertionIndex, 0, moved);

  return nextSegments
    .map((segment) => (segment.type === "markdown" ? segment.content : widgetTokenFromKey(segment.key)))
    .join("");
};

export const insertTextAroundWidget = (
  markdown: string,
  widgetIndex: number,
  position: "before" | "after",
  placeholder: string
) => {
  const segments = splitLandingContentSegments(markdown);
  const widgetSegmentIndexes: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.type === "widget") {
      widgetSegmentIndexes.push(index);
    }
  });

  const widgetSegmentIndex = widgetSegmentIndexes[widgetIndex];
  if (widgetSegmentIndex === undefined) {
    return markdown;
  }

  const insertAt = position === "before" ? widgetSegmentIndex : widgetSegmentIndex + 1;
  const textContent = `\n\n${placeholder}\n\n`;
  segments.splice(insertAt, 0, { type: "markdown", content: textContent });

  return segments
    .map((segment) => (segment.type === "markdown" ? segment.content : widgetTokenFromKey(segment.key)))
    .join("");
};
