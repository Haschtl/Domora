import { useMemo } from "react";
import { HomePage } from "./home-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdBucketItems,
  useHouseholdCashAuditRequests,
  useHouseholdEvents,
  useHouseholdFinances,
  useHouseholdTaskCompletions,
  useHouseholdTasks,
  useHouseholdWhiteboard
} from "../../hooks/use-household-data";

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

  const bucketQuery = useHouseholdBucketItems(activeHousehold?.id ?? null);
  const tasksQuery = useHouseholdTasks(activeHousehold?.id ?? null);
  const completionsQuery = useHouseholdTaskCompletions(activeHousehold?.id ?? null);
  const financesQuery = useHouseholdFinances(activeHousehold?.id ?? null);
  const cashAuditQuery = useHouseholdCashAuditRequests(activeHousehold?.id ?? null);
  const eventsQuery = useHouseholdEvents(activeHousehold?.id ?? null);
  const whiteboardQuery = useHouseholdWhiteboard(activeHousehold?.id ?? null);

  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [eventsQuery.data]
  );

  if (!activeHousehold || !userId) return null;

  const financeEntries = useMemo(
    () => financesQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [financesQuery.data]
  );

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
      bucketItems={bucketQuery.data ?? []}
      tasks={tasksQuery.data ?? []}
      taskCompletions={completionsQuery.data ?? []}
      financeEntries={financeEntries}
      cashAuditRequests={cashAuditQuery.data ?? []}
      householdEvents={events}
      eventsHasMore={eventsQuery.hasNextPage ?? false}
      eventsLoadingMore={eventsQuery.isFetchingNextPage}
      onLoadMoreEvents={() => void eventsQuery.fetchNextPage()}
      whiteboardSceneJson={whiteboardQuery.data?.scene_json ?? ""}
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
