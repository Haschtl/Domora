import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Receipt, ShoppingCart, Wallet } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import { formatDateTime } from "../../lib/date";
import { createMemberLabelGetter } from "../../lib/member-label";
import type {
  CashAuditRequest,
  FinanceEntry,
  Household,
  HouseholdMember,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "../../lib/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { canEditLandingByRole, getSavedLandingMarkdown, shouldResetDraftOnDialogClose } from "./home-landing.utils";

interface HomeTabProps {
  section?: "summary" | "feed";
  household: Household;
  households: Household[];
  currentMember: HouseholdMember | null;
  userId: string;
  members: HouseholdMember[];
  tasks: TaskItem[];
  taskCompletions: TaskCompletion[];
  shoppingCompletions: ShoppingItemCompletion[];
  financeEntries: FinanceEntry[];
  cashAuditRequests: CashAuditRequest[];
  userLabel: string | undefined | null;
  busy: boolean;
  completedTasks: number;
  totalTasks: number;
  onSelectHousehold: (householdId: string) => void;
  onSaveLandingMarkdown: (markdown: string) => Promise<void>;
}

export const HomeTab = ({
  section = "summary",
  household,
  households,
  currentMember,
  userId,
  members,
  tasks,
  taskCompletions,
  shoppingCompletions,
  financeEntries,
  cashAuditRequests,
  userLabel,
  busy,
  completedTasks,
  totalTasks,
  onSelectHousehold,
  onSaveLandingMarkdown
}: HomeTabProps) => {
  const { t, i18n } = useTranslation();
  const taskProgress = totalTasks > 0 ? Math.min(100, Math.max(0, (completedTasks / totalTasks) * 100)) : 0;
  const showSummary = section === "summary";
  const showFeed = section === "feed";
  const [editorOpen, setEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [markdownDraft, setMarkdownDraft] = useState(getSavedLandingMarkdown(household.landing_page_markdown));
  const savedMarkdown = getSavedLandingMarkdown(household.landing_page_markdown);
  const canEdit = canEditLandingByRole(currentMember?.role ?? null);
  const hasContent = savedMarkdown.trim().length > 0;
  const language = i18n.resolvedLanguage ?? i18n.language;
  const memberLabel = useMemo(
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
  const dueTasksCount = useMemo(() => {
    const now = Date.now();
    return tasks.filter((task) => task.is_active && !task.done && new Date(task.due_at).getTime() <= now).length;
  }, [tasks]);
  const openTasksCount = useMemo(() => tasks.filter((task) => task.is_active && !task.done).length, [tasks]);
  const monthlyExpenseRows = useMemo(() => {
    const byMonth = new Map<string, { total: number; categories: Map<string, number> }>();
    financeEntries.forEach((entry) => {
      const day = entry.entry_date || entry.created_at.slice(0, 10);
      const month = day.slice(0, 7);
      const bucket = byMonth.get(month) ?? { total: 0, categories: new Map<string, number>() };
      bucket.total += entry.amount;
      const currentCategoryTotal = bucket.categories.get(entry.category) ?? 0;
      bucket.categories.set(entry.category, currentCategoryTotal + entry.amount);
      byMonth.set(month, bucket);
    });

    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 4)
      .map(([month, data]) => {
        const categories = [...data.categories.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category, value]) => ({ category, value }));
        return { month, total: data.total, categories };
      });
  }, [financeEntries]);
  const taskFairness = useMemo(() => {
    const memberIds = [...new Set(members.map((entry) => entry.user_id))];
    if (memberIds.length === 0) {
      return {
        overallScore: 100,
        rows: [] as Array<{ memberId: string; score: number; completions: number }>
      };
    }

    const completionsByUser = new Map<string, number>();
    taskCompletions.forEach((entry) => {
      completionsByUser.set(entry.user_id, (completionsByUser.get(entry.user_id) ?? 0) + 1);
    });
    const totalCompletions = memberIds.reduce((sum, memberId) => sum + (completionsByUser.get(memberId) ?? 0), 0);
    const expected = totalCompletions > 0 ? totalCompletions / memberIds.length : 0;

    const rows = memberIds.map((memberId) => {
      const completions = completionsByUser.get(memberId) ?? 0;
      if (expected <= 0) {
        return { memberId, score: 100, completions };
      }
      const deviation = Math.abs(completions - expected) / expected;
      const score = Math.max(0, Math.round((1 - Math.min(1, deviation)) * 100));
      return { memberId, score, completions };
    });

    const overallScore = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 100;
    return { overallScore, rows: rows.sort((a, b) => b.score - a.score) };
  }, [members, taskCompletions]);
  const recentActivity = useMemo(() => {
    type ActivityItem = { id: string; at: string; icon: "task" | "shopping" | "finance" | "audit"; text: string };
    const activityItems: ActivityItem[] = [];

    taskCompletions.slice(0, 20).forEach((entry) => {
      activityItems.push({
        id: `task-${entry.id}`,
        at: entry.completed_at,
        icon: "task",
        text: t("home.activityTaskCompleted", {
          user: memberLabel(entry.user_id),
          task: entry.task_title_snapshot
        })
      });
    });

    shoppingCompletions.slice(0, 20).forEach((entry) => {
      activityItems.push({
        id: `shopping-${entry.id}`,
        at: entry.completed_at,
        icon: "shopping",
        text: t("home.activityShoppingCompleted", {
          item: entry.title_snapshot,
          user: memberLabel(entry.completed_by)
        })
      });
    });

    financeEntries.slice(0, 20).forEach((entry) => {
      activityItems.push({
        id: `finance-${entry.id}`,
        at: entry.created_at,
        icon: "finance",
        text: t("home.activityFinanceCreated", {
          name: entry.description,
          amount: entry.amount.toFixed(2)
        })
      });
    });

    cashAuditRequests.slice(0, 10).forEach((entry) => {
      activityItems.push({
        id: `audit-${entry.id}`,
        at: entry.created_at,
        icon: "audit",
        text: t("home.activityCashAudit", {
          user: memberLabel(entry.requested_by)
        })
      });
    });

    return activityItems
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);
  }, [cashAuditRequests, financeEntries, memberLabel, shoppingCompletions, t, taskCompletions]);
  const markdownComponents = useMemo<Components>(
    () => ({
      h1: ({ children }) => <h1 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{children}</h1>,
      h2: ({ children }) => <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">{children}</h2>,
      h3: ({ children }) => <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{children}</h3>,
      p: ({ children }) => <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
      ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">{children}</ul>,
      ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700 dark:text-slate-300">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
        >
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote className="mt-3 border-l-4 border-brand-300 pl-3 italic text-slate-600 dark:border-brand-700 dark:text-slate-300">
          {children}
        </blockquote>
      ),
      code: ({ children, className }) => (
        <code className={`rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] dark:bg-slate-800 ${className ?? ""}`}>{children}</code>
      ),
      pre: ({ children }) => (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          {children}
        </pre>
      ),
      table: ({ children }) => (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold dark:border-slate-700 dark:bg-slate-800">
          {children}
        </th>
      ),
      td: ({ children }) => <td className="border border-slate-200 px-2 py-1 dark:border-slate-700">{children}</td>
    }),
    []
  );

  useEffect(() => {
    setMarkdownDraft(getSavedLandingMarkdown(household.landing_page_markdown));
  }, [household.id, household.landing_page_markdown]);

  const onEditorOpenChange = (open: boolean) => {
    if (shouldResetDraftOnDialogClose(open, isSaving)) {
      setMarkdownDraft(savedMarkdown);
    }
    setEditorOpen(open);
  };

  return (
    <div className="space-y-4">
      {showSummary ? (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("home.title")}</CardTitle>
              <CardDescription>{userLabel ?? t("app.noUserLabel")}</CardDescription>
            </div>
            <Badge>{t("app.codeBadge", { code: household.invite_code })}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {households.length > 1 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("home.switchHousehold")}</p>
              <Select value={household.id} onValueChange={onSelectHousehold}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                {households.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.household")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{household.name}</p>
            </div>

            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.tasksProgress")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {completedTasks} / {totalTasks}
              </p>
              <Progress className="mt-2" value={taskProgress} />
            </div>

            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.currency")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{household.currency}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setEditorOpen(true)} disabled={!canEdit}>
              {t("home.editLanding")}
            </Button>
          </div>
          {!canEdit ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.editLandingOwnerOnly")}</p>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {showSummary ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("home.landingTitle")}</CardTitle>
          <CardDescription>{t("home.landingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {hasContent ? (
            <div className="prose prose-slate max-w-none dark:prose-invert [&_*]:break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {savedMarkdown}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("home.landingEmpty")}</p>
          )}
        </CardContent>
      </Card>
      ) : null}

      {showSummary ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("home.widgetsTitle")}</CardTitle>
          <CardDescription>{t("home.widgetsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksDue")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{dueTasksCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("home.widgetTasksOpen", { count: openTasksCount })}
              </p>
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetFairness")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{taskFairness.overallScore} / 100</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetFairnessHint")}</p>
            </div>
          </div>

          {monthlyExpenseRows.length > 0 ? (
            <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("home.widgetExpensesByMonth")}</p>
              <ul className="space-y-2">
                {monthlyExpenseRows.map((entry) => (
                  <li key={entry.month} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-700 dark:text-slate-300">{entry.month}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {entry.categories.map((categoryRow) => `${categoryRow.category}: ${categoryRow.value.toFixed(2)} €`).join(" • ")}
                      </p>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{entry.total.toFixed(2)} €</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {taskFairness.rows.length > 0 ? (
            <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("home.widgetFairnessByMember")}</p>
              <ul className="space-y-2">
                {taskFairness.rows.map((row) => (
                  <li key={row.memberId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{memberLabel(row.memberId)}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {row.score} / 100 · {row.completions}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${row.score}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {showFeed ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("home.activityTitle")}</CardTitle>
          <CardDescription>{t("home.activityDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <ul className="space-y-2">
              {recentActivity.map((entry) => {
                const Icon =
                  entry.icon === "task" ? CalendarCheck2 : entry.icon === "shopping" ? ShoppingCart : entry.icon === "finance" ? Wallet : Receipt;
                return (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-brand-100 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/70"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                      <span className="min-w-0 text-slate-700 dark:text-slate-300">{entry.text}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(entry.at, language, entry.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("home.activityEmpty")}</p>
          )}
        </CardContent>
      </Card>
      ) : null}

      <Dialog open={editorOpen} onOpenChange={onEditorOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("home.editLandingTitle")}</DialogTitle>
            <DialogDescription>{t("home.editLandingDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void (async () => {
                try {
                  setIsSaving(true);
                  await onSaveLandingMarkdown(markdownDraft);
                  setEditorOpen(false);
                } finally {
                  setIsSaving(false);
                }
              })();
            }}
          >
            <div className="space-y-1">
              <Label>{t("home.markdownLabel")}</Label>
              <textarea
                value={markdownDraft}
                onChange={(event) => setMarkdownDraft(event.target.value)}
                rows={14}
                placeholder={t("home.markdownPlaceholder")}
                className="min-h-[300px] w-full rounded-xl border border-brand-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={busy || isSaving}>
                {t("home.saveLanding")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
