import { useMemo } from "react";
import { TasksPage } from "./tasks-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdEvents,
  useHouseholdTasksBatch
} from "../../hooks/use-household-data";
import type { HouseholdMemberPimpers, TaskCompletion, TaskItem } from "../../lib/types";

interface TasksPageContainerProps {
  section: "overview" | "stats" | "history" | "settings";
}

export const TasksPageContainer = ({ section }: TasksPageContainerProps) => {
  const {
    activeHousehold,
    householdMembers,
    userId,
    busy,
    onAddTask,
    onCompleteTask,
    onSkipTask,
    onTakeoverTask,
    onToggleTaskActive,
    onUpdateTask,
    onDeleteTask,
    onRateTaskCompletion,
    onResetHouseholdPimpers,
    onUpdateMemberTaskLaziness
  } = useWorkspace();

  const tasksBatchQuery = useHouseholdTasksBatch(activeHousehold?.id ?? null);
  const eventsQuery = useHouseholdEvents(activeHousehold?.id ?? null);
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [eventsQuery.data]
  );

  if (!activeHousehold || !userId) return null;

  const tasksData = tasksBatchQuery.data as
    | {
        tasks: TaskItem[];
        taskCompletions: TaskCompletion[];
        memberPimpers: HouseholdMemberPimpers[];
      }
    | undefined;

  return (
    <TasksPage
      section={section}
      household={activeHousehold}
      tasks={tasksData?.tasks ?? []}
      completions={tasksData?.taskCompletions ?? []}
      householdEvents={events}
      members={householdMembers}
      memberPimpers={tasksData?.memberPimpers ?? []}
      userId={userId}
      busy={busy}
      onAdd={onAddTask}
      onComplete={onCompleteTask}
      onSkip={onSkipTask}
      onTakeover={onTakeoverTask}
      onToggleActive={onToggleTaskActive}
      onUpdate={onUpdateTask}
      onDelete={onDeleteTask}
      onRateTaskCompletion={onRateTaskCompletion}
      onResetHouseholdPimpers={onResetHouseholdPimpers}
      onUpdateMemberTaskLaziness={onUpdateMemberTaskLaziness}
    />
  );
};
