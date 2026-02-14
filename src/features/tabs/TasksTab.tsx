import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip
} from "chart.js";
import {
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Coffee,
  Flame,
  Frown,
  GripVertical,
  MoonStar,
  Medal,
  MoreHorizontal,
  Plus,
  Sparkles
} from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import type {
  HouseholdMember,
  HouseholdMemberPimpers,
  NewTaskInput,
  TaskCompletion,
  TaskItem
} from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { InputWithSuffix } from "../../components/ui/input-with-suffix";
import { Label } from "../../components/ui/label";
import { MobileSubpageDialog } from "../../components/ui/mobile-subpage-dialog";
import { PimpersIcon } from "../../components/pimpers-icon";
import { PersonSelect } from "../../components/person-select";
import { SectionPanel } from "../../components/ui/section-panel";
import { Switch } from "../../components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { useSmartSuggestions } from "../../hooks/use-smart-suggestions";
import { formatDateTime, formatShortDay, isDueNow } from "../../lib/date";
import { createDiceBearAvatarDataUri } from "../../lib/avatar";
import { createMemberLabelGetter } from "../../lib/member-label";
import { useTaskSuggestions, type TaskSuggestion } from "./hooks/use-task-suggestions";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  ChartTooltip,
  Legend
);

interface TasksTabProps {
  section?: "overview" | "stats" | "history";
  tasks: TaskItem[];
  completions: TaskCompletion[];
  members: HouseholdMember[];
  memberPimpers: HouseholdMemberPimpers[];
  userId: string;
  busy: boolean;
  notificationPermission: NotificationPermission;
  onEnableNotifications: () => Promise<void>;
  onAdd: (input: NewTaskInput) => Promise<void>;
  onComplete: (task: TaskItem) => Promise<void>;
  onSkip: (task: TaskItem) => Promise<void>;
  onTakeover: (task: TaskItem) => Promise<void>;
  onToggleActive: (task: TaskItem) => Promise<void>;
  onUpdate: (task: TaskItem, input: NewTaskInput) => Promise<void>;
  onDelete: (task: TaskItem) => Promise<void>;
  onUpdateMemberTaskLaziness: (targetUserId: string, taskLazinessFactor: number) => Promise<void>;
  onResetHouseholdPimpers: () => Promise<void>;
  canManageTaskLaziness: boolean;
}

type PendingTaskAction = {
  kind: "skip" | "takeover" | "complete";
  task: TaskItem;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const relativeDueChipLabel = (
  dueAtIso: string,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime())) return t("tasks.noDate");

  const diffMs = dueAt.getTime() - Date.now();
  const isFuture = diffMs >= 0;
  const absMs = Math.abs(diffMs);

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const toCount = (unitMs: number) => {
    if (isFuture) return Math.max(1, Math.ceil(absMs / unitMs));
    return Math.max(1, Math.floor(absMs / unitMs));
  };

  let valueLabel: string;
  if (absMs < hourMs) {
    valueLabel = t("tasks.relativeMinutes", { count: toCount(minuteMs) });
  } else if (absMs < dayMs) {
    valueLabel = t("tasks.relativeHours", { count: toCount(hourMs) });
  } else if (absMs < weekMs) {
    valueLabel = t("tasks.relativeDays", { count: toCount(dayMs) });
  } else {
    valueLabel = t("tasks.relativeWeeks", { count: toCount(weekMs) });
  }

  return isFuture ? t("tasks.dueIn", { value: valueLabel }) : t("tasks.dueSince", { value: valueLabel });
};
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;

const buildMonthGrid = (monthDate: Date) => {
  const firstDay = startOfMonth(monthDate);
  const lastDay = endOfMonth(monthDate);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() - (index + 1));
    cells.push({ date, inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(monthDate.getFullYear(), monthDate.getMonth(), day), inCurrentMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const lastDate = cells[cells.length - 1]?.date ?? lastDay;
    const date = new Date(lastDate);
    date.setDate(lastDate.getDate() + 1);
    cells.push({ date, inCurrentMonth: false });
  }

  return cells;
};

interface SortableRotationItemProps {
  id: string;
  label: string;
  onRemove: (userId: string) => void;
  removeLabel: string;
  pimperCount: number;
  dragHandleLabel: string;
}

const SortableRotationItem = ({ id, label, onRemove, removeLabel, pimperCount, dragHandleLabel }: SortableRotationItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
        isDragging
          ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-slate-800"
          : "border-brand-100 bg-white/90 dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 text-slate-600 touch-none dark:border-slate-700 dark:text-slate-300"
          aria-label={dragHandleLabel}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
      </div>

      <div className="flex items-center gap-2">
        <Badge className="inline-flex items-center gap-1">
          <span>{pimperCount}</span>
          <PimpersIcon />
        </Badge>
        <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(id)}>
          {removeLabel}
        </Button>
      </div>
    </div>
  );
};

