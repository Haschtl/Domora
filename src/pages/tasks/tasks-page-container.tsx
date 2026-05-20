import { useMemo } from "react";
import { TasksPage } from "./tasks-page";
import { TimeTasksPage } from "./time-tasks-page";
import { useWorkspace } from "../../context/workspace-context";
import {
  useHouseholdEvents,
  useHouseholdTasksBatch
} from "../../hooks/use-household-data";
import type {
  HouseholdMemberPimpers,
  OneOffTaskClaim,
  TaskComment,
  TaskCompletion,
  TaskItem,
  TaskTimeCorrectionProposal,
  TaskTimeEntry
} from "../../lib/types";
import { isMemberOnVacationAt } from "../../lib/vacation-utils";

interface TasksPageContainerProps {
  section: "overview" | "stats" | "history" | "settings";
}

export const TasksPageContainer = ({ section }: TasksPageContainerProps) => {
  const {
    activeHousehold,
    householdMembers,
    householdMemberVacations,
    userId,
    busy,
    onAddTask,
    onAddTaskComment,
    onAddTaskTimeEntry,
    onDeleteTaskTimeEntry,
    onUpdateTaskTimeEntry,
    onRateTaskTimeEntry,
    onCreateTaskTimeCorrectionProposal,
    onVoteTaskTimeCorrectionProposal,
    onAddOneOffTaskClaim,
    onCompleteTask,
    onSkipTask,
    onTakeoverTask,
    onToggleTaskActive,
    onUpdateTask,
    onDeleteTask,
    onRateTaskCompletion,
    onRenewOneOffTaskClaim,
    onResetHouseholdPimpers,
    onUpdateMemberTaskLaziness,
    onVoteOneOffTaskClaim,
    onWithdrawOneOffTaskClaim
  } = useWorkspace();

  const tasksBatchQuery = useHouseholdTasksBatch(activeHousehold?.id ?? null);
  const eventsQuery = useHouseholdEvents(activeHousehold?.id ?? null);
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [eventsQuery.data]
  );
  const membersWithVacation = useMemo(
    () =>
      householdMembers.map((member) => ({
        ...member,
        vacation_mode:
          member.vacation_mode ||
          isMemberOnVacationAt(member.user_id, householdMemberVacations, new Date())
      })),
    [householdMemberVacations, householdMembers]
  );

  if (!activeHousehold || !userId) return null;

  const tasksData = tasksBatchQuery.data as
    | {
        tasks: TaskItem[];
        taskComments: TaskComment[];
        taskCompletions: TaskCompletion[];
        taskTimeEntries: TaskTimeEntry[];
        taskTimeCorrectionProposals: TaskTimeCorrectionProposal[];
        oneOffTaskClaims: OneOffTaskClaim[];
        memberPimpers: HouseholdMemberPimpers[];
      }
    | undefined;

  if (activeHousehold.task_mode === "time") {
    return (
      <TimeTasksPage
        section={section}
        household={activeHousehold}
        members={membersWithVacation}
        tasks={tasksData?.tasks ?? []}
        entries={tasksData?.taskTimeEntries ?? []}
        comments={tasksData?.taskComments ?? []}
        correctionProposals={tasksData?.taskTimeCorrectionProposals ?? []}
        userId={userId}
        busy={busy}
        onAddTaskTimeEntry={onAddTaskTimeEntry}
        onAddTaskComment={onAddTaskComment}
        onDeleteTaskTimeEntry={onDeleteTaskTimeEntry}
        onUpdateTaskTimeEntry={onUpdateTaskTimeEntry}
        onRateTaskTimeEntry={onRateTaskTimeEntry}
        onCreateTaskTimeCorrectionProposal={onCreateTaskTimeCorrectionProposal}
        onVoteTaskTimeCorrectionProposal={onVoteTaskTimeCorrectionProposal}
      />
    );
  }

  return (
    <TasksPage
      section={section}
      household={activeHousehold}
      tasks={tasksData?.tasks ?? []}
      completions={tasksData?.taskCompletions ?? []}
      comments={tasksData?.taskComments ?? []}
      oneOffTaskClaims={tasksData?.oneOffTaskClaims ?? []}
      householdEvents={events}
      members={membersWithVacation}
      memberVacations={householdMemberVacations}
      memberPimpers={tasksData?.memberPimpers ?? []}
      userId={userId}
      busy={busy}
      onAdd={onAddTask}
      onAddTaskComment={onAddTaskComment}
      onAddOneOffTaskClaim={onAddOneOffTaskClaim}
      onComplete={onCompleteTask}
      onSkip={onSkipTask}
      onTakeover={onTakeoverTask}
      onToggleActive={onToggleTaskActive}
      onUpdate={onUpdateTask}
      onDelete={onDeleteTask}
      onRateTaskCompletion={onRateTaskCompletion}
      onRenewOneOffTaskClaim={onRenewOneOffTaskClaim}
      onResetHouseholdPimpers={onResetHouseholdPimpers}
      onUpdateMemberTaskLaziness={onUpdateMemberTaskLaziness}
      onVoteOneOffTaskClaim={onVoteOneOffTaskClaim}
      onWithdrawOneOffTaskClaim={onWithdrawOneOffTaskClaim}
    />
  );
};
