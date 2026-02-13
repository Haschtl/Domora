import { useEffect, useMemo, useState } from "react";
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
  GripVertical,
  Medal,
  MoreHorizontal,
  Plus
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
import { Label } from "../../components/ui/label";
import { MobileSubpageDialog } from "../../components/ui/mobile-subpage-dialog";
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
  onUpdate: (task: TaskItem, input: NewTaskInput) => Promise<void>;
  onDelete: (task: TaskItem) => Promise<void>;
}

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dueLabel = (dueAtIso: string, language: string, fallback: string) => formatDateTime(dueAtIso, language, fallback);
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
  pimperText: string;
  dragHandleLabel: string;
}

const SortableRotationItem = ({ id, label, onRemove, removeLabel, pimperText, dragHandleLabel }: SortableRotationItemProps) => {
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
        <Badge>{pimperText}</Badge>
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
  onUpdate,
  onDelete
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
      effortPimpers: "1"
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
      effortPimpers: "1"
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

  const overdueCount = useMemo(() => {
    const now = Date.now();
    return tasks.filter((task) => !task.done && new Date(task.due_at).getTime() <= now).length;
  }, [tasks]);

  const pimperByUserId = useMemo(() => {
    const map = new Map<string, number>();
    memberPimpers.forEach((entry) => map.set(entry.user_id, Number(entry.total_pimpers)));
    return map;
  }, [memberPimpers]);

  const sortedMemberRows = useMemo(
    () =>
      members
        .map((entry) => ({
          ...entry,
          total_pimpers: pimperByUserId.get(entry.user_id) ?? 0
        }))
        .sort((a, b) => a.total_pimpers - b.total_pimpers || a.user_id.localeCompare(b.user_id)),
    [members, pimperByUserId]
  );
  const podiumRows = useMemo(
    () =>
      [...sortedMemberRows]
        .sort((a, b) => b.total_pimpers - a.total_pimpers || a.user_id.localeCompare(b.user_id))
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

  const pimpersByUserSeries = useMemo(() => {
    const rows = [...sortedMemberRows].sort(
      (a, b) => b.total_pimpers - a.total_pimpers || a.user_id.localeCompare(b.user_id)
    );

    return {
      labels: rows.map((entry) => userLabel(entry.user_id)),
      values: rows.map((entry) => entry.total_pimpers)
    };
  }, [sortedMemberRows, userLabel]);

  const toggleRotationMember = (targetUserId: string) => {
    setRotationUserIds((current) => {
      if (current.includes(targetUserId)) {
        return current.filter((entry) => entry !== targetUserId);
      }
      return [...current, targetUserId];
    });
  };

  const toggleEditRotationMember = (targetUserId: string) => {
    setEditRotationUserIds((current) => {
      if (current.includes(targetUserId)) {
        return current.filter((entry) => entry !== targetUserId);
      }
      return [...current, targetUserId];
    });
  };

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
    <div className="space-y-4">
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{t("tasks.title")}</CardTitle>
            <CardDescription>{t("tasks.description")}</CardDescription>
          </div>
          {overdueCount > 0 ? (
            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100">
              {t("tasks.overdue", { count: overdueCount })}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {showOverview ? (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                            <div className="relative">
                              <Input
                                className="pr-10"
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={field.state.value}
                                onChange={(event) => field.handleChange(event.target.value)}
                                placeholder={t("tasks.frequencyDays")}
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
                                d
                              </span>
                            </div>
                          </div>
                        )}
                      />
                      <taskForm.Field
                        name="effortPimpers"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <div className="space-y-1">
                            <Label>{t("tasks.effortPimpers")}</Label>
                            <div className="relative">
                              <Input
                                className="pr-10"
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={field.state.value}
                                onChange={(event) => field.handleChange(event.target.value)}
                                placeholder={t("tasks.effortPimpers")}
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
                                P
                              </span>
                            </div>
                          </div>
                        )}
                      />
                    </div>

                    <SectionPanel className="bg-brand-50/40">
                      <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("tasks.rotationTitle")}</p>
                      <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{t("tasks.rotationHint")}</p>

                      {members.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.noMembers")}</p> : null}

                      <div className="space-y-2">
                        {members.map((member) => {
                          const isSelected = rotationUserIds.includes(member.user_id);

                          return (
                            <div
                              key={member.user_id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                            >
                              <button
                                type="button"
                                className={
                                  isSelected
                                    ? "rounded-lg bg-brand-700 px-3 py-1 text-xs font-semibold text-white"
                                    : "rounded-lg border border-brand-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                                }
                                onClick={() => toggleRotationMember(member.user_id)}
                              >
                                {isSelected ? t("tasks.inRotation") : t("tasks.addToRotation")}{" "}
                                {userLabel(member.user_id)}
                              </button>
                            </div>
                          );
                        })}
                      </div>

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
                                    pimperText={t("tasks.pimpersValue", { count: score })}
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
              {tasks.map((task) => {
                const isDue = !task.done && isDueNow(task.due_at);
                const isAssignedToCurrentUser = task.assignee_id === userId;
                const canComplete = isDue && isAssignedToCurrentUser && !busy;
                const dueText = dueLabel(task.due_at, language, t("tasks.noDate"));
                  const assigneeText = task.assignee_id
                  ? userLabel(task.assignee_id)
                  : t("tasks.unassigned");

                return (
                  <li
                    key={task.id}
                    className="rounded-xl border border-brand-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className={task.done ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"}>
                          {task.title}
                        </p>

                        {task.description ? (
                          <p className="text-sm text-slate-600 dark:text-slate-300">{task.description}</p>
                        ) : null}

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t("tasks.assignee", { value: assigneeText })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t("tasks.dueLabel", { value: dueText })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t("tasks.frequencyValue", { count: task.frequency_days })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t("tasks.effortValue", { count: task.effort_pimpers })}
                        </p>

                        {task.rotation_user_ids.length > 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("tasks.rotationOrder", {
                              value: task.rotation_user_ids.map((entry) => userLabel(entry)).join(" -> ")
                            })}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex min-w-[170px] flex-col items-start gap-2 sm:items-end">
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

                        {isDue ? (
                          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100">
                            {t("tasks.statusDue")}
                          </Badge>
                        ) : task.done ? (
                          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {t("tasks.statusCompleted")}
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                            {t("tasks.statusUpcoming")}
                          </Badge>
                        )}

                        <Button type="button" size="sm" disabled={!canComplete} onClick={() => onComplete(task)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {t("tasks.complete")}
                        </Button>

                        {!canComplete ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {task.done
                              ? t("tasks.waitingUntil", { value: dueText })
                              : !isAssignedToCurrentUser
                                ? t("tasks.onlyAssignee", { value: assigneeText })
                                : t("tasks.notDueYet")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {tasks.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.empty")}</p> : null}
          </>
        ) : null}

        {showStats && sortedMemberRows.length > 0 ? (
          <SectionPanel className="mb-4">
            <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("tasks.scoreboardTitle")}</p>
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
                          <p className="mb-2 text-xs font-bold">{t("tasks.pimpersValue", { count: member.total_pimpers })}</p>
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
                  <span>{t("tasks.pimpersValue", { count: member.total_pimpers })}</span>
                </li>
              ))}
            </ul>
          </SectionPanel>
        ) : null}

        {showStats && pimpersByUserSeries.labels.length > 0 ? (
          <SectionPanel className="mb-4">
            <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("tasks.historyChartPimpers")}</p>
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
          </SectionPanel>
        ) : null}

        {showHistory ? (
          <SectionPanel className="mt-5">
            <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("tasks.historyTitle")}</p>
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
                        pimpers: entry.pimpers_earned
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionPanel>
        ) : null}

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
                      <div className="relative">
                        <Input
                          className="pr-10"
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder={t("tasks.frequencyDays")}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
                          d
                        </span>
                      </div>
                    </div>
                  )}
                />
                <editTaskForm.Field
                  name="effortPimpers"
                  children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                    <div className="space-y-1">
                      <Label>{t("tasks.effortPimpers")}</Label>
                      <div className="relative">
                        <Input
                          className="pr-10"
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder={t("tasks.effortPimpers")}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">
                          P
                        </span>
                      </div>
                    </div>
                  )}
                />
              </div>

              <SectionPanel className="bg-brand-50/40">
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("tasks.rotationTitle")}</p>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{t("tasks.rotationHint")}</p>

                {members.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.noMembers")}</p> : null}

                <div className="space-y-2">
                  {members.map((member) => {
                    const isSelected = editRotationUserIds.includes(member.user_id);

                    return (
                      <div
                        key={`edit-${member.user_id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white/90 p-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <button
                          type="button"
                          className={
                            isSelected
                              ? "rounded-lg bg-brand-700 px-3 py-1 text-xs font-semibold text-white"
                              : "rounded-lg border border-brand-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                          }
                          onClick={() => toggleEditRotationMember(member.user_id)}
                        >
                          {isSelected ? t("tasks.inRotation") : t("tasks.addToRotation")} {userLabel(member.user_id)}
                        </button>
                      </div>
                    );
                  })}
                </div>

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
                              pimperText={t("tasks.pimpersValue", { count: score })}
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
      </CardContent>
      </Card>

      {calendarCard}
    </div>
  );
};
