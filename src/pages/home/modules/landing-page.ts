import type { LandingWidgetKey } from "../../../features/home-landing.utils";

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
