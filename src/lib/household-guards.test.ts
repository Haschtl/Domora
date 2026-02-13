import {
  assertCanDemoteOwner,
  assertCanDissolveHousehold,
  assertCanLeaveAsOwner,
  assertCanLeaveWithBalance,
  assertCanRemoveOwner,
  DISSOLVE_LAST_MEMBER_ONLY_ERROR,
  DISSOLVE_OWNER_ONLY_ERROR,
  LAST_OWNER_CANNOT_LEAVE_ERROR,
  LAST_OWNER_CANNOT_BE_REMOVED_ERROR,
  LEAVE_BALANCE_NOT_ZERO_ERROR,
  OWNER_MUST_REMAIN_ERROR
} from "./household-guards";

describe("household guards", () => {
  it("blocks owner demotion when only one owner remains", () => {
    expect(() => assertCanDemoteOwner(1)).toThrow(OWNER_MUST_REMAIN_ERROR);
    expect(() => assertCanDemoteOwner(2)).not.toThrow();
  });

  it("blocks owner removal/leave when last owner", () => {
    expect(() => assertCanRemoveOwner(1)).toThrow(LAST_OWNER_CANNOT_BE_REMOVED_ERROR);
    expect(() => assertCanLeaveAsOwner(1)).toThrow(LAST_OWNER_CANNOT_LEAVE_ERROR);

    expect(() => assertCanRemoveOwner(2)).not.toThrow();
    expect(() => assertCanLeaveAsOwner(2)).not.toThrow();
  });

  it("enforces dissolve constraints", () => {
    expect(() => assertCanDissolveHousehold("member", 1)).toThrow(DISSOLVE_OWNER_ONLY_ERROR);
    expect(() => assertCanDissolveHousehold("owner", 2)).toThrow(DISSOLVE_LAST_MEMBER_ONLY_ERROR);
    expect(() => assertCanDissolveHousehold("owner", 1)).not.toThrow();
  });

  it("requires leaving balance to be effectively zero", () => {
    expect(() => assertCanLeaveWithBalance(0.002)).not.toThrow();
    expect(() => assertCanLeaveWithBalance(0.01)).toThrow(LEAVE_BALANCE_NOT_ZERO_ERROR);
    expect(() => assertCanLeaveWithBalance(-0.01)).toThrow(LEAVE_BALANCE_NOT_ZERO_ERROR);
  });
});
