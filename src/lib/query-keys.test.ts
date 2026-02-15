import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("builds stable session key", () => {
    expect(queryKeys.session).toEqual(["auth", "session"]);
  });

  it("builds household keys", () => {
    expect(queryKeys.households("u-1")).toEqual(["households", "u-1"]);
    expect(queryKeys.household("h-1")).toEqual(["household", "h-1"]);
    expect(queryKeys.householdTasks("h-1")).toEqual(["household", "h-1", "tasks"]);
  });
});