export const TasksTab = ({
  section = "overview",
  tasks,
  completions,
  members,
  memberPimpers,
  userId,
  busy,
  notificationPermission,
  onEnableNotifications,
  onAdd,
  onComplete,
  onSkip,
  onTakeover,
  onToggleActive,
  onUpdate,
  onDelete,
  onUpdateMemberTaskLaziness,
  onResetHouseholdPimpers,
  canManageTaskLaziness
}: TasksTabProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;

  const [rotationUserIds, setRotationUserIds] = useState<string[]>([userId]);
  const [editRotationUserIds, setEditRotationUserIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<TaskItem | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskPendingDelete, setTaskPendingDelete] = useState<TaskItem | null>(null);
  const [pendingTaskAction, setPendingTaskAction] = useState<PendingTaskAction | null>(null);
  const [isResetPimpersDialogOpen, setIsResetPimpersDialogOpen] = useState(false);
  const [lazinessDraftByUserId, setLazinessDraftByUserId] = useState<Record<string, number>>({});
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => startOfMonth(new Date()));
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 }
    })
  );

  const taskForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      startDate: toDateInputValue(new Date()),
      frequencyDays: "7",
      effortPimpers: "1",
      prioritizeLowPimpers: true
    },
    onSubmit: async ({
      value,
      formApi
    }: {
      value: {
        title: string;
        description: string;
        startDate: string;
        frequencyDays: string;
        effortPimpers: string;
        prioritizeLowPimpers: boolean;
      };
      formApi: { reset: () => void };
    }) => {
      const trimmedTitle = value.title.trim();
      if (!trimmedTitle) return;

      if (!value.startDate) {
        setFormError(t("tasks.noStartDate"));
        return;
      }

      if (rotationUserIds.length === 0) {
        setFormError(t("tasks.noAssigneesError"));
        return;
      }

      const parsedFrequencyDays = Number(value.frequencyDays);
      const parsedEffort = Number(value.effortPimpers);

      const input: NewTaskInput = {
        title: trimmedTitle,
        description: value.description.trim(),
        startDate: value.startDate,
        frequencyDays: Number.isFinite(parsedFrequencyDays) ? Math.max(1, Math.floor(parsedFrequencyDays)) : 7,
        effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
        prioritizeLowPimpers: value.prioritizeLowPimpers,
        rotationUserIds
      };

      setFormError(null);
      await onAdd(input);
      formApi.reset();
      setIsCreateDialogOpen(false);
    }
  });

  const editTaskForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      startDate: toDateInputValue(new Date()),
      frequencyDays: "7",
      effortPimpers: "1",
      prioritizeLowPimpers: true
    },
    onSubmit: async ({
      value
    }: {
      value: {
        title: string;
        description: string;
        startDate: string;
        frequencyDays: string;
        effortPimpers: string;
        prioritizeLowPimpers: boolean;
      };
    }) => {
      if (!taskBeingEdited) return;

      const trimmedTitle = value.title.trim();
      if (!trimmedTitle) return;

      if (!value.startDate) {
        setEditFormError(t("tasks.noStartDate"));
        return;
      }

      if (editRotationUserIds.length === 0) {
        setEditFormError(t("tasks.noAssigneesError"));
        return;
      }

      const parsedFrequencyDays = Number(value.frequencyDays);
      const parsedEffort = Number(value.effortPimpers);

      const input: NewTaskInput = {
        title: trimmedTitle,
        description: value.description.trim(),
        startDate: value.startDate,
        frequencyDays: Number.isFinite(parsedFrequencyDays) ? Math.max(1, Math.floor(parsedFrequencyDays)) : 7,
        effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
        prioritizeLowPimpers: value.prioritizeLowPimpers,
        rotationUserIds: editRotationUserIds
      };

      setEditFormError(null);
      await onUpdate(taskBeingEdited, input);
      setTaskBeingEdited(null);
      setIsEditDialogOpen(false);
    }
  });

  useEffect(() => {
    const validUserIds = new Set(members.map((entry) => entry.user_id));

    setRotationUserIds((current) => {
      const filtered = current.filter((entry) => validUserIds.has(entry));
      if (filtered.length > 0) return filtered;

      if (validUserIds.has(userId)) return [userId];

      const firstMember = members[0]?.user_id;
      return firstMember ? [firstMember] : [];
    });
  }, [members, userId]);

  useEffect(() => {
    if (!taskBeingEdited) return;
    const validUserIds = new Set(members.map((entry) => entry.user_id));
    setEditRotationUserIds((current) => {
      const filtered = current.filter((entry) => validUserIds.has(entry));
      if (filtered.length > 0) return filtered;
      if (taskBeingEdited.assignee_id && validUserIds.has(taskBeingEdited.assignee_id)) {
        return [taskBeingEdited.assignee_id];
      }
      if (validUserIds.has(userId)) return [userId];
      const firstMember = members[0]?.user_id;
      return firstMember ? [firstMember] : [];
    });
  }, [members, taskBeingEdited, userId]);

  useEffect(() => {
    setLazinessDraftByUserId((current) => {
      const next: Record<string, number> = {};
      members.forEach((member) => {
        next[member.user_id] =
          typeof current[member.user_id] === "number"
            ? current[member.user_id]
            : Number.isFinite(member.task_laziness_factor)
              ? member.task_laziness_factor
              : 1;
      });
      return next;
    });
  }, [members]);

  const pimperByUserId = useMemo(() => {
    const map = new Map<string, number>();
    memberPimpers.forEach((entry) => map.set(entry.user_id, Number(entry.total_pimpers)));
    return map;
  }, [memberPimpers]);

  const taskLazinessMeta = useMemo(
    () => [
      { max: 0.1, icon: MoonStar, label: t("tasks.lazinessLevel1"), className: "text-slate-500 dark:text-slate-300" },
      { max: 0.35, icon: MoonStar, label: t("tasks.lazinessLevel2"), className: "text-slate-500 dark:text-slate-300" },
      { max: 0.6, icon: Coffee, label: t("tasks.lazinessLevel3"), className: "text-amber-600 dark:text-amber-300" },
      { max: 0.85, icon: Coffee, label: t("tasks.lazinessLevel4"), className: "text-amber-600 dark:text-amber-300" },
      { max: 1.1, icon: Sparkles, label: t("tasks.lazinessLevel5"), className: "text-emerald-600 dark:text-emerald-300" },
      { max: 1.35, icon: Sparkles, label: t("tasks.lazinessLevel6"), className: "text-emerald-600 dark:text-emerald-300" },
      { max: 1.6, icon: Sparkles, label: t("tasks.lazinessLevel7"), className: "text-cyan-600 dark:text-cyan-300" },
      { max: 1.85, icon: Flame, label: t("tasks.lazinessLevel8"), className: "text-cyan-600 dark:text-cyan-300" },
      { max: 2.01, icon: Flame, label: t("tasks.lazinessLevel9"), className: "text-indigo-600 dark:text-indigo-300" }
    ],
    [t]
  );

  const getLazinessFactor = (member: HouseholdMember) =>
    Math.min(2, Math.max(0, Number.isFinite(member.task_laziness_factor) ? member.task_laziness_factor : 1));
  const getScaledPimpers = (rawPimpers: number, lazinessFactor: number) =>
    lazinessFactor <= 0 ? null : rawPimpers / lazinessFactor;
  const statsMemberRows = useMemo(
    () =>
      members
        .map((entry) => {
          const totalPimpers = pimperByUserId.get(entry.user_id) ?? 0;
          const lazinessFactor = getLazinessFactor(entry);
          return {
            ...entry,
            total_pimpers: totalPimpers,
            task_laziness_factor: lazinessFactor,
            scaled_pimpers: getScaledPimpers(totalPimpers, lazinessFactor)
          };
        })
        .filter((entry) => entry.scaled_pimpers !== null),
    [members, pimperByUserId]
  );
  const sortedMemberRows = useMemo(
    () =>
      [...statsMemberRows].sort(
        (a, b) => (a.scaled_pimpers ?? 0) - (b.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id)
      ),
    [statsMemberRows]
  );
  const resolveLazinessMeta = (value: number) =>
    taskLazinessMeta.find((entry) => value <= entry.max) ?? taskLazinessMeta[taskLazinessMeta.length - 1];
  const onCommitTaskLaziness = async (targetUserId: string, value: number) => {
    const clamped = Math.min(2, Math.max(0, value));
    await onUpdateMemberTaskLaziness(targetUserId, Number(clamped.toFixed(1)));
  };
  const onConfirmResetHouseholdPimpers = async () => {
    await onResetHouseholdPimpers();
    setIsResetPimpersDialogOpen(false);
  };
  const formatScaledPimpers = (value: number | null | undefined) =>
    value === null || value === undefined ? "-" : Number(value.toFixed(2)).toString();
  const podiumRows = useMemo(
    () =>
      [...sortedMemberRows]
        .sort((a, b) => (b.scaled_pimpers ?? 0) - (a.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id))
        .slice(0, 3),
    [sortedMemberRows]
  );

  const permissionLabel = t(`tasks.notificationStatus.${notificationPermission}`);
  const pushEnabled = notificationPermission === "granted";
  const showOverview = section === "overview";
  const showStats = section === "stats";
  const showHistory = section === "history";
  const taskTitleQuery = taskForm.state.values.title.trim();
  const userLabel = useMemo(
    () =>
      createMemberLabelGetter({
        members,
        currentUserId: userId,
        youLabel: t("common.you"),
        youLabels: {
          nominative: t("common.youNominative"),
          dative: t("common.youDative"),
          accusative: t("common.youAccusative")
        },
        fallbackLabel: t("common.memberFallback")
      }),
    [members, t, userId]
  );

  const allTaskSuggestions = useTaskSuggestions(tasks, completions, language);

  const applyTaskSuggestion = (suggestion: TaskSuggestion) => {
    taskForm.setFieldValue("title", suggestion.title);
    if (!taskForm.state.values.description.trim() && suggestion.description) {
      taskForm.setFieldValue("description", suggestion.description);
    }
    taskForm.setFieldValue("frequencyDays", String(suggestion.frequencyDays));
    taskForm.setFieldValue("effortPimpers", String(suggestion.effortPimpers));
  };
  const {
    suggestions: taskSuggestions,
    focused: titleFocused,
    activeSuggestionIndex,
    onFocus: onTitleFocus,
    onBlur: onTitleBlur,
    onKeyDown: onTitleKeyDown,
    applySuggestion: onSelectTaskSuggestion
  } = useSmartSuggestions<TaskSuggestion>({
    items: allTaskSuggestions,
    query: taskTitleQuery,
    getLabel: (entry) => entry.title,
    onApply: applyTaskSuggestion,
    fuseOptions: {
      keys: [
        { name: "title", weight: 0.8 },
        { name: "description", weight: 0.15 },
        { name: "tags", weight: 0.05 }
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2
    }
  });

  const completionSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    completions.forEach((entry) => {
      const day = entry.completed_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    });

    const labels = [...byDay.keys()].sort();
    const values = labels.map((label) => byDay.get(label) ?? 0);

    return {
      labels: labels.map((label) => formatShortDay(label, language, label)),
      values
    };
  }, [completions, language]);
  const backlogAndDelayStats = useMemo(() => {
    const nowMs = Date.now();
    const dueTasks = tasks.filter((task) => task.is_active && !task.done && !Number.isNaN(new Date(task.due_at).getTime()));
    const overdueTasks = dueTasks.filter((task) => new Date(task.due_at).getTime() <= nowMs);

    const completionRows = completions.filter((entry) => Number.isFinite(entry.delay_minutes));
    const overallDelayMinutes =
      completionRows.length > 0
        ? completionRows.reduce((sum, entry) => sum + Math.max(0, entry.delay_minutes), 0) / completionRows.length
        : 0;

    const byUser = new Map<string, { totalDelay: number; count: number }>();
    completionRows.forEach((entry) => {
      const current = byUser.get(entry.user_id) ?? { totalDelay: 0, count: 0 };
      byUser.set(entry.user_id, {
        totalDelay: current.totalDelay + Math.max(0, entry.delay_minutes),
        count: current.count + 1
      });
    });

    const memberRows = members
      .map((member) => {
        const stats = byUser.get(member.user_id) ?? { totalDelay: 0, count: 0 };
        return {
          userId: member.user_id,
          count: stats.count,
          averageDelayMinutes: stats.count > 0 ? stats.totalDelay / stats.count : 0
        };
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.averageDelayMinutes - a.averageDelayMinutes);

    return {
      dueTasksCount: dueTasks.length,
      overdueTasksCount: overdueTasks.length,
      overallDelayMinutes,
      memberRows
    };
  }, [completions, members, tasks]);
  const formatDelayLabel = (minutes: number) => {
    if (minutes < 60) return t("tasks.delayMinutesValue", { count: Math.round(minutes) });
    if (minutes < 24 * 60) return t("tasks.delayHoursValue", { count: Number((minutes / 60).toFixed(1)) });
    return t("tasks.delayDaysValue", { count: Number((minutes / (24 * 60)).toFixed(1)) });
  };

  const visibleTasks = useMemo(() => {
    const active: TaskItem[] = [];
    const inactive: TaskItem[] = [];

    tasks.forEach((task) => {
      if (task.is_active) active.push(task);
      else inactive.push(task);
    });

    return [...active, ...inactive];
  }, [tasks]);

  const lazinessCard = showStats ? (
    <Card className="mb-4">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{t("tasks.lazinessTitle")}</CardTitle>
            <CardDescription>{t("tasks.lazinessDescription")}</CardDescription>
          </div>
          {canManageTaskLaziness ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setIsResetPimpersDialogOpen(true)}
            >
              {t("tasks.resetPimpers")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {members.map((member) => {
            const draftValue = lazinessDraftByUserId[member.user_id];
            const sliderValue = Number.isFinite(draftValue) ? Math.min(2, Math.max(0, draftValue)) : getLazinessFactor(member);
            const rawPimpers = pimperByUserId.get(member.user_id) ?? 0;
            const scaledPimpers = getScaledPimpers(rawPimpers, sliderValue);
            const level = resolveLazinessMeta(sliderValue);
            const LevelIcon = level.icon;
            const hue = Math.round((sliderValue / 2) * 230);
            const sliderStyle = {
              "--slider-gradient": "linear-gradient(90deg, #64748b 0%, #f59e0b 28%, #22c55e 50%, #06b6d4 75%, #4f46e5 100%)",
              "--slider-thumb": `hsl(${hue} 78% 44%)`
            } as CSSProperties;
            const canEdit = canManageTaskLaziness || member.user_id === userId;

            return (
              <li
                key={`laziness-${member.user_id}`}
                className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/60"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{userLabel(member.user_id)}</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {`${Math.round(sliderValue * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={sliderValue}
                  disabled={!canEdit || busy}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setLazinessDraftByUserId((current) => ({ ...current, [member.user_id]: next }));
                  }}
                  onMouseUp={() => {
                    void onCommitTaskLaziness(member.user_id, sliderValue);
                  }}
                  onTouchEnd={() => {
                    void onCommitTaskLaziness(member.user_id, sliderValue);
                  }}
                  className="common-factor-slider w-full"
                  style={sliderStyle}
                  aria-label={t("tasks.lazinessTitle")}
                />
                <div className="mt-1 flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-500 dark:text-slate-300">0%</span>
                  <span className="text-emerald-700 dark:text-emerald-400">100%</span>
                  <span className="text-indigo-600 dark:text-indigo-300">200%</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${level.className}`}>
                    <LevelIcon className="h-3.5 w-3.5" />
                    {level.label}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {scaledPimpers === null
                      ? t("tasks.lazinessScaledPimpersHidden")
                      : t("tasks.lazinessScaledPimpersValue", { value: scaledPimpers.toFixed(2) })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  ) : null;

  const pimpersByUserSeries = useMemo(() => {
    const rows = [...sortedMemberRows].sort(
      (a, b) => (b.scaled_pimpers ?? 0) - (a.scaled_pimpers ?? 0) || a.user_id.localeCompare(b.user_id)
    );

    return {
      labels: rows.map((entry) => userLabel(entry.user_id)),
      values: rows.map((entry) => Number((entry.scaled_pimpers ?? 0).toFixed(2)))
    };
  }, [sortedMemberRows, userLabel]);

  const removeRotationMember = (targetUserId: string) => {
    setRotationUserIds((current) => {
      if (!current.includes(targetUserId)) return current;
      return current.filter((entry) => entry !== targetUserId);
    });
  };

  const removeEditRotationMember = (targetUserId: string) => {
    setEditRotationUserIds((current) => {
      if (!current.includes(targetUserId)) return current;
      return current.filter((entry) => entry !== targetUserId);
    });
  };

  const onRotationDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setRotationUserIds((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const onEditRotationDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setEditRotationUserIds((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const onStartEditTask = (task: TaskItem) => {
    setTaskBeingEdited(task);
    editTaskForm.setFieldValue("title", task.title);
    editTaskForm.setFieldValue("description", task.description ?? "");
    editTaskForm.setFieldValue("startDate", task.start_date);
    editTaskForm.setFieldValue("frequencyDays", String(task.frequency_days));
    editTaskForm.setFieldValue("effortPimpers", String(task.effort_pimpers));
    editTaskForm.setFieldValue("prioritizeLowPimpers", task.prioritize_low_pimpers);

    const nextRotation = task.rotation_user_ids.length > 0
      ? task.rotation_user_ids
      : task.assignee_id
        ? [task.assignee_id]
        : [];
    setEditRotationUserIds(nextRotation);
    setEditFormError(null);
    setIsEditDialogOpen(true);
  };

  const onStartDeleteTask = (task: TaskItem) => {
    setTaskPendingDelete(task);
    setIsDeleteDialogOpen(true);
  };

  const onConfirmDeleteTask = async () => {
    if (!taskPendingDelete) return;
    await onDelete(taskPendingDelete);
    setTaskPendingDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const onConfirmTaskAction = async () => {
    if (!pendingTaskAction) return;

    const { kind, task } = pendingTaskAction;
    if (kind === "skip") {
      await onSkip(task);
    } else if (kind === "takeover") {
      await onTakeover(task);
    } else {
      await onComplete(task);
    }

    setPendingTaskAction(null);
  };

  const weekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2026, 0, 5));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(monday.getTime() + index * 24 * 60 * 60 * 1000))
    );
  }, [language]);

  const monthCells = useMemo(() => buildMonthGrid(calendarMonthDate), [calendarMonthDate]);
  const calendarTitle = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(calendarMonthDate),
    [calendarMonthDate, language]
  );
  const dueTasksByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        tasks: TaskItem[];
        memberIds: string[];
      }
    >();

    tasks.forEach((task) => {
      if (!task.is_active) return;
      const taskDueDate = new Date(task.due_at);
      if (Number.isNaN(taskDueDate.getTime())) return;
      const key = dayKey(taskDueDate);
      const current = map.get(key) ?? { tasks: [], memberIds: [] };
      current.tasks.push(task);

      const assigneeKey = task.assignee_id ?? "__unassigned__";
      if (!current.memberIds.includes(assigneeKey)) {
        current.memberIds.push(assigneeKey);
      }

      map.set(key, current);
    });

    return map;
  }, [tasks]);

  const memberById = useMemo(() => {
    const map = new Map<string, HouseholdMember>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);

  const calendarCard = showOverview ? (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("tasks.calendarTitle")}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
              }}
              aria-label={t("tasks.calendarPrevMonth")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[130px] text-center text-sm font-medium capitalize text-slate-700 dark:text-slate-200">
              {calendarTitle}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
              }}
              aria-label={t("tasks.calendarNextMonth")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {weekdayLabels.map((label) => (
            <p
              key={label}
              className="px-1 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              {label}
            </p>
          ))}
        </div>

        <TooltipProvider>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((cell) => {
              const isToday = dayKey(cell.date) === dayKey(new Date());
              const entry = dueTasksByDay.get(dayKey(cell.date));
              const memberIds = entry?.memberIds ?? [];
              const visibleMemberIds = memberIds.slice(0, 4);
              const overflowCount = Math.max(0, memberIds.length - visibleMemberIds.length);

              return (
                <div
                  key={dayKey(cell.date)}
                  className={`min-h-[70px] rounded-lg border px-1.5 py-1 ${
                    cell.inCurrentMonth
                      ? "border-brand-100 bg-white/90 dark:border-slate-700 dark:bg-slate-900"
                      : "border-brand-50 bg-white/40 opacity-65 dark:border-slate-800 dark:bg-slate-900/40"
                  }`}
                >
                  <p
                    className={`text-xs font-medium ${
                      isToday
                        ? "text-brand-700 dark:text-brand-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {cell.date.getDate()}
                  </p>

                  {entry && entry.tasks.length > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="mt-1 flex items-center">
                          {visibleMemberIds.map((memberId, index) => {
                            const member = memberById.get(memberId);
                            const displayName = memberId === "__unassigned__" ? t("tasks.unassigned") : userLabel(memberId);
                            const avatarUrl = member?.avatar_url?.trim() ?? "";
                            const avatarSrc =
                              memberId === "__unassigned__"
                                ? null
                                : avatarUrl || createDiceBearAvatarDataUri(member?.display_name?.trim() || displayName || memberId);

                            return (
                              <div
                                key={`${dayKey(cell.date)}-${memberId}`}
                                className={`h-6 w-6 overflow-hidden rounded-full border-2 border-white bg-brand-100 text-[10px] font-semibold text-brand-800 dark:border-slate-900 dark:bg-brand-900 dark:text-brand-100 ${
                                  index > 0 ? "-ml-2" : ""
                                }`}
                                title={displayName}
                              >
                                {avatarSrc ? (
                                  <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                                ) : memberId === "__unassigned__" ? (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <CircleUserRound className="h-3.5 w-3.5" />
                                  </div>
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    {displayName.slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {overflowCount > 0 ? (
                            <div className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-100">
                              +{overflowCount}
                            </div>
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px]">
                        <p className="mb-1 font-semibold">
                          {t("tasks.calendarTooltipTitle", {
                            date: formatShortDay(dayKey(cell.date), language, dayKey(cell.date))
                          })}
                        </p>
                        <ul className="space-y-1">
                          {entry.tasks.map((task) => (
                            <li key={`${dayKey(cell.date)}-${task.id}`} className="text-xs">
                              {task.title} · {task.assignee_id ? userLabel(task.assignee_id) : t("tasks.unassigned")}
                            </li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  ) : null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
      {showOverview ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>{t("tasks.title")}</CardTitle>
                <CardDescription>{t("tasks.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {t("tasks.notifications", { status: permissionLabel })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  <span className="text-sm">{t("tasks.enablePush")}</span>
                  <Switch
                    checked={pushEnabled}
                    onCheckedChange={() => {
                      if (!pushEnabled) {
                        void onEnableNotifications();
                      }
                    }}
                    disabled={pushEnabled}
                    aria-label={t("tasks.enablePush")}
                  />
                </div>

                <MobileSubpageDialog
                  open={isCreateDialogOpen}
                  onOpenChange={setIsCreateDialogOpen}
                  title={t("tasks.createTask")}
                  description={t("tasks.description")}
                  trigger={
                    <Button type="button" size="sm" aria-label={t("tasks.createTask")}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  }
                >
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void taskForm.handleSubmit();
                    }}
                  >
                    <taskForm.Field
                      name="title"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="relative space-y-1">
                          <Label>{t("tasks.titleLabel")}</Label>
                          <Input
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            onFocus={onTitleFocus}
                            onBlur={onTitleBlur}
                            onKeyDown={onTitleKeyDown}
                            placeholder={t("tasks.placeholder")}
                            autoComplete="off"
                            required
                          />
                          {titleFocused && taskSuggestions.length > 0 ? (
                            <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 rounded-xl border border-brand-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t("tasks.suggestionsTitle")}
                              </p>
                              <ul className="max-h-56 overflow-y-auto">
                                {taskSuggestions.map((suggestion, index) => (
                                  <li key={suggestion.key}>
                                    <button
                                      type="button"
                                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand-50 dark:hover:bg-slate-800 ${
                                        index === activeSuggestionIndex ? "bg-brand-50 dark:bg-slate-800" : ""
                                      }`}
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => {
                                        onSelectTaskSuggestion(suggestion);
                                      }}
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                          {suggestion.title}
                                        </p>
                                        {suggestion.tags.length > 0 ? (
                                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                            #{suggestion.tags.join(" #")}
                                          </p>
                                        ) : null}
                                      </div>
                                      <Badge className="text-[10px]">
                                        {suggestion.source === "history"
                                          ? t("tasks.suggestionUsedCount", { count: suggestion.count })
                                          : t("tasks.suggestionLibraryBadge")}
                                      </Badge>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      )}
                    />

                    <taskForm.Field
                      name="description"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <div className="space-y-1">
                          <Label>{t("tasks.descriptionLabel")}</Label>
                          <textarea
                            className="min-h-[90px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                            placeholder={t("tasks.descriptionPlaceholder")}
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                        </div>
                      )}
                    />

                    <div className="grid gap-2 sm:grid-cols-3">
                      <taskForm.Field
                        name="startDate"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.startDate")}</Label>
                            <Input
                              type="date"
                              lang={language}
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              title={t("tasks.startDate")}
                              required
                            />
                          </div>
                        )}
                      />
                      <taskForm.Field
                        name="frequencyDays"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.frequencyDays")}</Label>
                            <InputWithSuffix
                              suffix="d"
                              type="number"
                              min="1"
                              inputMode="numeric"
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder={t("tasks.frequencyDays")}
                            />
                          </div>
                        )}
                      />
                      <taskForm.Field
                        name="effortPimpers"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.effortPimpers")}</Label>
                            <InputWithSuffix
                              suffix={<PimpersIcon />}
                              type="number"
                              min="1"
                              inputMode="numeric"
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder={t("tasks.effortPimpers")}
                            />
                          </div>
                        )}
                      />
                    </div>
                    <taskForm.Field
                      name="prioritizeLowPimpers"
                      children={(field: { state: { value: boolean }; handleChange: (value: boolean) => void }) => (
                        <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {t("tasks.prioritizeLowPimpers")}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.prioritizeLowPimpersHint")}
                            </p>
                          </div>
                          <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                        </div>
                      )}
                    />

                    <SectionPanel className="bg-brand-50/40">
                      <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("tasks.rotationTitle")}</p>
                      <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{t("tasks.rotationHint")}</p>

                      {members.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.noMembers")}</p> : null}

                      <PersonSelect
                        mode="multiple"
                        members={members}
                        value={rotationUserIds}
                        onChange={(nextSelection) => {
                          const nextSet = new Set(nextSelection);
                          const mergedOrder = [
                            ...rotationUserIds.filter((memberId) => nextSet.has(memberId)),
                            ...nextSelection.filter((memberId) => !rotationUserIds.includes(memberId))
                          ];
                          setRotationUserIds(mergedOrder);
                        }}
                        currentUserId={userId}
                        youLabel={t("common.you")}
                        placeholder={t("tasks.rotationTitle")}
                      />

                      {rotationUserIds.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRotationDragEnd}>
                            <SortableContext items={rotationUserIds} strategy={verticalListSortingStrategy}>
                              {rotationUserIds.map((rotationUserId) => {
                                const score = pimperByUserId.get(rotationUserId) ?? 0;
                                return (
                                  <SortableRotationItem
                                    key={rotationUserId}
                                    id={rotationUserId}
                                    label={userLabel(rotationUserId)}
                                    onRemove={removeRotationMember}
                                    removeLabel={t("tasks.removeFromRotation")}
                                    pimperCount={score}
                                    dragHandleLabel={t("tasks.dragHandle")}
                                  />
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        </div>
                      ) : null}
                    </SectionPanel>

                    {formError ? (
                      <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                        {formError}
                      </p>
                    ) : null}

                    <div className="flex justify-end">
                      <Button type="submit" disabled={busy}>
                        {t("tasks.createTask")}
                      </Button>
                    </div>
                  </form>
                </MobileSubpageDialog>
              </div>
            </div>

            <ul className="space-y-2">
              {visibleTasks.map((task) => {
                const isDue = task.is_active && !task.done && isDueNow(task.due_at);
                const isAssignedToCurrentUser = task.assignee_id === userId;
                const canComplete = isDue && isAssignedToCurrentUser && !busy;
                const canSkip = isDue && isAssignedToCurrentUser && !busy;
                const canTakeover = isDue && task.assignee_id !== null && !isAssignedToCurrentUser && !busy;
                const dueChipText = relativeDueChipLabel(task.due_at, t);
                const assigneeText = task.assignee_id
                  ? userLabel(task.assignee_id)
                  : t("tasks.unassigned");
                const assigneeMember = task.assignee_id ? memberById.get(task.assignee_id) : null;
                const assigneeAvatarSrc =
                  task.assignee_id && assigneeText
                    ? assigneeMember?.avatar_url?.trim() ||
                      createDiceBearAvatarDataUri(assigneeMember?.display_name?.trim() || assigneeText || task.assignee_id)
                    : null;

                return (
                  <li
                    key={task.id}
                    className={`rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${
                      !task.is_active ? "opacity-60 grayscale-[0.35]" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-200 bg-brand-50 dark:border-slate-700 dark:bg-slate-800"
                            title={assigneeText}
                          >
                            {assigneeAvatarSrc ? (
                              <img src={assigneeAvatarSrc} alt={assigneeText} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-500 dark:text-slate-300">
                                <CircleUserRound className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={task.done ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"}>
                              {task.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("tasks.assignee", { value: assigneeText })}
                            </p>
                          </div>
                        </div>

                        {task.description ? (
                          <p className="text-sm text-slate-600 dark:text-slate-300">{task.description}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              className={
                                isDue
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              }
                            >
                              {dueChipText}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("tasks.frequencyValue", { count: task.frequency_days })}</p>
                          </TooltipContent>
                        </Tooltip>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              aria-label={t("tasks.taskActions")}
                              disabled={busy}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                void onToggleActive(task);
                              }}
                            >
                              {task.is_active ? t("tasks.deactivate") : t("tasks.activate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStartEditTask(task)}>
                              {t("tasks.editTask")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onStartDeleteTask(task)}
                              className="text-rose-600 dark:text-rose-300"
                            >
                              {t("tasks.deleteTask")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {task.rotation_user_ids.length > 0 ? (
                      <div className="mt-2 flex items-center">
                        {task.rotation_user_ids.slice(0, 5).map((memberId, index) => {
                          const member = memberById.get(memberId);
                          const displayName = userLabel(memberId);
                          const avatarUrl = member?.avatar_url?.trim() ?? "";
                          const avatarSrc = avatarUrl || createDiceBearAvatarDataUri(member?.display_name?.trim() || displayName || memberId);
                          return (
                            <div
                              key={`${task.id}-rotation-${memberId}`}
                              className={`h-7 w-7 overflow-hidden rounded-full border-2 border-white bg-brand-100 text-[11px] font-semibold text-brand-800 dark:border-slate-900 dark:bg-brand-900 dark:text-brand-100 ${
                                index > 0 ? "-ml-2" : ""
                              }`}
                              title={displayName}
                            >
                              <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                            </div>
                          );
                        })}
                        {task.rotation_user_ids.length > 5 ? (
                          <div className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-100">
                            +{task.rotation_user_ids.length - 5}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <span>{task.effort_pimpers}</span>
                          <PimpersIcon />
                        </span>
                      </p>
                      <div className="flex flex-wrap justify-end gap-2">
                        {canTakeover ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingTaskAction({ kind: "takeover", task })}
                          >
                            {t("tasks.takeOver")}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canSkip}
                          onClick={() => setPendingTaskAction({ kind: "skip", task })}
                        >
                          {t("tasks.skip")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!canComplete}
                          onClick={() => setPendingTaskAction({ kind: "complete", task })}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {t("tasks.complete")}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {visibleTasks.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.empty")}</p> : null}
          </CardContent>
        </Card>
      ) : null}

        {showStats && sortedMemberRows.length > 0 ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.backlogTitle")}</CardTitle>
              <CardDescription>{t("tasks.backlogDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.backlogDueNow")}</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{backlogAndDelayStats.overdueTasksCount}</p>
                </div>
                <div className="rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.backlogOpen")}</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{backlogAndDelayStats.dueTasksCount}</p>
                </div>
                <div className="rounded-lg border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("tasks.averageDelayOverall")}</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatDelayLabel(backlogAndDelayStats.overallDelayMinutes)}
                  </p>
                </div>
              </div>
              {backlogAndDelayStats.memberRows.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("tasks.averageDelayByMember")}
                  </p>
                  <ul className="space-y-1">
                    {backlogAndDelayStats.memberRows.map((row) => (
                      <li key={`delay-${row.userId}`} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-300">{userLabel(row.userId)}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {formatDelayLabel(row.averageDelayMinutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {showStats && sortedMemberRows.length > 0 ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.scoreboardTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
            {podiumRows.length > 0 ? (
              <div className="mb-4 rounded-xl border border-brand-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-3 items-end gap-2">
                  {[1, 0, 2].map((index) => {
                    const member = podiumRows[index];
                    if (!member) return <div key={`podium-empty-${index}`} />;

                    const rank = index + 1;
                    const isGold = rank === 1;
                    const isSilver = rank === 2;
                    const pillarHeight = isGold ? "h-24" : isSilver ? "h-20" : "h-16";
                    const pillarColor = isGold
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                      : isSilver
                        ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                        : "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200";
                    const medalColor = isGold
                      ? "text-amber-500"
                      : isSilver
                        ? "text-slate-400"
                        : "text-orange-500";
                    const rankLabel = isGold
                      ? t("tasks.podiumGold")
                      : isSilver
                        ? t("tasks.podiumSilver")
                        : t("tasks.podiumBronze");

                    return (
                      <div key={member.user_id} className="flex flex-col items-center">
                        <img
                          src={member.avatar_url?.trim() || createDiceBearAvatarDataUri(userLabel(member.user_id))}
                          alt={userLabel(member.user_id)}
                          className="h-8 w-8 rounded-full border border-brand-200 object-cover dark:border-slate-700"
                        />
                        <p className="mt-1 max-w-[90px] truncate text-center text-[11px] text-slate-600 dark:text-slate-300">
                          {userLabel(member.user_id)}
                        </p>
                        <div className={`mt-2 flex w-full flex-col items-center justify-end rounded-t-lg ${pillarHeight} ${pillarColor}`}>
                          <Medal className={`mb-1 h-4 w-4 ${medalColor}`} />
                          <p className="text-[10px] font-semibold">{rankLabel}</p>
                          <p className="mb-2 inline-flex items-center gap-1 text-xs font-bold">
                            <span>{formatScaledPimpers(member.scaled_pimpers)}</span>
                            <PimpersIcon />
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <ul className="space-y-1 text-sm">
              {sortedMemberRows.map((member) => (
                <li key={member.user_id} className="flex justify-between gap-2">
                  <span className={member.user_id === userId ? "font-medium" : "text-slate-600 dark:text-slate-300"}>
                    {userLabel(member.user_id)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span>{formatScaledPimpers(member.scaled_pimpers)}</span>
                    <PimpersIcon />
                  </span>
                </li>
              ))}
            </ul>
            </CardContent>
          </Card>
        ) : null}
        {lazinessCard}

        {showStats && pimpersByUserSeries.labels.length > 0 ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>{t("tasks.historyChartPimpers")}</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
              <Bar
                data={{
                  labels: pimpersByUserSeries.labels,
                  datasets: [
                    {
                      label: t("tasks.historyChartPimpers"),
                      data: pimpersByUserSeries.values,
                      backgroundColor: "rgba(16, 185, 129, 0.65)",
                      borderRadius: 6
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                  }
                }}
                height={170}
              />
            </div>
            </CardContent>
          </Card>
        ) : null}

        {showHistory ? (
          <Card className="mt-5">
            <CardHeader>
              <CardTitle>{t("tasks.historyTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
            {completionSeries.labels.length > 0 ? (
              <div className="mb-3 rounded-lg bg-white p-2 dark:bg-slate-900">
                <Line
                  data={{
                    labels: completionSeries.labels,
                    datasets: [
                      {
                        label: t("tasks.historyChartCompletions"),
                        data: completionSeries.values,
                        borderColor: "#2563eb",
                        backgroundColor: "rgba(37, 99, 235, 0.18)",
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false }
                    },
                    scales: {
                      y: { beginAtZero: true, ticks: { precision: 0 } }
                    }
                  }}
                  height={170}
                />
              </div>
            ) : null}
            {completions.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.historyEmpty")}</p> : null}

            {completions.length > 0 ? (
              <ul className="space-y-2">
                {completions.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {entry.task_title_snapshot || t("tasks.fallbackTitle")}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(entry.completed_at, language)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("tasks.historyLine", {
                        user: userLabel(entry.user_id),
                        pimpers: `${entry.pimpers_earned}`
                      })}
                      <span className="ml-1 inline-flex align-middle">
                        <PimpersIcon />
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Dialog
          open={isResetPimpersDialogOpen}
          onOpenChange={setIsResetPimpersDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("tasks.resetPimpersConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("tasks.resetPimpersConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsResetPimpersDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                onClick={() => void onConfirmResetHouseholdPimpers()}
              >
                {t("tasks.resetPimpersConfirmAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={pendingTaskAction !== null}
          onOpenChange={(open) => {
            if (!open) setPendingTaskAction(null);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {pendingTaskAction?.kind === "skip"
                  ? t("tasks.confirmSkipTitle")
                  : pendingTaskAction?.kind === "takeover"
                    ? t("tasks.confirmTakeOverTitle")
                    : t("tasks.confirmCompleteTitle")}
              </DialogTitle>
              <DialogDescription>
                {pendingTaskAction?.kind === "skip"
                  ? t("tasks.confirmSkipDescription", {
                    title: pendingTaskAction?.task.title ?? t("tasks.fallbackTitle")
                  })
                  : pendingTaskAction?.kind === "takeover"
                    ? t("tasks.confirmTakeOverDescription", {
                      title: pendingTaskAction?.task.title ?? t("tasks.fallbackTitle")
                    })
                    : t("tasks.confirmCompleteDescription", {
                      title: pendingTaskAction?.task.title ?? t("tasks.fallbackTitle")
                    })}
              </DialogDescription>
            </DialogHeader>

            {pendingTaskAction?.kind === "skip" ? (
              <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5 text-center dark:border-rose-800 dark:bg-rose-950/40">
                <Frown className="mx-auto h-14 w-14 text-rose-600 dark:text-rose-300" />
                <p className="mt-3 text-sm font-semibold text-rose-800 dark:text-rose-200">
                  {t("tasks.confirmSkipWarning")}
                </p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingTaskAction(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                className={
                  pendingTaskAction?.kind === "skip"
                    ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                    : undefined
                }
                onClick={() => void onConfirmTaskAction()}
              >
                {pendingTaskAction?.kind === "skip"
                  ? t("tasks.confirmSkipAction")
                  : pendingTaskAction?.kind === "takeover"
                    ? t("tasks.confirmTakeOverAction")
                    : t("tasks.confirmCompleteAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setTaskBeingEdited(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("tasks.editTaskTitle")}</DialogTitle>
              <DialogDescription>{t("tasks.editTaskDescription")}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void editTaskForm.handleSubmit();
              }}
            >
              <editTaskForm.Field
                name="title"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="space-y-1">
                    <Label>{t("tasks.titleLabel")}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder={t("tasks.placeholder")}
                      required
                    />
                  </div>
                )}
              />

              <editTaskForm.Field
                name="description"
                children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                  <div className="space-y-1">
                    <Label>{t("tasks.descriptionLabel")}</Label>
                    <textarea
                      className="min-h-[90px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                      placeholder={t("tasks.descriptionPlaceholder")}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </div>
                )}
              />

              <div className="grid gap-2 sm:grid-cols-3">
                <editTaskForm.Field
                  name="startDate"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.startDate")}</Label>
                      <Input
                        type="date"
                        lang={language}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        title={t("tasks.startDate")}
                        required
                      />
                    </div>
                  )}
                />
                <editTaskForm.Field
                  name="frequencyDays"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.frequencyDays")}</Label>
                      <InputWithSuffix
                        suffix="d"
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("tasks.frequencyDays")}
                      />
                    </div>
                  )}
                />
                <editTaskForm.Field
                  name="effortPimpers"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.effortPimpers")}</Label>
                      <InputWithSuffix
                        suffix={<PimpersIcon />}
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t("tasks.effortPimpers")}
                      />
                    </div>
                  )}
                />
              </div>
              <editTaskForm.Field
                name="prioritizeLowPimpers"
                children={(field: { state: { value: boolean }; handleChange: (value: boolean) => void }) => (
                  <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {t("tasks.prioritizeLowPimpers")}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("tasks.prioritizeLowPimpersHint")}
                      </p>
                    </div>
                    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                  </div>
                )}
              />

              <SectionPanel className="bg-brand-50/40">
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("tasks.rotationTitle")}</p>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{t("tasks.rotationHint")}</p>

                {members.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.noMembers")}</p> : null}

                <PersonSelect
                  mode="multiple"
                  members={members}
                  value={editRotationUserIds}
                  onChange={(nextSelection) => {
                    const nextSet = new Set(nextSelection);
                    const mergedOrder = [
                      ...editRotationUserIds.filter((memberId) => nextSet.has(memberId)),
                      ...nextSelection.filter((memberId) => !editRotationUserIds.includes(memberId))
                    ];
                    setEditRotationUserIds(mergedOrder);
                  }}
                  currentUserId={userId}
                  youLabel={t("common.you")}
                  placeholder={t("tasks.rotationTitle")}
                />

                {editRotationUserIds.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEditRotationDragEnd}>
                      <SortableContext items={editRotationUserIds} strategy={verticalListSortingStrategy}>
                        {editRotationUserIds.map((rotationUserId) => {
                          const score = pimperByUserId.get(rotationUserId) ?? 0;
                          return (
                            <SortableRotationItem
                              key={`edit-row-${rotationUserId}`}
                              id={rotationUserId}
                              label={userLabel(rotationUserId)}
                              onRemove={removeEditRotationMember}
                              removeLabel={t("tasks.removeFromRotation")}
                              pimperCount={score}
                              dragHandleLabel={t("tasks.dragHandle")}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  </div>
                ) : null}
              </SectionPanel>

              {editFormError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {editFormError}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {t("tasks.saveTask")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) setTaskPendingDelete(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("tasks.deleteTaskConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("tasks.deleteTaskConfirmDescription", {
                  title: taskPendingDelete?.title ?? t("tasks.fallbackTitle")
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setTaskPendingDelete(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
                onClick={() => void onConfirmDeleteTask()}
              >
                {t("tasks.deleteTask")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      {calendarCard}
      </div>
    </TooltipProvider>
  );
};
