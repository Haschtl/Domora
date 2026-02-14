import type { FinanceEntry } from "./types";
import {
  calculateBalancesByMember,
  calculateReimbursementPreview,
  calculateSettlementTransfers,
  splitAmountEvenly
} from "./finance-math";

const createEntry = (partial: Partial<FinanceEntry>): FinanceEntry => ({
  id: partial.id ?? crypto.randomUUID(),
  household_id: partial.household_id ?? "h-1",
  description: partial.description ?? "Entry",
  category: partial.category ?? "general",
  amount: partial.amount ?? 0,
  paid_by: partial.paid_by ?? "u-1",
  paid_by_user_ids: partial.paid_by_user_ids ?? [],
  beneficiary_user_ids: partial.beneficiary_user_ids ?? [],
  entry_date: partial.entry_date ?? "2026-02-13",
  created_by: partial.created_by ?? "u-1",
  created_at: partial.created_at ?? "2026-02-13T12:00:00.000Z"
});

describe("finance-math", () => {
  it("splits amounts evenly across all members", () => {
    const result = splitAmountEvenly(30, ["u-1", "u-2", "u-3"]);
    expect(result.get("u-1")).toBeCloseTo(10);
    expect(result.get("u-2")).toBeCloseTo(10);
    expect(result.get("u-3")).toBeCloseTo(10);
  });

  it("calculates balances with payer/beneficiary fallbacks", () => {
    const entries: FinanceEntry[] = [
      createEntry({
        amount: 60,
        paid_by: "u-1",
        paid_by_user_ids: [],
        beneficiary_user_ids: ["u-1", "u-2", "u-3"]
      }),
      createEntry({
        amount: 30,
        paid_by_user_ids: ["u-2", "u-3"],
        beneficiary_user_ids: ["u-2", "u-3"]
      })
    ];

    const balances = calculateBalancesByMember(entries, ["u-1", "u-2", "u-3"]);
    expect(balances).toEqual([
      { memberId: "u-1", balance: 40 },
      { memberId: "u-2", balance: -20 },
      { memberId: "u-3", balance: -20 }
    ]);
  });

  it("builds reimbursement preview and ignores tiny positive noise", () => {
    const preview = calculateReimbursementPreview(100, ["u-1"], ["u-1", "u-2", "u-3"]);
    expect(preview).toEqual([{ memberId: "u-1", value: 66.66666666666666 }]);

    const almostZero = calculateReimbursementPreview(0.005, ["u-1"], ["u-1", "u-2", "u-3"]);
    expect(almostZero).toEqual([]);
  });

  it("builds settlement transfers with few transactions", () => {
    const transfers = calculateSettlementTransfers([
      { memberId: "u-1", balance: 50 },
      { memberId: "u-2", balance: 30 },
      { memberId: "u-3", balance: -40 },
      { memberId: "u-4", balance: -40 }
    ]);

    expect(transfers).toEqual([
      { fromMemberId: "u-3", toMemberId: "u-1", amount: 40 },
      { fromMemberId: "u-4", toMemberId: "u-1", amount: 10 },
      { fromMemberId: "u-4", toMemberId: "u-2", amount: 30 }
    ]);
  });
});
