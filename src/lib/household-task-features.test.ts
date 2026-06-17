import {
  areOneOffTasksSupported,
  normalizeTaskFeatureFlags
} from "./household-task-features";

describe("household task feature normalization", () => {
  it("keeps one-off tasks enabled only for rotation mode with tasks enabled", () => {
    expect(
      normalizeTaskFeatureFlags({
        taskMode: "rotation",
        featureTasksEnabled: true,
        featureOneOffTasksEnabled: true
      })
    ).toEqual({
      featureTasksEnabled: true,
      featureOneOffTasksEnabled: true
    });

    expect(
      normalizeTaskFeatureFlags({
        taskMode: "time",
        featureTasksEnabled: true,
        featureOneOffTasksEnabled: true
      })
    ).toEqual({
      featureTasksEnabled: true,
      featureOneOffTasksEnabled: false
    });

    expect(
      normalizeTaskFeatureFlags({
        taskMode: "rotation",
        featureTasksEnabled: false,
        featureOneOffTasksEnabled: true
      })
    ).toEqual({
      featureTasksEnabled: false,
      featureOneOffTasksEnabled: false
    });
  });

  it("reports one-off support only for rotation mode", () => {
    expect(areOneOffTasksSupported("rotation")).toBe(true);
    expect(areOneOffTasksSupported("time")).toBe(false);
  });
});
