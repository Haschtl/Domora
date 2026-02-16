import { useEffect, useMemo } from "react";
import { FinancesPage } from "./finances-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdFinancesBatch,
  useHouseholdFinances
} from "../../hooks/use-household-data";
import type { CashAuditRequest, FinanceSubscription } from "../../lib/types";

interface FinancesPageContainerProps {
  section: "overview" | "stats" | "archive" | "subscriptions";
}

export const FinancesPageContainer = ({ section }: FinancesPageContainerProps) => {
  const {
    activeHousehold,
    currentMember,
    householdMembers,
    userId,
    busy,
    mobileTabBarVisible,
    onAddFinanceEntry,
    onUpdateFinanceEntry,
    onDeleteFinanceEntry,
    onAddFinanceSubscription,
    onUpdateFinanceSubscription,
    onDeleteFinanceSubscription,
    onUpdateHousehold,
    onUpdateMemberSettings,
    onUpdateMemberSettingsForUser,
    onRequestCashAudit
  } = useWorkspace();

  const financesQuery = useHouseholdFinances(activeHousehold?.id ?? null);
  const financesBatchQuery = useHouseholdFinancesBatch(activeHousehold?.id ?? null);

  const entries = useMemo(
    () => financesQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [financesQuery.data]
  );
  const financeMeta = financesBatchQuery.data as
    | {
        financeSubscriptions: FinanceSubscription[];
        cashAuditRequests: CashAuditRequest[];
      }
    | undefined;
  const latestAuditDay = financeMeta?.cashAuditRequests?.[0]?.created_at?.slice(0, 10) ?? null;
  const oldestLoadedDay = useMemo(() => {
    if (entries.length === 0) return null;
    return entries.reduce((oldest, entry) => {
      const entryDay = entry.entry_date || entry.created_at.slice(0, 10);
      if (!oldest || entryDay < oldest) return entryDay;
      return oldest;
    }, null as string | null);
  }, [entries]);

  useEffect(() => {
    if (section === "archive") return;
    if (!latestAuditDay) return;
    if (!financesQuery.hasNextPage || financesQuery.isFetchingNextPage) return;
    if (!oldestLoadedDay) return;
    if (oldestLoadedDay > latestAuditDay) {
      void financesQuery.fetchNextPage();
    }
  }, [
    section,
    financesQuery.hasNextPage,
    financesQuery.isFetchingNextPage,
    financesQuery.fetchNextPage,
    latestAuditDay,
    oldestLoadedDay
  ]);

  useEffect(() => {
    if (section !== "archive") return;
    if (!financesQuery.hasNextPage || financesQuery.isFetchingNextPage) return;
    void financesQuery.fetchNextPage();
  }, [section, financesQuery.hasNextPage, financesQuery.isFetchingNextPage, financesQuery.fetchNextPage]);

  if (!activeHousehold || !userId) return null;

  return (
    <FinancesPage
      section={section}
      entries={entries}
      entriesHasMore={financesQuery.hasNextPage ?? false}
      entriesLoadingMore={financesQuery.isFetchingNextPage}
      onLoadMoreEntries={() => void financesQuery.fetchNextPage()}
      subscriptions={financeMeta?.financeSubscriptions ?? []}
      cashAuditRequests={financeMeta?.cashAuditRequests ?? []}
      household={activeHousehold}
      currentMember={currentMember}
      members={householdMembers}
      busy={busy}
      userId={userId}
      mobileTabBarVisible={mobileTabBarVisible}
      onAdd={onAddFinanceEntry}
      onUpdateEntry={onUpdateFinanceEntry}
      onDeleteEntry={onDeleteFinanceEntry}
      onAddSubscription={onAddFinanceSubscription}
      onUpdateSubscription={onUpdateFinanceSubscription}
      onDeleteSubscription={onDeleteFinanceSubscription}
      onUpdateHousehold={onUpdateHousehold}
      onUpdateMemberSettings={onUpdateMemberSettings}
      onUpdateMemberSettingsForUser={onUpdateMemberSettingsForUser}
      onRequestCashAudit={onRequestCashAudit}
    />
  );
};
