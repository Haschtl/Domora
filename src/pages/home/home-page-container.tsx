import { useMemo } from "react";
import { HomePage } from "./home-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdEvents,
  useHouseholdFinances,
  useHouseholdHomeBatch,
  useHouseholdWhiteboard
} from "../../hooks/use-household-data";
import type {
  BucketItem,
  CashAuditRequest,
  HouseholdMemberVacation,
  HouseholdWhiteboard,
  TaskCompletion,
  TaskItem
} from "../../lib/types";

interface HomePageContainerProps {
  section: "summary" | "bucket" | "feed";
}

export const HomePageContainer = ({ section }: HomePageContainerProps) => {
  const {
    activeHousehold,
    currentMember,
    householdMembers,
    userId,
    userEmail,
    userDisplayName,
    busy,
    mobileTabBarVisible,
  } = useWorkspace();

  const homeBatchQuery = useHouseholdHomeBatch(activeHousehold?.id ?? null);
  const whiteboardQuery = useHouseholdWhiteboard(activeHousehold?.id ?? null);
  const financesQuery = useHouseholdFinances(activeHousehold?.id ?? null);
  const eventsQuery = useHouseholdEvents(activeHousehold?.id ?? null);

  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [eventsQuery.data]
  );

  const homeData = homeBatchQuery.data as
    | {
        bucketItems: BucketItem[];
        tasks: TaskItem[];
        taskCompletions: TaskCompletion[];
        cashAuditRequests: CashAuditRequest[];
        memberVacations: HouseholdMemberVacation[];
        householdWhiteboard: HouseholdWhiteboard;
      }
    | undefined;

  const financeEntries = useMemo(
    () => financesQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [financesQuery.data]
  );

  if (!activeHousehold || !userId) return null;

  return (
    <HomePage
      section={section}
      currentMember={currentMember}
      userId={userId}
      members={householdMembers}
      userLabel={userDisplayName ?? userEmail}
      busy={busy}
      mobileTabBarVisible={mobileTabBarVisible}
      bucketItems={homeData?.bucketItems ?? []}
      tasks={homeData?.tasks ?? []}
      taskCompletions={homeData?.taskCompletions ?? []}
      financeEntries={financeEntries}
      cashAuditRequests={homeData?.cashAuditRequests ?? []}
      memberVacations={homeData?.memberVacations ?? []}
      householdEvents={events}
      eventsHasMore={eventsQuery.hasNextPage ?? false}
      eventsLoadingMore={eventsQuery.isFetchingNextPage}
      onLoadMoreEvents={() => void eventsQuery.fetchNextPage()}
      whiteboardSceneJson={
        whiteboardQuery.data?.scene_json ?? homeData?.householdWhiteboard?.scene_json ?? ""
      }
    />
  );
};
