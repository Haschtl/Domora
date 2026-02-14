import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, Pencil, Receipt, ShoppingCart, Wallet, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import { type JsxComponentDescriptor, useLexicalNodeRemove } from "@mdxeditor/editor";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import { MXEditor } from "../../components/mx-editor";
import { formatDateTime } from "../../lib/date";
import { createMemberLabelGetter } from "../../lib/member-label";
import { calculateBalancesByMember } from "../../lib/finance-math";
import type {
  CashAuditRequest,
  FinanceEntry,
  HouseholdEvent,
  Household,
  HouseholdMember,
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
  financeEntries: FinanceEntry[];
  cashAuditRequests: CashAuditRequest[];
  householdEvents: HouseholdEvent[];
  userLabel: string | undefined | null;
  busy: boolean;
  onSelectHousehold: (householdId: string) => void;
  onSaveLandingMarkdown: (markdown: string) => Promise<void>;
  onCompleteTask: (task: TaskItem) => Promise<void>;
}

type LandingContentSegment = { type: "markdown"; content: string } | { type: "widget"; key: LandingWidgetKey };

const LANDING_WIDGET_COMPONENTS: Array<{ key: LandingWidgetKey; tag: string }> = [
  { key: "tasks-overview", tag: "LandingWidgetTasksOverview" },
  { key: "tasks-for-you", tag: "LandingWidgetTasksForYou" },
  { key: "your-balance", tag: "LandingWidgetYourBalance" },
  { key: "household-balance", tag: "LandingWidgetHouseholdBalance" },
  { key: "recent-activity", tag: "LandingWidgetRecentActivity" },
  { key: "fairness-score", tag: "LandingWidgetFairnessScore" },
  { key: "expenses-by-month", tag: "LandingWidgetExpensesByMonth" },
  { key: "fairness-by-member", tag: "LandingWidgetFairnessByMember" }
];
const widgetTokenFromKey = (key: LandingWidgetKey) => `{{widget:${key}}}`;

const convertLandingTokensToEditorJsx = (markdown: string) => {
  let next = markdown;
  LANDING_WIDGET_COMPONENTS.forEach(({ key, tag }) => {
    const pattern = new RegExp(`\\{\\{\\s*widget:${key}\\s*\\}\\}`, "g");
    next = next.replace(pattern, `<${tag} />`);
  });
  return next;
};

const convertEditorJsxToLandingTokens = (markdown: string) => {
  let next = markdown;
  LANDING_WIDGET_COMPONENTS.forEach(({ key, tag }) => {
    const selfClosingPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?\\s*/>`, "g");
    const wrappedPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>\\s*</${tag}>`, "g");
    next = next.replace(selfClosingPattern, widgetTokenFromKey(key));
    next = next.replace(wrappedPattern, widgetTokenFromKey(key));
  });
  return next;
};

const splitLandingContentSegments = (markdown: string): LandingContentSegment[] => {
  const segments: LandingContentSegment[] = [];
  const widgetTokenPattern = /\{\{\s*widget:([a-z-]+)\s*\}\}/g;
  let lastIndex = 0;

  for (const match of markdown.matchAll(widgetTokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "markdown", content: markdown.slice(lastIndex, index) });
    }

    const key = match[1];
    if ((LANDING_WIDGET_KEYS as readonly string[]).includes(key)) {
      segments.push({ type: "widget", key: key as LandingWidgetKey });
    } else {
      segments.push({ type: "markdown", content: match[0] });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: "markdown", content: markdown.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "markdown", content: markdown });
  }

  return segments;
};

