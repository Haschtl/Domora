import { useMemo } from "react";
import { HomePage } from "./home-page";
import { useWorkspace } from "../../context/workspace-context";
import { useHouseholdEvents, useHouseholdFinances, useHouseholdHomeBatch } from "../../hooks/use-household-data";
import type { BucketItem, CashAuditRequest, HouseholdWhiteboard, TaskCompletion, TaskItem } from "../../lib/types";

interface HomePageContainerProps {
  section: "summary" | "bucket" | "feed";
}

export const HomePageContainer = ({ section }: HomePageContainerProps) => {
  const {
    activeHousehold,
    households,
    currentMember,
    householdMembers,
    userId,
    userEmail,
    userDisplayName,
    busy,
    mobileTabBarVisible,
    setActiveHousehold,
    onUpdateHomeMarkdown,
    onAddBucketItem,
    onToggleBucketItem,
    onUpdateBucketItem,
    onDeleteBucketItem,
    onToggleBucketDateVote,
    onCompleteTask,
    onUpdateHouseholdWhiteboard
  } = useWorkspace();

  const homeBatchQuery = useHouseholdHomeBatch(activeHousehold?.id ?? null);
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
      household={activeHousehold}
      households={households}
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
      householdEvents={events}
      eventsHasMore={eventsQuery.hasNextPage ?? false}
      eventsLoadingMore={eventsQuery.isFetchingNextPage}
      onLoadMoreEvents={() => void eventsQuery.fetchNextPage()}
      whiteboardSceneJson={homeData?.householdWhiteboard?.scene_json ?? ""}
      onSelectHousehold={(householdId) => {
        const next = households.find((entry) => entry.id === householdId);
        if (next) setActiveHousehold(next);
      }}
      onSaveLandingMarkdown={onUpdateHomeMarkdown}
      onSaveWhiteboard={onUpdateHouseholdWhiteboard}
      onAddBucketItem={onAddBucketItem}
      onToggleBucketItem={onToggleBucketItem}
      onUpdateBucketItem={onUpdateBucketItem}
      onDeleteBucketItem={onDeleteBucketItem}
      onToggleBucketDateVote={onToggleBucketDateVote}
      onCompleteTask={onCompleteTask}
    />
  );
};
