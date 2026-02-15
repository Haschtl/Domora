import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, GripVertical, MoreHorizontal, Pencil, Plus, Receipt, ShoppingCart, Trash2, Wallet, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import { type JsxComponentDescriptor, type JsxEditorProps, useLexicalNodeRemove } from "@mdxeditor/editor";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import { formatDateTime } from "../../lib/date";
import { createMemberLabelGetter } from "../../lib/member-label";
import { calculateBalancesByMember } from "../../lib/finance-math";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import type {
  BucketItem,
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
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { MultiDateCalendarSelect } from "../../components/ui/multi-date-calendar-select";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {   
  LANDING_WIDGET_KEYS,
  type LandingWidgetKey,
  canEditLandingByRole,
  getEffectiveLandingMarkdown,
  getSavedLandingMarkdown
 } from "../../features/home-landing.utils";

const MXEditorLazy = lazy(() =>
  import("../../components/mx-editor").then((module) => ({ default: module.MXEditor }))
);


interface HomePageProps {
  section?: "summary" | "bucket" | "feed";
  household: Household;
  households: Household[];
  currentMember: HouseholdMember | null;
  userId: string;
  members: HouseholdMember[];
  bucketItems: BucketItem[];
  tasks: TaskItem[];
  taskCompletions: TaskCompletion[];
  financeEntries: FinanceEntry[];
  cashAuditRequests: CashAuditRequest[];
  householdEvents: HouseholdEvent[];
  userLabel: string | undefined | null;
  busy: boolean;
  mobileTabBarVisible?: boolean;
  onSelectHousehold: (householdId: string) => void;
  onSaveLandingMarkdown: (markdown: string) => Promise<void>;
  onAddBucketItem: (input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => Promise<void>;
  onToggleBucketItem: (item: BucketItem) => Promise<void>;
  onUpdateBucketItem: (item: BucketItem, input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => Promise<void>;
  onDeleteBucketItem: (item: BucketItem) => Promise<void>;
  onToggleBucketDateVote: (item: BucketItem, suggestedDate: string, voted: boolean) => Promise<void>;
  onCompleteTask: (task: TaskItem) => Promise<void>;
}

type LandingContentSegment = { type: "markdown"; content: string } | { type: "widget"; key: LandingWidgetKey };

const LANDING_WIDGET_COMPONENTS: Array<{ key: LandingWidgetKey; tag: string }> = [
  { key: "tasks-overview", tag: "LandingWidgetTasksOverview" },
  { key: "tasks-for-you", tag: "LandingWidgetTasksForYou" },
  { key: "your-balance", tag: "LandingWidgetYourBalance" },
  { key: "household-balance", tag: "LandingWidgetHouseholdBalance" },
  { key: "recent-activity", tag: "LandingWidgetRecentActivity" },
  { key: "bucket-short-list", tag: "LandingWidgetBucketShortList" },
  { key: "fairness-score", tag: "LandingWidgetFairnessScore" },
  { key: "reliability-score", tag: "LandingWidgetReliabilityScore" },
  { key: "expenses-by-month", tag: "LandingWidgetExpensesByMonth" },
  { key: "fairness-by-member", tag: "LandingWidgetFairnessByMember" },
  { key: "reliability-by-member", tag: "LandingWidgetReliabilityByMember" }
];
const widgetTokenFromKey = (key: LandingWidgetKey) => `{{widget:${key}}}`;

const convertLandingTokensToEditorJsx = (markdown: string) => {
  const segments = splitLandingContentSegments(markdown);
  let widgetOrder = 0;
  return segments
    .map((segment) => {
      if (segment.type === "markdown") {
        return segment.content;
      }
      const component = LANDING_WIDGET_COMPONENTS.find((entry) => entry.key === segment.key);
      if (!component) {
        return widgetTokenFromKey(segment.key);
      }
      const jsx = `<${component.tag} domoraWidgetOrder="${widgetOrder}" />`;
      widgetOrder += 1;
      return jsx;
    })
    .join("");
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

const getWidgetOrderFromMdastNode = (mdastNode: JsxEditorProps["mdastNode"]): number | null => {
  const attributes = Array.isArray(mdastNode.attributes) ? mdastNode.attributes : [];
  for (const attribute of attributes) {
    if (!attribute || typeof attribute !== "object") continue;
    const candidate = attribute as { type?: string; name?: string; value?: unknown };
    if (candidate.type !== "mdxJsxAttribute" || candidate.name !== "domoraWidgetOrder") continue;
    if (typeof candidate.value !== "string" && typeof candidate.value !== "number") continue;
    const parsed = Number.parseInt(String(candidate.value), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

const moveWidgetInMarkdown = (markdown: string, fromWidgetIndex: number, toWidgetIndex: number) => {
  if (fromWidgetIndex === toWidgetIndex) {
    return markdown;
  }

  const segments = splitLandingContentSegments(markdown);
  const widgetSegmentIndexes: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.type === "widget") {
      widgetSegmentIndexes.push(index);
    }
  });

  const fromSegmentIndex = widgetSegmentIndexes[fromWidgetIndex];
  const toSegmentIndex = widgetSegmentIndexes[toWidgetIndex];
  if (fromSegmentIndex === undefined || toSegmentIndex === undefined) {
    return markdown;
  }

  const nextSegments = [...segments];
  const [moved] = nextSegments.splice(fromSegmentIndex, 1);
  if (!moved) {
    return markdown;
  }
  const targetInsertionIndex = toSegmentIndex - (fromSegmentIndex < toSegmentIndex ? 1 : 0);
  nextSegments.splice(targetInsertionIndex, 0, moved);

  return nextSegments
    .map((segment) => (segment.type === "markdown" ? segment.content : widgetTokenFromKey(segment.key)))
    .join("");
};

const LandingWidgetEditorShell = ({
  children,
  onRemove,
  onMove,
  dragHandleLabel,
  widgetIndex
}: {
  children: React.ReactNode;
  onRemove: () => void;
  onMove: (sourceWidgetIndex: number, targetWidgetIndex: number) => void;
  dragHandleLabel: string;
  widgetIndex: number;
}) => (
  <div className="not-prose my-2">
    <div
      className="relative"
      data-widget-index={widgetIndex}
      draggable
      contentEditable={false}
      onDragStart={(event) => {
        const sourceWidgetIndex = Number.parseInt(event.currentTarget.dataset.widgetIndex ?? "", 10);
        if (!Number.isFinite(sourceWidgetIndex)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/domora-widget-index", String(sourceWidgetIndex));
        event.dataTransfer.setData("text/plain", String(sourceWidgetIndex));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceWidgetIndex = Number.parseInt(
          event.dataTransfer.getData("text/domora-widget-index") || event.dataTransfer.getData("text/plain"),
          10
        );
        const targetWidgetIndex = Number.parseInt(event.currentTarget.dataset.widgetIndex ?? "", 10);
        if (!Number.isFinite(sourceWidgetIndex) || !Number.isFinite(targetWidgetIndex)) {
          return;
        }
        onMove(sourceWidgetIndex, targetWidgetIndex);
      }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-2 z-20 inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 active:cursor-grabbing dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label={dragHandleLabel}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{dragHandleLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
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
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Widget entfernen</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  </div>
);

export const HomePage = ({
  section = "summary",
  household,
  households,
  currentMember,
  userId,
  members,
  bucketItems,
  tasks,
  taskCompletions,
  financeEntries,
  cashAuditRequests,
  householdEvents,
  userLabel,
  busy,
  mobileTabBarVisible = true,
  onSelectHousehold,
  onSaveLandingMarkdown,
  onAddBucketItem,
  onToggleBucketItem,
  onUpdateBucketItem,
  onDeleteBucketItem,
  onToggleBucketDateVote,
  onCompleteTask
}: HomePageProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const landingInsertOptions = useMemo(
    () => [
      { label: t("home.widgetTasksDue"), value: widgetTokenFromKey("tasks-overview") },
      { label: t("home.widgetTasksForYou"), value: widgetTokenFromKey("tasks-for-you") },
      { label: t("home.widgetYourBalance"), value: widgetTokenFromKey("your-balance") },
      { label: t("home.widgetHouseholdBalance"), value: widgetTokenFromKey("household-balance") },
      { label: t("home.widgetRecentActivity"), value: widgetTokenFromKey("recent-activity") },
      { label: t("home.widgetBucketShortList"), value: widgetTokenFromKey("bucket-short-list") },
      { label: t("home.widgetFairness"), value: widgetTokenFromKey("fairness-score") },
      { label: t("home.widgetReliability"), value: widgetTokenFromKey("reliability-score") },
      { label: t("home.widgetExpensesByMonth"), value: widgetTokenFromKey("expenses-by-month") },
      { label: t("home.widgetFairnessByMember"), value: widgetTokenFromKey("fairness-by-member") },
      { label: t("home.widgetReliabilityByMember"), value: widgetTokenFromKey("reliability-by-member") }
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
  const showBucket = section === "bucket";
  const showFeed = section === "feed";
  const [isMobileBucketComposer, setIsMobileBucketComposer] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const [bucketTitle, setBucketTitle] = useState("");
  const [bucketDescriptionMarkdown, setBucketDescriptionMarkdown] = useState("");
  const [bucketSuggestedDates, setBucketSuggestedDates] = useState<string[]>([]);
  const [bucketItemBeingEdited, setBucketItemBeingEdited] = useState<BucketItem | null>(null);
  const [bucketEditTitle, setBucketEditTitle] = useState("");
  const [bucketEditDescriptionMarkdown, setBucketEditDescriptionMarkdown] = useState("");
  const [bucketEditSuggestedDates, setBucketEditSuggestedDates] = useState<string[]>([]);
  const [bucketItemPendingDelete, setBucketItemPendingDelete] = useState<BucketItem | null>(null);
  const [showCompletedBucketItems, setShowCompletedBucketItems] = useState(false);
  const bucketComposerContainerRef = useRef<HTMLDivElement | null>(null);
  const bucketComposerRowRef = useRef<HTMLDivElement | null>(null);
  const [bucketPopoverWidth, setBucketPopoverWidth] = useState(320);
  const [isEditingLanding, setIsEditingLanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCompleteTask, setPendingCompleteTask] = useState<TaskItem | null>(null);
  const savedMarkdown = getSavedLandingMarkdown(household.landing_page_markdown);
  const effectiveMarkdown = getEffectiveLandingMarkdown(savedMarkdown, defaultLandingMarkdown);
  const [markdownDraft, setMarkdownDraft] = useState(effectiveMarkdown);
  const canEdit = canEditLandingByRole(currentMember?.role ?? null);
  const prefetchEditor = useCallback(() => {
    void import("../../components/mx-editor");
  }, []);
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
  const taskReliability = useMemo(() => {
    const memberIds = [...new Set(members.map((entry) => entry.user_id))];
    if (memberIds.length === 0) {
      return {
        overallScore: 100,
        rows: [] as Array<{ memberId: string; score: number; averageDelayMinutes: number }>
      };
    }

    const delaysByUser = new Map<string, { total: number; count: number }>();
    taskCompletions.forEach((entry) => {
      const current = delaysByUser.get(entry.user_id) ?? { total: 0, count: 0 };
      delaysByUser.set(entry.user_id, {
        total: current.total + Math.max(0, entry.delay_minutes ?? 0),
        count: current.count + 1
      });
    });

    const rows = memberIds.map((memberId) => {
      const stats = delaysByUser.get(memberId) ?? { total: 0, count: 0 };
      const averageDelayMinutes = stats.count > 0 ? stats.total / stats.count : 0;
      return { memberId, averageDelayMinutes, score: 100 };
    });

    const maxAverageDelay = Math.max(0, ...rows.map((row) => row.averageDelayMinutes));
    rows.forEach((row) => {
      if (maxAverageDelay <= 0) {
        row.score = 100;
      } else {
        const ratio = row.averageDelayMinutes / maxAverageDelay;
        row.score = Math.max(0, Math.round((1 - Math.min(1, ratio)) * 100));
      }
    });

    const overallScore =
      rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 100;
    return {
      overallScore,
      rows: rows.sort((a, b) => b.score - a.score)
    };
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

        if (entry.event_type === "pimpers_reset") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityPimpersReset", {
              user: labelForUserId(entry.actor_user_id),
              total: Number(payload.total_reset ?? 0)
            })
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
  const openBucketItemsCount = useMemo(() => bucketItems.filter((entry) => !entry.done).length, [bucketItems]);
  const doneBucketItemsCount = useMemo(() => bucketItems.filter((entry) => entry.done).length, [bucketItems]);
  const visibleBucketItems = useMemo(
    () => (showCompletedBucketItems ? bucketItems : bucketItems.filter((entry) => !entry.done)),
    [bucketItems, showCompletedBucketItems]
  );
  const bucketShortList = useMemo(
    () =>
      bucketItems
        .filter((entry) => !entry.done)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [bucketItems]
  );
  const onSubmitBucketItem = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextTitle = bucketTitle.trim();
      if (!nextTitle) return;

      await onAddBucketItem({
        title: nextTitle,
        descriptionMarkdown: bucketDescriptionMarkdown.trim(),
        suggestedDates: [...new Set(bucketSuggestedDates)].sort()
      });
      setBucketTitle("");
      setBucketDescriptionMarkdown("");
      setBucketSuggestedDates([]);
    },
    [bucketDescriptionMarkdown, bucketSuggestedDates, bucketTitle, onAddBucketItem]
  );
  const onStartBucketEdit = useCallback((item: BucketItem) => {
    setBucketItemBeingEdited(item);
    setBucketEditTitle(item.title);
    setBucketEditDescriptionMarkdown(item.description_markdown);
    setBucketEditSuggestedDates(item.suggested_dates);
  }, []);
  const onSubmitBucketEdit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!bucketItemBeingEdited) return;

      const nextTitle = bucketEditTitle.trim();
      if (!nextTitle) return;

      await onUpdateBucketItem(bucketItemBeingEdited, {
        title: nextTitle,
        descriptionMarkdown: bucketEditDescriptionMarkdown.trim(),
        suggestedDates: [...new Set(bucketEditSuggestedDates)].sort()
      });

      setBucketItemBeingEdited(null);
      setBucketEditTitle("");
      setBucketEditDescriptionMarkdown("");
      setBucketEditSuggestedDates([]);
    },
    [bucketEditDescriptionMarkdown, bucketEditSuggestedDates, bucketEditTitle, bucketItemBeingEdited, onUpdateBucketItem]
  );
  const onConfirmDeleteBucketItem = useCallback(async () => {
    if (!bucketItemPendingDelete) return;
    await onDeleteBucketItem(bucketItemPendingDelete);
    setBucketItemPendingDelete(null);
  }, [bucketItemPendingDelete, onDeleteBucketItem]);
  const formatSuggestedDate = useMemo(
    () => (value: string) => {
      const parsed = new Date(`${value}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return value;
      return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(parsed);
    },
    [language]
  );
  const onConfirmCompleteTask = useCallback(async () => {
    if (!pendingCompleteTask) return;
    await onCompleteTask(pendingCompleteTask);
    setPendingCompleteTask(null);
  }, [onCompleteTask, pendingCompleteTask]);

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
                      setPendingCompleteTask(task);
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

    if (key === "bucket-short-list") {
      return (
        <button
          type="button"
          className="w-full rounded-xl border border-brand-100 bg-white/80 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-900"
          onClick={() => void navigate({ to: "/home/bucket" })}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetBucketShortList")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{openBucketItemsCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetBucketShortListHint")}</p>
          {bucketShortList.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {bucketShortList.map((entry) => (
                <li key={entry.id} className="truncate text-xs text-slate-600 dark:text-slate-300">
                  • {entry.title}
                </li>
              ))}
            </ul>
          ) : null}
        </button>
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

    if (key === "reliability-score") {
      return (
        <div className="rounded-xl border border-brand-100 bg-emerald-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetReliability")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {taskReliability.overallScore} / 100
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetReliabilityHint")}</p>
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

    if (key === "reliability-by-member") {
      return taskReliability.rows.length > 0 ? (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("home.widgetReliabilityByMember")}
          </p>
          <ul className="space-y-2">
            {taskReliability.rows.map((row) => (
              <li key={row.memberId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">{memberLabel(row.memberId)}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {row.score} / 100 · {Math.round(row.averageDelayMinutes)}m
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${row.score}%` }} />
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
    bucketShortList,
    openBucketItemsCount,
    taskFairness,
    taskReliability,
    memberLabel,
    navigate,
    onCompleteTask,
    busy,
    t
  ]);
  const landingWidgetJsxDescriptors = useMemo<JsxComponentDescriptor[]>(
    () =>
      LANDING_WIDGET_COMPONENTS.map(({ key, tag }) => {
        const DescriptorEditor = ({ mdastNode }: JsxEditorProps) => {
          const removeNode = useLexicalNodeRemove();
          const widgetOrder = getWidgetOrderFromMdastNode(mdastNode) ?? 0;
          return (
            <LandingWidgetEditorShell
              onRemove={removeNode}
              onMove={(sourceWidgetIndex, targetWidgetIndex) => {
                setMarkdownDraft((previous) => moveWidgetInMarkdown(previous, sourceWidgetIndex, targetWidgetIndex));
              }}
              dragHandleLabel={t("tasks.dragHandle")}
              widgetIndex={widgetOrder}
            >
              {renderLandingWidget(key)}
            </LandingWidgetEditorShell>
          );
        };
        return {
          name: tag,
          kind: "flow",
          props: [],
          hasChildren: false,
          Editor: DescriptorEditor
        };
      }),
    [renderLandingWidget, t]
  );

  useEffect(() => {
    setMarkdownDraft(getEffectiveLandingMarkdown(getSavedLandingMarkdown(household.landing_page_markdown), defaultLandingMarkdown));
    setIsEditingLanding(false);
  }, [defaultLandingMarkdown, household.id, household.landing_page_markdown]);
  useEffect(() => {
    const updateWidth = () => {
      const next =
        bucketComposerContainerRef.current?.getBoundingClientRect().width ??
        bucketComposerRowRef.current?.getBoundingClientRect().width;
      if (!next || Number.isNaN(next)) return;
      setBucketPopoverWidth(Math.max(220, Math.round(next)));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isMobileBucketComposer]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobileBucketComposer(event.matches);
    setIsMobileBucketComposer(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const renderBucketComposer = (mobile: boolean) => (
    <form className={mobile ? "space-y-0" : "space-y-2"} onSubmit={(event) => void onSubmitBucketItem(event)}>
      <div className="flex items-end">
        <div className="relative flex-1 space-y-1">
          <Label className={mobile ? "sr-only" : ""}>{t("home.bucketTitle")}</Label>
          <Popover>
            <PopoverAnchor asChild>
              <div
                ref={bucketComposerRowRef}
                className="flex h-10 items-stretch overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900 focus-within:border-brand-500 focus-within:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:focus-within:border-slate-500 dark:focus-within:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]"
              >
                <Input
                  value={bucketTitle}
                  onChange={(event) => setBucketTitle(event.target.value)}
                  placeholder={t("home.bucketPlaceholder")}
                  maxLength={200}
                  disabled={busy}
                  className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-full w-10 shrink-0 rounded-none border-l border-brand-200 p-0 dark:border-slate-700"
                    aria-label={t("home.bucketMoreOptions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <Button
                  type="submit"
                  disabled={busy || bucketTitle.trim().length === 0}
                  className="h-full shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700"
                  aria-label={t("home.bucketAddAction")}
                >
                  <Plus className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{t("home.bucketAddAction")}</span>
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              side={mobile ? "top" : "bottom"}
              sideOffset={12}
              className="w-auto space-y-3 -translate-x-1.5 rounded-xl border-brand-100 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-slate-700"
              style={{ width: `${bucketPopoverWidth}px` }}
            >
                <div className="space-y-1">
                  <Label>{t("home.bucketDescriptionPlaceholder")}</Label>
                  <textarea
                    value={bucketDescriptionMarkdown}
                    onChange={(event) => setBucketDescriptionMarkdown(event.target.value)}
                    placeholder={t("home.bucketDescriptionPlaceholder")}
                    maxLength={20000}
                    disabled={busy}
                    rows={4}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("home.bucketDatesLabel")}</p>
                  <MultiDateCalendarSelect
                    value={bucketSuggestedDates}
                    onChange={setBucketSuggestedDates}
                    disabled={busy}
                    locale={language}
                    placeholder={t("home.bucketDatePickerPlaceholder")}
                    clearLabel={t("home.bucketDatePickerClear")}
                    doneLabel={t("home.bucketDatePickerDone")}
                  />
                </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      {showSummary ? (
        <div className="relative overflow-hidden rounded-2xl border border-brand-200 shadow-card dark:border-slate-700">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: bannerBackgroundImage }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/45 via-slate-900/25 to-slate-900/55" />
          <div className="relative flex min-h-44 items-end p-5 sm:min-h-56 sm:p-7">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-white/80">
                {userLabel ?? t("app.noUserLabel")}
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">
                {household.name}
              </h1>
            </div>
          </div>
        </div>
      ) : null}

      {showSummary ? (
        <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full border-brand-200 bg-white/95 px-0 shadow-sm hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900/95 dark:hover:bg-slate-800"
                      onMouseEnter={prefetchEditor}
                      onFocus={prefetchEditor}
                      onClick={() => setIsEditingLanding(true)}
                      disabled={!canEdit}
                      aria-label={t("home.editLanding")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("home.editLanding")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {!canEdit ? (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                {t("home.editLandingOwnerOnly")}
              </p>
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
                <Suspense
                  fallback={
                    <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                      {t("common.loading")}
                    </div>
                  }
                >
                  <MXEditorLazy
                    value={convertLandingTokensToEditorJsx(markdownDraft)}
                    onChange={(nextValue) =>
                      setMarkdownDraft(convertEditorJsxToLandingTokens(nextValue))
                    }
                    placeholder={t("home.markdownPlaceholder")}
                    chrome="flat"
                    insertOptions={landingInsertOptionsForEditor}
                    insertPlaceholder={t("home.insertWidgetPlaceholder")}
                    insertButtonLabel={t("home.insertWidgetAction")}
                    jsxComponentDescriptors={landingWidgetJsxDescriptors}
                  />
                </Suspense>
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
                    <ReactMarkdown
                      key={`md-${index}`}
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {segment.content}
                    </ReactMarkdown>
                  ) : (
                    <div
                      key={`widget-${segment.key}-${index}`}
                      className="not-prose mt-4"
                    >
                      {renderLandingWidget(segment.key)}
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("home.landingEmpty")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showBucket ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.bucketTitle")}</CardTitle>
              <CardDescription>{t("home.bucketDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isMobileBucketComposer ? renderBucketComposer(false) : null}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("home.bucketProgress", {
                  open: openBucketItemsCount,
                  done: doneBucketItemsCount,
                })}
              </p>
              {doneBucketItemsCount > 0 ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      setShowCompletedBucketItems((current) => !current)
                    }
                    disabled={busy}
                  >
                    {showCompletedBucketItems
                      ? t("home.bucketHideCompleted")
                      : t("home.bucketShowCompleted", {
                          count: doneBucketItemsCount,
                        })}
                  </Button>
                </div>
              ) : null}
              {visibleBucketItems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("home.bucketEmpty")}
                </p>
              ) : null}
            </CardContent>
          </Card>
          {visibleBucketItems.length > 0 ? (
            <div
              className={`space-y-3 ${isMobileBucketComposer ? "pb-40" : ""}`}
            >
              {visibleBucketItems.map((item) => (
                <Card
                  className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4"
                  key={item.id}
                >
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={item.done}
                          onCheckedChange={() => {
                            void onToggleBucketItem(item);
                          }}
                          aria-label={
                            item.done
                              ? t("home.bucketMarkOpen")
                              : t("home.bucketMarkDone")
                          }
                          disabled={busy}
                        />
                        <span
                          className={`truncate text-sm ${
                            item.done
                              ? "text-slate-400 line-through dark:text-slate-500"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {item.title}
                        </span>
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 px-0"
                            disabled={busy}
                            aria-label={t("home.bucketItemActions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onStartBucketEdit(item)}
                            disabled={busy}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("home.bucketEdit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setBucketItemPendingDelete(item)}
                            disabled={busy}
                            className="text-rose-600 dark:text-rose-300"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("home.bucketDelete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {item.description_markdown.trim().length > 0 ? (
                      <div className="prose prose-slate max-w-none text-sm dark:prose-invert [&_*]:break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {item.description_markdown}
                        </ReactMarkdown>
                      </div>
                    ) : null}

                    {item.suggested_dates.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {t("home.bucketSuggestedDatesTitle")}
                        </p>
                        <ul className="space-y-1">
                          {item.suggested_dates.map((dateValue) => {
                            const voters = item.votes_by_date[dateValue] ?? [];
                            const hasVoted = voters.includes(userId);
                            return (
                              <li
                                key={`${item.id}-${dateValue}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800/60"
                              >
                                <span className="text-xs text-slate-700 dark:text-slate-300">
                                  {formatSuggestedDate(dateValue)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {t("home.bucketVotes", {
                                      count: voters.length,
                                    })}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={hasVoted ? "default" : "outline"}
                                    className="h-7 px-2 text-[11px]"
                                    disabled={busy}
                                    onClick={() => {
                                      void onToggleBucketDateVote(
                                        item,
                                        dateValue,
                                        !hasVoted,
                                      );
                                    }}
                                  >
                                    {hasVoted
                                      ? t("home.bucketVotedAction")
                                      : t("home.bucketVoteAction")}
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
          <Dialog
            open={bucketItemBeingEdited !== null}
            onOpenChange={(open) => {
              if (open) return;
              setBucketItemBeingEdited(null);
              setBucketEditTitle("");
              setBucketEditDescriptionMarkdown("");
              setBucketEditSuggestedDates([]);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("home.bucketEditTitle")}</DialogTitle>
                <DialogDescription>
                  {t("home.bucketEditDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(event) => void onSubmitBucketEdit(event)}
              >
                <div className="space-y-1">
                  <Label>{t("home.bucketTitle")}</Label>
                  <Input
                    value={bucketEditTitle}
                    onChange={(event) => setBucketEditTitle(event.target.value)}
                    placeholder={t("home.bucketPlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("home.bucketDescriptionPlaceholder")}</Label>
                  <textarea
                    value={bucketEditDescriptionMarkdown}
                    onChange={(event) =>
                      setBucketEditDescriptionMarkdown(event.target.value)
                    }
                    placeholder={t("home.bucketDescriptionPlaceholder")}
                    className="min-h-[96px] w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("home.bucketDatesLabel")}
                  </p>
                  <MultiDateCalendarSelect
                    value={bucketEditSuggestedDates}
                    onChange={setBucketEditSuggestedDates}
                    locale={language}
                    placeholder={t("home.bucketDatePickerPlaceholder")}
                    clearLabel={t("home.bucketDatePickerClear")}
                    doneLabel={t("home.bucketDatePickerDone")}
                    disabled={busy}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setBucketItemBeingEdited(null);
                      setBucketEditTitle("");
                      setBucketEditDescriptionMarkdown("");
                      setBucketEditSuggestedDates([]);
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy || bucketEditTitle.trim().length === 0}
                  >
                    {t("home.bucketEditSave")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={bucketItemPendingDelete !== null}
            onOpenChange={(open) => {
              if (!open) setBucketItemPendingDelete(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("home.bucketDeleteConfirmTitle")}</DialogTitle>
                <DialogDescription>
                  {t("home.bucketDeleteConfirmDescription", {
                    title: bucketItemPendingDelete?.title ?? "",
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setBucketItemPendingDelete(null)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    void onConfirmDeleteBucketItem();
                  }}
                >
                  {t("home.bucketDeleteConfirmAction")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {isMobileBucketComposer ? (
            <div
              className={`fixed inset-x-0 z-40 px-3 sm:hidden ${
                mobileTabBarVisible
                  ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]"
                  : "bottom-[calc(env(safe-area-inset-bottom)+0.2rem)]"
              }`}
            >
              <div
                ref={bucketComposerContainerRef}
                className="rounded-2xl border border-brand-200/70 bg-white/75 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/75"
              >
                {renderBucketComposer(true)}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showFeed ? (
        <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
          <CardHeader>
            <CardTitle>{t("home.activityTitle")}</CardTitle>
            <CardDescription>{t("home.activityDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <ul className="space-y-2">
                {recentActivity.map((entry) => {
                  const Icon =
                    entry.icon === "task"
                      ? CalendarCheck2
                      : entry.icon === "shopping"
                        ? ShoppingCart
                        : entry.icon === "finance"
                          ? Wallet
                          : Receipt;
                  return (
                    <li
                      key={entry.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-brand-100 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/70"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                        <span className="min-w-0 text-slate-700 dark:text-slate-300">
                          {entry.text}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(entry.at, language, entry.at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("home.activityEmpty")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={pendingCompleteTask !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCompleteTask(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="absolute right-3 top-3 h-8 w-8 p-0"
            onClick={() => setPendingCompleteTask(null)}
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </Button>
          <DialogHeader>
            <DialogTitle>{t("tasks.confirmCompleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("tasks.confirmCompleteDescription", {
                title: pendingCompleteTask?.title ?? t("tasks.fallbackTitle"),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingCompleteTask(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void onConfirmCompleteTask()}
            >
              {t("tasks.confirmCompleteAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
