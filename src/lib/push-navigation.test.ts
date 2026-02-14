import { describe, expect, it } from "vitest";
import { getForegroundPushRoute } from "./push-navigation";

describe("getForegroundPushRoute", () => {
  it("routes task completions to task history", () => {
    expect(getForegroundPushRoute({ type: "task_completed", taskId: "t1" })).toBe("/tasks/history");
    expect(getForegroundPushRoute({ type: "task_skipped", taskId: "t1" })).toBe("/tasks/history");
  });

  it("routes due/taken tasks to task overview", () => {
    expect(getForegroundPushRoute({ type: "task_due", taskId: "t1" })).toBe("/tasks/overview");
    expect(getForegroundPushRoute({ type: "task_taken_over", taskId: "t1" })).toBe("/tasks/overview");
  });

  it("routes shopping updates", () => {
    expect(getForegroundPushRoute({ type: "shopping_added", shoppingItemId: "s1" })).toBe("/shopping/list");
    expect(getForegroundPushRoute({ type: "shopping_completed", shoppingItemId: "s1" })).toBe("/shopping/history");
  });

  it("routes finance + cash audit", () => {
    expect(getForegroundPushRoute({ type: "finance_created", financeEntryId: "f1" })).toBe("/finances/overview");
    expect(getForegroundPushRoute({ type: "cash_audit_requested" })).toBe("/finances/overview");
  });

  it("routes bucket updates and fallback", () => {
    expect(getForegroundPushRoute({ type: "bucket_added", bucketItemId: "b1" })).toBe("/home/bucket");
    expect(getForegroundPushRoute({})).toBe("/home/summary");
  });
});
