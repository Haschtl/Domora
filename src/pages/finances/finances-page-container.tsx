import { FinancesPage } from "./finances-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdCashAuditRequests,
  useHouseholdFinanceSubscriptions,
  useHouseholdFinances
} from "../../hooks/use-household-data";

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
  const subscriptionsQuery = useHouseholdFinanceSubscriptions(activeHousehold?.id ?? null);
  const cashAuditQuery = useHouseholdCashAuditRequests(activeHousehold?.id ?? null);

  if (!activeHousehold || !userId) return null;

  return (
    <FinancesPage
      section={section}
      entries={financesQuery.data ?? []}
      subscriptions={subscriptionsQuery.data ?? []}
      cashAuditRequests={cashAuditQuery.data ?? []}
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
