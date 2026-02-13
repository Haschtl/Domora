import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BellRing, CheckCircle2 } from "lucide-react";
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
import { getDateLocale } from "../../i18n";

interface TasksTabProps {
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

const dueLabel = (dueAtIso: string, locale: string, fallback: string) => {
  const date = new Date(dueAtIso);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const userLabel = (id: string, ownUserId: string, ownLabel: string) => (id === ownUserId ? ownLabel : id.slice(0, 8));

export const TasksTab = ({
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
  const locale = getDateLocale(i18n.resolvedLanguage ?? i18n.language);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue(new Date()));
  const [frequencyDays, setFrequencyDays] = useState("7");
  const [effortPimpers, setEffortPimpers] = useState("1");
  const [rotationUserIds, setRotationUserIds] = useState<string[]>([userId]);
  const [formError, setFormError] = useState<string | null>(null);

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

  const toggleRotationMember = (targetUserId: string) => {
    setRotationUserIds((current) => {
      if (current.includes(targetUserId)) {
        return current.filter((entry) => entry !== targetUserId);
      }
      return [...current, targetUserId];
    });
  };

  const moveRotationMember = (targetUserId: string, direction: -1 | 1) => {
    setRotationUserIds((current) => {
      const index = current.indexOf(targetUserId);
      if (index < 0) return current;

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const temp = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = temp;
      return next;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (!startDate) {
      setFormError(t("tasks.noStartDate"));
      return;
    }

    if (rotationUserIds.length === 0) {
      setFormError(t("tasks.noAssigneesError"));
      return;
    }

    const parsedFrequencyDays = Number(frequencyDays);
    const parsedEffort = Number(effortPimpers);

    const input: NewTaskInput = {
      title: trimmedTitle,
      description: description.trim(),
      startDate,
      frequencyDays: Number.isFinite(parsedFrequencyDays) ? Math.max(1, Math.floor(parsedFrequencyDays)) : 7,
      effortPimpers: Number.isFinite(parsedEffort) ? Math.max(1, Math.floor(parsedEffort)) : 1,
      rotationUserIds
    };

    setFormError(null);
    await onAdd(input);

    setTitle("");
    setDescription("");
    setStartDate(toDateInputValue(new Date()));
    setFrequencyDays("7");
    setEffortPimpers("1");
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
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {t("tasks.notifications", { status: permissionLabel })}
          </p>
          <Button size="sm" variant="outline" onClick={onEnableNotifications}>
            <BellRing className="mr-1 h-4 w-4" />
            {t("tasks.enablePush")}
          </Button>
        </div>

        <form className="mb-4 space-y-3" onSubmit={onSubmit}>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("tasks.placeholder")} required />

          <textarea
            className="min-h-[90px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            placeholder={t("tasks.descriptionPlaceholder")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              title={t("tasks.startDate")}
              required
            />
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              value={frequencyDays}
              onChange={(event) => setFrequencyDays(event.target.value)}
              placeholder={t("tasks.frequencyDays")}
            />
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              value={effortPimpers}
              onChange={(event) => setEffortPimpers(event.target.value)}
              placeholder={t("tasks.effortPimpers")}
            />
          </div>

          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("tasks.rotationTitle")}</p>
            <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{t("tasks.rotationHint")}</p>

            {members.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("tasks.noMembers")}</p> : null}

            <div className="space-y-2">
              {members.map((member) => {
                const selectedIndex = rotationUserIds.indexOf(member.user_id);
                const isSelected = selectedIndex >= 0;
                const score = pimperByUserId.get(member.user_id) ?? 0;

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
                      {isSelected ? t("tasks.inRotation") : t("tasks.addToRotation")} {userLabel(member.user_id, userId, t("common.you"))}
                    </button>

                    <div className="flex items-center gap-2">
                      <Badge>{t("tasks.pimpersValue", { count: score })}</Badge>

                      {isSelected ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={selectedIndex <= 0}
                            onClick={() => moveRotationMember(member.user_id, -1)}
                            aria-label={t("tasks.moveUp")}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={selectedIndex >= rotationUserIds.length - 1}
                            onClick={() => moveRotationMember(member.user_id, 1)}
                            aria-label={t("tasks.moveDown")}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {formError ? (
            <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
              {formError}
            </p>
          ) : null}

          <Button type="submit" disabled={busy}>
            {t("tasks.createTask")}
          </Button>
        </form>

        {sortedMemberRows.length > 0 ? (
          <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
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
          </div>
        ) : null}

        <ul className="space-y-2">
          {tasks.map((task) => {
            const now = Date.now();
            const dueMillis = new Date(task.due_at).getTime();
            const isDue = !task.done && !Number.isNaN(dueMillis) && dueMillis <= now;
            const isAssignedToCurrentUser = task.assignee_id === userId;
            const canComplete = isDue && isAssignedToCurrentUser && !busy;
            const dueText = dueLabel(task.due_at, locale, t("tasks.noDate"));
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

        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="mb-2 text-sm font-semibold text-brand-900 dark:text-brand-100">{t("tasks.historyTitle")}</p>
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
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(entry.completed_at))}
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
        </div>
      </CardContent>
    </Card>
  );
};
