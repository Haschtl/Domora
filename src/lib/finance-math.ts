import type { FinanceEntry } from "./types";

export const splitAmountEvenly = (amount: number, memberIds: string[]) => {
  if (memberIds.length === 0) return new Map<string, number>();
  const base = amount / memberIds.length;
  const result = new Map<string, number>();
  memberIds.forEach((memberId) => {
    result.set(memberId, (result.get(memberId) ?? 0) + base);
  });
  return result;
};

const entryPayers = (entry: FinanceEntry) => (entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by]);

const entryBeneficiaries = (entry: FinanceEntry, fallbackMemberIds: string[]) =>
  entry.beneficiary_user_ids.length > 0 ? entry.beneficiary_user_ids : fallbackMemberIds;

export const calculateBalancesByMember = (entries: FinanceEntry[], settlementMemberIds: string[]) => {
  if (settlementMemberIds.length === 0) return [];

  const balances = new Map<string, number>();
  settlementMemberIds.forEach((memberId) => balances.set(memberId, 0));

  entries.forEach((entry) => {
    const paidShares = splitAmountEvenly(entry.amount, entryPayers(entry));
    const consumedShares = splitAmountEvenly(entry.amount, entryBeneficiaries(entry, settlementMemberIds));

    settlementMemberIds.forEach((memberId) => {
      const delta = (paidShares.get(memberId) ?? 0) - (consumedShares.get(memberId) ?? 0);
      balances.set(memberId, (balances.get(memberId) ?? 0) + delta);
    });
  });

  return settlementMemberIds
    .map((memberId) => ({ memberId, balance: balances.get(memberId) ?? 0 }))
    .sort((a, b) => b.balance - a.balance);
};

export const calculateReimbursementPreview = (amount: number, payerIds: string[], beneficiaryIds: string[]) => {
  if (!Number.isFinite(amount) || amount < 0 || payerIds.length === 0 || beneficiaryIds.length === 0) return [];

  const paidShares = splitAmountEvenly(amount, payerIds);
  const consumedShares = splitAmountEvenly(amount, beneficiaryIds);
  const unionMemberIds = [...new Set([...payerIds, ...beneficiaryIds])];

  return unionMemberIds
    .map((memberId) => ({
      memberId,
      value: (paidShares.get(memberId) ?? 0) - (consumedShares.get(memberId) ?? 0)
    }))
    .filter((entry) => entry.value > 0.004)
    .sort((a, b) => b.value - a.value);
};

export interface SettlementTransfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export const calculateSettlementTransfers = (
  balances: Array<{ memberId: string; balance: number }>,
  tolerance = 0.004
): SettlementTransfer[] => {
  const creditors = balances
    .filter((entry) => entry.balance > tolerance)
    .map((entry) => ({ memberId: entry.memberId, value: entry.balance }))
    .sort((a, b) => b.value - a.value);
  const debtors = balances
    .filter((entry) => entry.balance < -tolerance)
    .map((entry) => ({ memberId: entry.memberId, value: -entry.balance }))
    .sort((a, b) => b.value - a.value);

  const transfers: SettlementTransfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.value, debtor.value);

    if (amount > tolerance) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount
      });
    }

    creditor.value -= amount;
    debtor.value -= amount;

    if (creditor.value <= tolerance) creditorIndex += 1;
    if (debtor.value <= tolerance) debtorIndex += 1;
  }

  return transfers;
};
