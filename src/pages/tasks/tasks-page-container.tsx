import { TasksPage } from "./tasks-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdMemberPimpers,
  useHouseholdTaskCompletions,
  useHouseholdTasks
} from "../../hooks/use-household-data";

interface TasksPageContainerProps {
  section: "overview" | "stats" | "history" | "settings";
}

export const TasksPageContainer = ({ section }: TasksPageContainerProps) => {
  const {
    activeHousehold,
    householdMembers,
    currentMember,
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
    onUpdateMemberTaskLaziness,
    onResetHouseholdPimpers
  } = useWorkspace();

  const tasksQuery = useHouseholdTasks(activeHousehold?.id ?? null);
  const completionsQuery = useHouseholdTaskCompletions(activeHousehold?.id ?? null);
  const memberPimpersQuery = useHouseholdMemberPimpers(activeHousehold?.id ?? null);

  if (!activeHousehold || !userId) return null;

  return (
    <TasksPage
      section={section}
      tasks={tasksQuery.data ?? []}
      completions={completionsQuery.data ?? []}
      members={householdMembers}
      memberPimpers={memberPimpersQuery.data ?? []}
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
      onUpdateMemberTaskLaziness={onUpdateMemberTaskLaziness}
      onResetHouseholdPimpers={onResetHouseholdPimpers}
      canManageTaskLaziness={currentMember?.role === "owner"}
    />
  );
};