const LandingWidgetEditorShell = ({
  children,
  onRemove
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) => (
  <div className="not-prose my-2">
    <div className="relative">
      <button
        type="button"
        className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
        aria-label="Widget entfernen"
        title="Widget entfernen"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  </div>
);

export const HomeTab = ({
  section = "summary",
  household,
  households,
  currentMember,
  userId,
  members,
  tasks,
  taskCompletions,
  financeEntries,
  cashAuditRequests,
  householdEvents,
  userLabel,
  busy,
  onSelectHousehold,
  onSaveLandingMarkdown,
  onCompleteTask
}: HomeTabProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const landingInsertOptions = useMemo(
    () => [
      { label: t("home.widgetTasksDue"), value: widgetTokenFromKey("tasks-overview") },
      { label: t("home.widgetTasksForYou"), value: widgetTokenFromKey("tasks-for-you") },
      { label: t("home.widgetYourBalance"), value: widgetTokenFromKey("your-balance") },
      { label: t("home.widgetHouseholdBalance"), value: widgetTokenFromKey("household-balance") },
      { label: t("home.widgetRecentActivity"), value: widgetTokenFromKey("recent-activity") },
      { label: t("home.widgetFairness"), value: widgetTokenFromKey("fairness-score") },
      { label: t("home.widgetExpensesByMonth"), value: widgetTokenFromKey("expenses-by-month") },
      { label: t("home.widgetFairnessByMember"), value: widgetTokenFromKey("fairness-by-member") }
    ],
    [t]
  );
  const landingInsertOptionsForEditor = useMemo(
    () =>
      landingInsertOptions.map((option) => ({
        ...option,
        value: convertLandingTokensToEditorJsx(option.value)
      })),
    [landingInsertOptions]
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
        "{{widget:tasks-for-you}}",
        "",
        "{{widget:your-balance}}",
        "",
        "{{widget:recent-activity}}",
        "",
        "{{widget:tasks-overview}}"
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
  const dueTasksForYou = useMemo(() => {
    const now = Date.now();
    return tasks.filter(
      (task) => task.is_active && !task.done && task.assignee_id === userId && new Date(task.due_at).getTime() <= now
    );
  }, [tasks, userId]);
  const openTasksCount = useMemo(() => tasks.filter((task) => task.is_active && !task.done).length, [tasks]);
  const lastCashAuditAt = useMemo(() => {
    if (cashAuditRequests.length === 0) return null;
    return [...cashAuditRequests]
      .map((entry) => entry.created_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  }, [cashAuditRequests]);
  const settlementEntries = useMemo(() => {
    if (!lastCashAuditAt) return financeEntries;
    const auditDay = lastCashAuditAt.slice(0, 10);
    return financeEntries.filter((entry) => {
      const day = entry.entry_date || entry.created_at.slice(0, 10);
      return day > auditDay;
    });
  }, [financeEntries, lastCashAuditAt]);
  const financeBalances = useMemo(
    () => calculateBalancesByMember(settlementEntries, members.map((entry) => entry.user_id)),
    [members, settlementEntries]
  );
  const yourBalance = useMemo(
    () => financeBalances.find((entry) => entry.memberId === userId)?.balance ?? 0,
    [financeBalances, userId]
  );
  const householdOpenBalance = useMemo(
    () => financeBalances.filter((entry) => entry.balance > 0).reduce((sum, entry) => sum + entry.balance, 0),
    [financeBalances]
  );
  const formatMoney = useMemo(
    () => (amount: number) =>
      new Intl.NumberFormat(language, {
        style: "currency",
        currency: household.currency || "EUR"
      }).format(amount),
    [household.currency, language]
  );
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
  const labelForUserId = useCallback(
    (memberId: string | null) => (memberId ? memberLabel(memberId) : t("common.memberFallback")),
    [memberLabel, t]
  );
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
    return householdEvents
      .map((entry): ActivityItem => {
        const payload = entry.payload ?? {};
        if (entry.event_type === "task_completed") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
              text: t("home.activityTaskCompleted", {
              user: labelForUserId(entry.actor_user_id),
              task: String(payload.title ?? t("tasks.fallbackTitle"))
            })
          };
        }

        if (entry.event_type === "task_skipped") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
              text: t("home.activityTaskSkipped", {
              user: labelForUserId(entry.actor_user_id),
              task: String(payload.title ?? t("tasks.fallbackTitle"))
            })
          };
        }

        if (entry.event_type === "shopping_completed") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "shopping",
              text: t("home.activityShoppingCompleted", {
              item: String(payload.title ?? ""),
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "finance_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityFinanceCreated", {
              name: String(payload.description ?? ""),
              amount: Number(payload.amount ?? 0).toFixed(2)
            })
          };
        }

        if (entry.event_type === "cash_audit_requested") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityCashAudit", {
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "admin_hint") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: String(payload.message ?? t("home.activityAdminHintFallback"))
          };
        }

        return {
          id: `event-${entry.id}`,
          at: entry.created_at,
          icon: "audit",
            text: t("home.activityRoleChanged", {
            user: labelForUserId(entry.subject_user_id),
            role: String(payload.nextRole ?? "")
          })
        };
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);
  }, [householdEvents, labelForUserId, t]);
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
  const landingContentSegments = useMemo(() => splitLandingContentSegments(effectiveMarkdown), [effectiveMarkdown]);

  const renderLandingWidget = useCallback((key: LandingWidgetKey) => {
    if (key === "tasks-overview") {
      return (
        <button
          type="button"
          className="w-full rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-left transition hover:bg-brand-100/70 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
          onClick={() => void navigate({ to: "/tasks/overview" })}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksDue")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{dueTasksCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("home.widgetTasksOpen", { count: openTasksCount })}
          </p>
        </button>
      );
    }

    if (key === "tasks-for-you") {
      return (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksForYou")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{dueTasksForYou.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksForYouHint")}</p>
          {dueTasksForYou.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {dueTasksForYou.slice(0, 3).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2 py-1 dark:bg-slate-900/50">
                  <span className="truncate text-xs text-slate-600 dark:text-slate-300">{task.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => {
                      void onCompleteTask(task).catch(() => undefined);
                    }}
                  >
                    {t("tasks.complete")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }

    if (key === "your-balance") {
      const positive = yourBalance >= 0;
      return (
        <button
          type="button"
          className="w-full rounded-xl border border-brand-100 bg-white/80 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-900"
          onClick={() => void navigate({ to: "/finances/stats" })}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetYourBalance")}</p>
          <p className={`mt-1 text-lg font-semibold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {formatMoney(yourBalance)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetBalanceSinceAudit")}</p>
        </button>
      );
    }

    if (key === "household-balance") {
      return (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetHouseholdBalance")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatMoney(householdOpenBalance)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetHouseholdBalanceHint")}</p>
        </div>
      );
    }

    if (key === "recent-activity") {
      return (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("home.widgetRecentActivity")}</p>
          {recentActivity.length > 0 ? (
            <ul className="space-y-1">
              {recentActivity.slice(0, 4).map((entry) => (
                <li key={entry.id} className="truncate text-xs text-slate-600 dark:text-slate-300">
                  {entry.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.activityEmpty")}</p>
          )}
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
  }, [
    dueTasksCount,
    openTasksCount,
    dueTasksForYou,
    yourBalance,
    formatMoney,
    householdOpenBalance,
    recentActivity,
    monthlyExpenseRows,
    taskFairness,
    memberLabel,
    navigate,
    onCompleteTask,
    busy,
    t
  ]);
  const landingWidgetJsxDescriptors = useMemo<JsxComponentDescriptor[]>(
    () =>
      LANDING_WIDGET_COMPONENTS.map(({ key, tag }) => {
        const DescriptorEditor = () => {
          const removeNode = useLexicalNodeRemove();
          return <LandingWidgetEditorShell onRemove={removeNode}>{renderLandingWidget(key)}</LandingWidgetEditorShell>;
        };
        return {
          name: tag,
          kind: "flow",
          props: [],
          hasChildren: false,
          Editor: DescriptorEditor
        };
      }),
    [renderLandingWidget]
  );

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
          {!isEditingLanding ? (
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
          ) : null}
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
                value={convertLandingTokensToEditorJsx(markdownDraft)}
                onChange={(nextValue) => setMarkdownDraft(convertEditorJsxToLandingTokens(nextValue))}
                placeholder={t("home.markdownPlaceholder")}
                chrome="flat"
                insertOptions={landingInsertOptionsForEditor}
                insertPlaceholder={t("home.insertWidgetPlaceholder")}
                insertButtonLabel={t("home.insertWidgetAction")}
                jsxComponentDescriptors={landingWidgetJsxDescriptors}
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
