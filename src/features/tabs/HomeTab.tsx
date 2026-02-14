import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Pencil, Receipt, ShoppingCart, Wallet } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import { MXEditor } from "../../components/mx-editor";
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
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  LANDING_WIDGET_KEYS,
  type LandingWidgetKey,
  canEditLandingByRole,
  getEffectiveLandingMarkdown,
  getMissingLandingWidgetKeys,
  getSavedLandingMarkdown
} from "./home-landing.utils";

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
  onSelectHousehold,
  onSaveLandingMarkdown
}: HomeTabProps) => {
  const { t, i18n } = useTranslation();
  const landingInsertOptions = useMemo(
    () => [
      { label: t("home.widgetTasksDue"), value: "{{widget:tasks-overview}}" },
      { label: t("home.widgetFairness"), value: "{{widget:fairness-score}}" },
      { label: t("home.widgetExpensesByMonth"), value: "{{widget:expenses-by-month}}" },
      { label: t("home.widgetFairnessByMember"), value: "{{widget:fairness-by-member}}" }
    ],
    [t]
  );
  const defaultLandingMarkdown = useMemo(
    () =>
      [
        `# ${t("home.defaultLandingHeading", { household: household.name })}`,
        "",
        t("home.defaultLandingIntro"),
        "",
        `## ${t("home.defaultLandingWidgetsHeading")}`,
        "",
        "{{widget:tasks-overview}}",
        "",
        "{{widget:fairness-score}}",
        "",
        "{{widget:expenses-by-month}}",
        "",
        "{{widget:fairness-by-member}}"
      ].join("\n"),
    [household.name, t]
  );
  const showSummary = section === "summary";
  const showFeed = section === "feed";
  const [isEditingLanding, setIsEditingLanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savedMarkdown = getSavedLandingMarkdown(household.landing_page_markdown);
  const effectiveMarkdown = getEffectiveLandingMarkdown(savedMarkdown, defaultLandingMarkdown);
  const [markdownDraft, setMarkdownDraft] = useState(effectiveMarkdown);
  const canEdit = canEditLandingByRole(currentMember?.role ?? null);
  const hasContent = effectiveMarkdown.trim().length > 0;
  const missingWidgetKeys = useMemo(() => getMissingLandingWidgetKeys(effectiveMarkdown), [effectiveMarkdown]);
  const missingWidgetKeySet = useMemo(() => new Set(missingWidgetKeys), [missingWidgetKeys]);
  const hasAllWidgetsInMarkdown = missingWidgetKeys.length === 0;
  const householdImageUrl = household.image_url?.trim() ?? "";
  const bannerBackgroundImage = useMemo(
    () => (householdImageUrl ? `url("${householdImageUrl}")` : createTrianglifyBannerBackground(household.name)),
    [household.name, householdImageUrl]
  );
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
  const landingContentSegments = useMemo(() => {
    const segments: Array<{ type: "markdown"; content: string } | { type: "widget"; key: LandingWidgetKey }> = [];
    const widgetTokenPattern = /\{\{\s*widget:([a-z-]+)\s*\}\}/g;
    let lastIndex = 0;

    for (const match of effectiveMarkdown.matchAll(widgetTokenPattern)) {
      const index = match.index ?? 0;
      if (index > lastIndex) {
        segments.push({ type: "markdown", content: effectiveMarkdown.slice(lastIndex, index) });
      }

      const key = match[1];
      if ((LANDING_WIDGET_KEYS as readonly string[]).includes(key)) {
        segments.push({ type: "widget", key: key as LandingWidgetKey });
      } else {
        segments.push({ type: "markdown", content: match[0] });
      }
      lastIndex = index + match[0].length;
    }

    if (lastIndex < effectiveMarkdown.length) {
      segments.push({ type: "markdown", content: effectiveMarkdown.slice(lastIndex) });
    }

    if (segments.length === 0) {
      segments.push({ type: "markdown", content: effectiveMarkdown });
    }

    return segments;
  }, [effectiveMarkdown]);

  const renderLandingWidget = (key: LandingWidgetKey) => {
    if (key === "tasks-overview") {
      return (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksDue")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{dueTasksCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("home.widgetTasksOpen", { count: openTasksCount })}
          </p>
        </div>
      );
    }

    if (key === "fairness-score") {
      return (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetFairness")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{taskFairness.overallScore} / 100</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetFairnessHint")}</p>
        </div>
      );
    }

    if (key === "expenses-by-month") {
      return monthlyExpenseRows.length > 0 ? (
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
      ) : null;
    }

    if (key === "fairness-by-member") {
      return taskFairness.rows.length > 0 ? (
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
      ) : null;
    }

    return null;
  };

  useEffect(() => {
    setMarkdownDraft(getEffectiveLandingMarkdown(getSavedLandingMarkdown(household.landing_page_markdown), defaultLandingMarkdown));
    setIsEditingLanding(false);
  }, [defaultLandingMarkdown, household.id, household.landing_page_markdown]);

  return (
    <div className="space-y-4">
      {showSummary ? (
      <div className="relative overflow-hidden rounded-2xl border border-brand-200 shadow-card dark:border-slate-700">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: bannerBackgroundImage }} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/45 via-slate-900/25 to-slate-900/55" />
        <div className="relative flex min-h-44 items-end p-5 sm:min-h-56 sm:p-7">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-white/80">{userLabel ?? t("app.noUserLabel")}</p>
            <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">{household.name}</h1>
          </div>
        </div>
      </div>
      ) : null}

      {showSummary ? (
      <Card>
        <CardContent className="relative">
          {households.length > 1 ? (
            <div className="mb-4 sm:max-w-[280px]">
              <Select value={household.id} onValueChange={onSelectHousehold}>
                <SelectTrigger>
                  <SelectValue placeholder={t("home.switchHousehold")} />
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full border-brand-200 bg-white/95 px-0 shadow-sm hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900/95 dark:hover:bg-slate-800"
            onClick={() => setIsEditingLanding(true)}
            disabled={!canEdit}
            aria-label={t("home.editLanding")}
            title={t("home.editLanding")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {!canEdit ? (
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t("home.editLandingOwnerOnly")}</p>
          ) : null}
          {canEdit && isEditingLanding ? (
            <form
              className="w-full space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void (async () => {
                  try {
                    setIsSaving(true);
                    await onSaveLandingMarkdown(markdownDraft);
                    setIsEditingLanding(false);
                  } finally {
                    setIsSaving(false);
                  }
                })();
              }}
            >
              <MXEditor
                value={markdownDraft}
                onChange={setMarkdownDraft}
                placeholder={t("home.markdownPlaceholder")}
                chrome="flat"
                insertOptions={landingInsertOptions}
                insertPlaceholder={t("home.insertWidgetPlaceholder")}
                insertButtonLabel={t("home.insertWidgetAction")}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMarkdownDraft(effectiveMarkdown);
                    setIsEditingLanding(false);
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={busy || isSaving}>
                  {t("home.saveLanding")}
                </Button>
              </div>
            </form>
          ) : hasContent ? (
            <div className="prose prose-slate max-w-none dark:prose-invert [&_*]:break-words">
              {landingContentSegments.map((segment, index) =>
                segment.type === "markdown" ? (
                  <ReactMarkdown key={`md-${index}`} remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {segment.content}
                  </ReactMarkdown>
                ) : (
                  <div key={`widget-${segment.key}-${index}`} className="not-prose mt-4">
                    {renderLandingWidget(segment.key)}
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("home.landingEmpty")}</p>
          )}
        </CardContent>
      </Card>
      ) : null}

      {showSummary && !hasAllWidgetsInMarkdown ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("home.widgetsTitle")}</CardTitle>
          <CardDescription>{t("home.widgetsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingWidgetKeySet.has("tasks-overview") || missingWidgetKeySet.has("fairness-score") ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {missingWidgetKeySet.has("tasks-overview") ? renderLandingWidget("tasks-overview") : null}
              {missingWidgetKeySet.has("fairness-score") ? renderLandingWidget("fairness-score") : null}
            </div>
          ) : null}

          {missingWidgetKeySet.has("expenses-by-month") ? renderLandingWidget("expenses-by-month") : null}
          {missingWidgetKeySet.has("fairness-by-member") ? renderLandingWidget("fairness-by-member") : null}
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

    </div>
  );
};
