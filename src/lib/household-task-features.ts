import type { HouseholdTaskMode } from "./types";

export const areOneOffTasksSupported = (taskMode: HouseholdTaskMode) =>
  taskMode === "rotation";

export const normalizeTaskFeatureFlags = ({
  taskMode,
  featureTasksEnabled,
  featureOneOffTasksEnabled
}: {
  taskMode: HouseholdTaskMode;
  featureTasksEnabled: boolean;
  featureOneOffTasksEnabled: boolean;
}) => ({
  featureTasksEnabled,
  featureOneOffTasksEnabled:
    featureTasksEnabled &&
    areOneOffTasksSupported(taskMode) &&
    featureOneOffTasksEnabled
});
