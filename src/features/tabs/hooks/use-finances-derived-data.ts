import { useMemo } from "react";
import type { FinanceEntry, HouseholdMember } from "../../../lib/types";
import { calculateBalancesByMember, calculateReimbursementPreview, splitAmountEvenly } from "../../../lib/finance-math";

interface UseFinancesDerivedDataInput {
  entries: FinanceEntry[];
  members: HouseholdMember[];
  lastCashAuditAt: string | null;
  archiveFilters: {
    filterFrom: string;
    filterTo: string;
    filterMember: string;
    filterCategory: string;
    searchText: string;
  };
  previewAmount: number;
  previewPayerIds: string[];
  previewBeneficiaryIds: string[];
}

const parseDateFallback = (entry: FinanceEntry) => {
  if (entry.entry_date) return entry.entry_date;
  return entry.created_at.slice(0, 10);
};

const startOfWeekKey = (day: string) => {
  const [yearRaw, monthRaw, dateRaw] = day.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = Number(dateRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(date)) return day;

  const utc = new Date(Date.UTC(year, month - 1, date));
  const dayOfWeek = utc.getUTCDay();
  const daysToSubtract = (dayOfWeek + 6) % 7; // Monday = 0, Sunday = 6
  utc.setUTCDate(utc.getUTCDate() - daysToSubtract);
  return utc.toISOString().slice(0, 10);
};

export const useFinancesDerivedData = ({
  entries,
  members,
  lastCashAuditAt,
  archiveFilters,
  previewAmount,
  previewPayerIds,
  previewBeneficiaryIds
}: UseFinancesDerivedDataInput) => {
  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);

  const entriesSinceLastAudit = useMemo(() => {
    if (!lastCashAuditAt) return entries;
    const auditDay = lastCashAuditAt.slice(0, 10);
    return entries.filter((entry) => parseDateFallback(entry) > auditDay);
  }, [entries, lastCashAuditAt]);

  const settlementMemberIds = useMemo(() => {
    const ids = members.map((member) => member.user_id);
    if (ids.length > 0) return ids;
    return [...new Set(entriesSinceLastAudit.flatMap((entry) => entry.paid_by_user_ids))];
  }, [entriesSinceLastAudit, members]);

  const periodTotal = useMemo(
    () => entriesSinceLastAudit.reduce((sum, entry) => sum + entry.amount, 0),
    [entriesSinceLastAudit]
  );

  const balancesByMember = useMemo(
    () => calculateBalancesByMember(entriesSinceLastAudit, settlementMemberIds),
    [entriesSinceLastAudit, settlementMemberIds]
  );

  const filteredEntries = useMemo(() => {
    const normalizedSearch = archiveFilters.searchText.trim().toLowerCase();

    return entries.filter((entry) => {
      if (
        archiveFilters.filterMember !== "all" &&
        !entry.paid_by_user_ids.includes(archiveFilters.filterMember) &&
        !entry.beneficiary_user_ids.includes(archiveFilters.filterMember)
      ) {
        return false;
      }
      if (archiveFilters.filterCategory !== "all" && entry.category !== archiveFilters.filterCategory) return false;

      const entryDay = parseDateFallback(entry);
      if (archiveFilters.filterFrom && entryDay < archiveFilters.filterFrom) return false;
      if (archiveFilters.filterTo && entryDay > archiveFilters.filterTo) return false;

      if (normalizedSearch && !entry.description.toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });
  }, [archiveFilters, entries]);

  const filteredTotal = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [filteredEntries]
  );

  const categories = useMemo(() => {
    const values = new Set<string>();
    entries.forEach((entry) => values.add(entry.category));
    values.add("general");
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const byUser = useMemo(() => {
    const totals = new Map<string, number>();
    filteredEntries.forEach((entry) => {
      const payers = entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by];
      const shares = splitAmountEvenly(entry.amount, payers);
      shares.forEach((value, memberId) => {
        totals.set(memberId, (totals.get(memberId) ?? 0) + value);
      });
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredEntries]);

  const historySeries = useMemo(() => {
    const byWeekByMember = new Map<string, Map<string, number>>();
    const memberIds = members.map((member) => member.user_id);

    filteredEntries.forEach((entry) => {
      const day = parseDateFallback(entry);
      const weekStart = startOfWeekKey(day);

      const payers = entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by];
      const shares = splitAmountEvenly(entry.amount, payers);
      const byMember = byWeekByMember.get(weekStart) ?? new Map<string, number>();

      shares.forEach((value, memberId) => {
        byMember.set(memberId, (byMember.get(memberId) ?? 0) + value);
      });

      byWeekByMember.set(weekStart, byMember);
    });
    const labels = [...byWeekByMember.keys()].sort();
    const datasetMemberIds = memberIds.length > 0
      ? memberIds
      : [...new Set(filteredEntries.flatMap((entry) => (entry.paid_by_user_ids.length > 0 ? entry.paid_by_user_ids : [entry.paid_by])))];
    const datasets = datasetMemberIds.map((memberId) => ({
      memberId,
      values: labels.map((label) => byWeekByMember.get(label)?.get(memberId) ?? 0)
    }));

    return { labels, datasets };
  }, [filteredEntries, members]);

  const categorySeries = useMemo(() => {
    const byCategory = new Map<string, number>();
    filteredEntries.forEach((entry) => {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
    });
    const labels = [...byCategory.keys()];
    const values = labels.map((label) => byCategory.get(label) ?? 0);

    return { labels, values };
  }, [filteredEntries]);

  const reimbursementPreview = useMemo(
    () => calculateReimbursementPreview(previewAmount, previewPayerIds, previewBeneficiaryIds),
    [previewAmount, previewPayerIds, previewBeneficiaryIds]
  );

  return {
    total,
    periodTotal,
    entriesSinceLastAudit,
    settlementMemberIds,
    balancesByMember,
    filteredEntries,
    filteredTotal,
    categories,
    byUser,
    historySeries,
    categorySeries,
    reimbursementPreview,
    parseDateFallback
  };
};
