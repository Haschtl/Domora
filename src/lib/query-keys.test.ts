import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("builds stable session key", () => {
    expect(queryKeys.session).toEqual(["auth", "session"]);
  });

  it("builds household and workspace keys", () => {
    expect(queryKeys.households("u-1")).toEqual(["households", "u-1"]);
    expect(queryKeys.workspace("h-1")).toEqual(["workspace", "h-1"]);
  });
});
