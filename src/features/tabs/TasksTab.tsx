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
import { BellRing, CheckCircle2, GripVertical, Plus } from "lucide-react";
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
import { Input } from "../../components/ui/input";
import { MobileSubpageDialog } from "../../components/ui/mobile-subpage-dialog";
import { SectionPanel } from "../../components/ui/section-panel";
import { Switch } from "../../components/ui/switch";
import { formatDateTime, formatShortDay, isDueNow } from "../../lib/date";

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
}

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dueLabel = (dueAtIso: string, language: string, fallback: string) => formatDateTime(dueAtIso, language, fallback);

const userLabel = (id: string, ownUserId: string, ownLabel: string) => (id === ownUserId ? ownLabel : id.slice(0, 8));

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
  onComplete
}: TasksTabProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;

  const [rotationUserIds, setRotationUserIds] = useState<string[]>([userId]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
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

  const permissionLabel = t(`tasks.notificationStatus.${notificationPermission}`);
  const pushEnabled = notificationPermission === "granted";
  const showOverview = section === "overview";
  const showStats = section === "stats";
  const showHistory = section === "history";

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
    const byUser = new Map<string, number>();
    completions.forEach((entry) => {
      byUser.set(entry.user_id, (byUser.get(entry.user_id) ?? 0) + entry.pimpers_earned);
    });

    const labels = [...byUser.keys()];
    const values = labels.map((id) => byUser.get(id) ?? 0);

    return {
      labels: labels.map((id) => userLabel(id, userId, t("common.you"))),
      values
    };
  }, [completions, userId, t]);

  const toggleRotationMember = (targetUserId: string) => {
    setRotationUserIds((current) => {
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

  return (
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
                        <Input
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder={t("tasks.placeholder")}
                          required
                        />
                      )}
                    />

                    <taskForm.Field
                      name="description"
                      children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                        <textarea
                          className="min-h-[90px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                          placeholder={t("tasks.descriptionPlaceholder")}
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                      )}
                    />

                    <div className="grid gap-2 sm:grid-cols-3">
                      <taskForm.Field
                        name="startDate"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <Input
                            type="date"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            title={t("tasks.startDate")}
                            required
                          />
                        )}
                      />
                      <taskForm.Field
                        name="frequencyDays"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <Input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder={t("tasks.frequencyDays")}
                          />
                        )}
                      />
                      <taskForm.Field
                        name="effortPimpers"
                        children={(field: { state: { value: string }; handleChange: (value: string) => void }) => (
                          <Input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder={t("tasks.effortPimpers")}
                          />
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
                                {userLabel(member.user_id, userId, t("common.you"))}
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
                                    label={userLabel(rotationUserId, userId, t("common.you"))}
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
                  ? userLabel(task.assignee_id, userId, t("common.you"))
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
                              value: task.rotation_user_ids.map((entry) => userLabel(entry, userId, t("common.you"))).join(" -> ")
                            })}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex min-w-[170px] flex-col items-start gap-2 sm:items-end">
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
            <ul className="space-y-1 text-sm">
              {sortedMemberRows.map((member) => (
                <li key={member.user_id} className="flex justify-between gap-2">
                  <span className={member.user_id === userId ? "font-medium" : "text-slate-600 dark:text-slate-300"}>
                    {userLabel(member.user_id, userId, t("common.you"))}
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
                        user: userLabel(entry.user_id, userId, t("common.you")),
                        pimpers: entry.pimpers_earned
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionPanel>
        ) : null}
      </CardContent>
    </Card>
  );
};
