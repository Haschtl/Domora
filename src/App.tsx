import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  CheckSquare,
  FileText,
  Home,
  LayoutList,
  Settings,
  ShoppingCart,
  Wallet,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { isSupabaseConfigured } from "./lib/supabase";
import { useForegroundPush } from "./hooks/useForegroundPush";
import { isDueNow } from "./lib/date";
import { getForegroundPushRoute } from "./lib/push-navigation";
import type { AppTab } from "./lib/types";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { useWorkspaceController } from "./hooks/useWorkspaceController";

const AuthView = lazy(() => import("./features/AuthView").then((module) => ({ default: module.AuthView })));
const HouseholdSetupView = lazy(() =>
  import("./features/HouseholdSetupView").then((module) => ({ default: module.HouseholdSetupView }))
);
const HomeTab = lazy(() => import("./features/tabs/HomeTab").then((module) => ({ default: module.HomeTab })));
const ShoppingTab = lazy(() =>
  import("./features/tabs/ShoppingTab").then((module) => ({ default: module.ShoppingTab }))
);
const TasksTab = lazy(() => import("./features/tabs/TasksTab").then((module) => ({ default: module.TasksTab })));
const FinancesTab = lazy(() =>
  import("./features/tabs/FinancesTab").then((module) => ({ default: module.FinancesTab }))
);
const SettingsTab = lazy(() =>
  import("./features/tabs/SettingsTab").then((module) => ({ default: module.SettingsTab }))
);
const AppParticlesBackground = lazy(() =>
  import("./components/app-particles-background").then((module) => ({ default: module.AppParticlesBackground }))
);

const tabPathMap: Record<AppTab, string> = {
  home: "/home/summary",
  shopping: "/shopping/list",
  tasks: "/tasks/overview",
  finances: "/finances/overview",
  settings: "/settings/me"
};

type HomeSubTab = "summary" | "bucket" | "feed";
type ShoppingSubTab = "list" | "history";
type TaskSubTab = "overview" | "stats" | "history" | "settings";
type FinanceSubTab = "overview" | "stats" | "archive" | "subscriptions";
type SettingsSubTab = "me" | "household";

const resolveTabFromPathname = (pathname: string): AppTab => {
  if (pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/shopping")) return "shopping";
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/finances")) return "finances";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
};

const resolveHomeSubTabFromPathname = (pathname: string): HomeSubTab => {
  if (pathname.startsWith("/home/bucket")) return "bucket";
  if (pathname.startsWith("/home/feed")) return "feed";
  return "summary";
};

const resolveTaskSubTabFromPathname = (pathname: string): TaskSubTab => {
  if (pathname.startsWith("/tasks/stats")) return "stats";
  if (pathname.startsWith("/tasks/history")) return "history";
  if (pathname.startsWith("/tasks/settings")) return "settings";
  return "overview";
};

const resolveShoppingSubTabFromPathname = (pathname: string): ShoppingSubTab => {
  if (pathname.startsWith("/shopping/history")) return "history";
  return "list";
};

const resolveFinanceSubTabFromPathname = (pathname: string): FinanceSubTab => {
  if (pathname.startsWith("/finances/stats")) return "stats";
  if (pathname.startsWith("/finances/archive")) return "archive";
  if (pathname.startsWith("/finances/subscriptions")) return "subscriptions";
  return "overview";
};

const resolveSettingsSubTabFromPathname = (pathname: string): SettingsSubTab => {
  if (pathname.startsWith("/settings/household")) return "household";
  return "me";
};

const tabItems: Array<{ id: AppTab; icon: LucideIcon }> = [
  { id: "home", icon: Home },
  { id: "shopping", icon: ShoppingCart },
  { id: "tasks", icon: CheckSquare },
  { id: "finances", icon: Wallet },
  { id: "settings", icon: Settings }
];

const homeSubPathMap: Record<HomeSubTab, "/home/summary" | "/home/bucket" | "/home/feed"> = {
  summary: "/home/summary",
  bucket: "/home/bucket",
  feed: "/home/feed"
};

const taskSubPathMap: Record<TaskSubTab, "/tasks/overview" | "/tasks/stats" | "/tasks/history" | "/tasks/settings"> = {
  overview: "/tasks/overview",
  stats: "/tasks/stats",
  history: "/tasks/history",
  settings: "/tasks/settings"
};
const shoppingSubPathMap: Record<ShoppingSubTab, "/shopping/list" | "/shopping/history"> = {
  list: "/shopping/list",
  history: "/shopping/history"
};

const financeSubPathMap: Record<
  FinanceSubTab,
  "/finances/overview" | "/finances/stats" | "/finances/archive" | "/finances/subscriptions"
> = {
  overview: "/finances/overview",
  stats: "/finances/stats",
  archive: "/finances/archive",
  subscriptions: "/finances/subscriptions"
};
const settingsSubPathMap: Record<SettingsSubTab, "/settings/me" | "/settings/household"> = {
  me: "/settings/me",
  household: "/settings/household"
};

const LOADING_OVERLAY_EXTRA_MS = 500;
const LOADING_OVERLAY_FADE_MS = 260;
const PUSH_PROMPT_SNOOZE_MS = 24 * 60 * 60 * 1000;

const buildPushPromptStorageKey = (userId: string, householdId: string) =>
  `domora-push-prompt:${userId}:${householdId}`;

type PushPromptState = {
  dismissedAt?: number;
  enabledAt?: number;
};

const App = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    session,
    loadingSession,
    busy,
    error,
    message,
    households,
    householdsLoadError,
    activeHousehold,
    shoppingItems,
    bucketItems,
    shoppingCompletions,
    tasks,
    taskCompletions,
    finances,
    financeSubscriptions,
    cashAuditRequests,
    householdEvents,
    householdMembers,
    memberPimpers,
    userId,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    currentMember,
    notificationPermission,
    setActiveHousehold,
    onSignIn,
    onSignUp,
    onGoogleSignIn,
    onSignOut,
    onCreateHousehold,
    onJoinHousehold,
    onAddShoppingItem,
    onAddBucketItem,
    onToggleBucketItem,
    onUpdateBucketItem,
    onDeleteBucketItem,
    onToggleBucketDateVote,
    onToggleShoppingItem,
    onUpdateShoppingItem,
    onDeleteShoppingItem,
    onAddTask,
    onCompleteTask,
    onSkipTask,
    onTakeoverTask,
    onToggleTaskActive,
    onUpdateTask,
    onDeleteTask,
    onRateTaskCompletion,
    onAddFinanceEntry,
    onUpdateFinanceEntry,
    onDeleteFinanceEntry,
    onAddFinanceSubscription,
    onUpdateFinanceSubscription,
    onDeleteFinanceSubscription,
    onRequestCashAudit,
    onEnableNotifications,
    onUpdateHomeMarkdown,
    onUpdateHousehold,
    onUpdateMemberSettings,
    onUpdateMemberSettingsForUser,
    onUpdateMemberTaskLaziness,
    onUpdateVacationMode,
    onResetHouseholdPimpers,
    onUpdateUserAvatar,
    onUpdateUserDisplayName,
    onUpdateUserColor,
    onUpdateUserPaymentHandles,
    onLeaveHousehold,
    onDissolveHousehold,
    onSetMemberRole,
    onRemoveMember
  } = useWorkspaceController();

  const handleForegroundPush = useCallback(
    (data: Record<string, string>) => {
      navigate({ to: getForegroundPushRoute(data) });
    },
    [navigate]
  );

  useForegroundPush({
    enabled: notificationPermission === "granted",
    onNavigate: handleForegroundPush
  });

  const tab = useMemo(() => resolveTabFromPathname(location.pathname), [location.pathname]);
  const paymentRedirectStatus = useMemo<"success" | "cancel" | null>(() => {
    if (location.pathname.startsWith("/redirect-payment/success")) return "success";
    if (location.pathname.startsWith("/redirect-payment/cancel")) return "cancel";
    return null;
  }, [location.pathname]);
  const homeSubTab = useMemo(() => resolveHomeSubTabFromPathname(location.pathname), [location.pathname]);
  const shoppingSubTab = useMemo(() => resolveShoppingSubTabFromPathname(location.pathname), [location.pathname]);
  const taskSubTab = useMemo(() => resolveTaskSubTabFromPathname(location.pathname), [location.pathname]);
  const financeSubTab = useMemo(() => resolveFinanceSubTabFromPathname(location.pathname), [location.pathname]);
  const settingsSubTab = useMemo(() => resolveSettingsSubTabFromPathname(location.pathname), [location.pathname]);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(loadingSession);
  const [loadingOverlayOpaque, setLoadingOverlayOpaque] = useState(loadingSession);
  const [isPushPromptOpen, setIsPushPromptOpen] = useState(false);
  const loadingOverlayDelayTimerRef = useRef<number | null>(null);
  const loadingOverlayHideTimerRef = useRef<number | null>(null);
  const dueTasksBadge = useMemo(() => {
    const dueTasks = tasks.filter((task) => task.is_active && !task.done && isDueNow(task.due_at));
    const allDue = dueTasks.length;
    const myDue = userId ? dueTasks.filter((task) => task.assignee_id === userId).length : 0;
    return {
      myDue,
      allDue,
      label: `${myDue}/${allDue}`
    };
  }, [tasks, userId]);
  const initialInviteCode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("invite") ?? "").trim().toUpperCase();
  }, [location.search]);

  const onTabChange = (value: string) => {
    const nextTab = value as AppTab;
    const nextPath = tabPathMap[nextTab] ?? "/home";

    if (nextPath === location.pathname) return;
    void navigate({ to: nextPath });
  };

  const onLeaveHouseholdWithRedirect = async () => {
    await onLeaveHousehold();
    if (location.pathname.startsWith("/settings")) {
      void navigate({ to: "/home" });
    }
  };

  const onDissolveHouseholdWithRedirect = async () => {
    await onDissolveHousehold();
    if (location.pathname.startsWith("/settings")) {
      void navigate({ to: "/home" });
    }
  };

  const subItems: Array<{ id: string; icon: LucideIcon; labelKey: string; path: string }> =
    tab === "home"
      ? [
          { id: "summary", icon: LayoutList, labelKey: "subnav.home.summary", path: homeSubPathMap.summary },
          { id: "bucket", icon: CheckSquare, labelKey: "subnav.home.bucket", path: homeSubPathMap.bucket },
          { id: "feed", icon: FileText, labelKey: "subnav.home.feed", path: homeSubPathMap.feed }
        ]
      : tab === "shopping"
      ? [
          { id: "list", icon: LayoutList, labelKey: "subnav.shopping.list", path: shoppingSubPathMap.list },
          { id: "history", icon: FileText, labelKey: "subnav.shopping.history", path: shoppingSubPathMap.history }
        ]
      : tab === "tasks"
      ? [
          { id: "overview", icon: LayoutList, labelKey: "subnav.tasks.overview", path: taskSubPathMap.overview },
          { id: "stats", icon: BarChart3, labelKey: "subnav.tasks.stats", path: taskSubPathMap.stats },
          { id: "history", icon: Archive, labelKey: "subnav.tasks.history", path: taskSubPathMap.history },
          { id: "settings", icon: Settings, labelKey: "subnav.tasks.settings", path: taskSubPathMap.settings }
        ]
      : tab === "finances"
        ? [
            {
              id: "overview",
              icon: LayoutList,
              labelKey: "subnav.finances.overview",
              path: financeSubPathMap.overview
            },
            { id: "stats", icon: BarChart3, labelKey: "subnav.finances.stats", path: financeSubPathMap.stats },
            {
              id: "archive",
              icon: Archive,
              labelKey: "subnav.finances.archive",
              path: financeSubPathMap.archive
            },
            {
              id: "subscriptions",
              icon: FileText,
              labelKey: "subnav.finances.subscriptions",
              path: financeSubPathMap.subscriptions
            }
          ]
        : tab === "settings"
          ? [
              { id: "me", icon: Settings, labelKey: "subnav.settings.me", path: settingsSubPathMap.me },
              {
                id: "household",
                icon: Home,
                labelKey: "subnav.settings.household",
                path: settingsSubPathMap.household
              }
            ]
        : [];

  const activeSubPath =
    tab === "home"
      ? homeSubPathMap[homeSubTab]
      : tab === "shopping"
      ? shoppingSubPathMap[shoppingSubTab]
      : tab === "tasks"
      ? taskSubPathMap[taskSubTab]
      : tab === "finances"
        ? financeSubPathMap[financeSubTab]
        : tab === "settings"
          ? settingsSubPathMap[settingsSubTab]
          : "";
  const mobileSubItems: Array<{ id: string; icon: LucideIcon; labelKey: string; path: string }> =
    subItems.length > 0
      ? subItems
      : [
          {
            id: tab,
            icon: tabItems.find((item) => item.id === tab)?.icon ?? Home,
            labelKey: `tab.${tab}`,
            path: tabPathMap[tab]
          }
        ];
  const activeMobileSubPath = subItems.length > 0 ? activeSubPath : tabPathMap[tab];
  const hasSingleMobileSubItem = mobileSubItems.length === 1;
  const viewLoadingFallback = (
    <Card>
      <CardHeader>
        <CardTitle>{t("app.loadingSession")}</CardTitle>
        <CardDescription>{t("app.brand")}</CardDescription>
      </CardHeader>
    </Card>
  );

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (message) toast.success(message);
  }, [message]);

  useEffect(() => {
    const brand = t("app.brand");
    const householdName = activeHousehold?.name?.trim();
    document.title = householdName ? `${householdName} | ${brand}` : brand;
  }, [activeHousehold?.name, t]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    let maxViewportHeight = viewport?.height ?? window.innerHeight;
    let rafId: number | null = null;

    const isInputLikeElement = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const tag = element.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || element.isContentEditable;
    };

    const updateKeyboardState = () => {
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const isMobileViewport = viewportWidth < 640;
      if (!isMobileViewport) {
        maxViewportHeight = viewport?.height ?? window.innerHeight;
        setIsMobileKeyboardOpen(false);
        return;
      }

      const currentHeight = viewport?.height ?? window.innerHeight;
      if (currentHeight > maxViewportHeight) {
        maxViewportHeight = currentHeight;
      }

      const keyboardHeightDelta = maxViewportHeight - currentHeight;
      const hasInputFocus = isInputLikeElement(document.activeElement);
      setIsMobileKeyboardOpen(keyboardHeightDelta > 140 && hasInputFocus);
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(updateKeyboardState);
    };

    updateKeyboardState();
    viewport?.addEventListener("resize", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("focusin", scheduleUpdate);
    document.addEventListener("focusout", scheduleUpdate);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      viewport?.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("focusin", scheduleUpdate);
      document.removeEventListener("focusout", scheduleUpdate);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let immediateTimer: number | null = null;
    if (loadingOverlayDelayTimerRef.current !== null) {
      window.clearTimeout(loadingOverlayDelayTimerRef.current);
      loadingOverlayDelayTimerRef.current = null;
    }
    if (loadingOverlayHideTimerRef.current !== null) {
      window.clearTimeout(loadingOverlayHideTimerRef.current);
      loadingOverlayHideTimerRef.current = null;
    }

    if (loadingSession) {
      immediateTimer = window.setTimeout(() => {
        setShowLoadingOverlay(true);
        setLoadingOverlayOpaque(true);
      }, 0);
      return;
    }

    loadingOverlayDelayTimerRef.current = window.setTimeout(() => {
      setLoadingOverlayOpaque(false);
      loadingOverlayHideTimerRef.current = window.setTimeout(() => {
        setShowLoadingOverlay(false);
      }, LOADING_OVERLAY_FADE_MS);
    }, LOADING_OVERLAY_EXTRA_MS);

    return () => {
      if (immediateTimer !== null) {
        window.clearTimeout(immediateTimer);
      }
      if (loadingOverlayDelayTimerRef.current !== null) {
        window.clearTimeout(loadingOverlayDelayTimerRef.current);
        loadingOverlayDelayTimerRef.current = null;
      }
      if (loadingOverlayHideTimerRef.current !== null) {
        window.clearTimeout(loadingOverlayHideTimerRef.current);
        loadingOverlayHideTimerRef.current = null;
      }
    };
  }, [loadingSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let nextOpen = false;

    if (session && activeHousehold && userId && notificationPermission === "default") {
      const promptKey = buildPushPromptStorageKey(userId, activeHousehold.id);
      try {
        const rawValue = window.localStorage.getItem(promptKey);
        const parsed = rawValue ? (JSON.parse(rawValue) as PushPromptState) : null;
        const dismissedAt = parsed?.dismissedAt ?? 0;
        const enabledAt = parsed?.enabledAt ?? 0;

        nextOpen = enabledAt <= 0 && !(dismissedAt > 0 && Date.now() - dismissedAt < PUSH_PROMPT_SNOOZE_MS);
      } catch {
        nextOpen = true;
      }
    }

    const timerId = window.setTimeout(() => {
      setIsPushPromptOpen(nextOpen);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activeHousehold, notificationPermission, session, userId]);

  const onPushPromptEnable = async () => {
    if (!activeHousehold || !userId || typeof window === "undefined") return;
    const promptKey = buildPushPromptStorageKey(userId, activeHousehold.id);
    try {
      window.localStorage.setItem(promptKey, JSON.stringify({ enabledAt: Date.now() } satisfies PushPromptState));
    } catch {
      // ignore storage failures
    }
    setIsPushPromptOpen(false);
    await onEnableNotifications();
  };

  const onPushPromptLater = () => {
    if (!activeHousehold || !userId || typeof window === "undefined") {
      setIsPushPromptOpen(false);
      return;
    }
    const promptKey = buildPushPromptStorageKey(userId, activeHousehold.id);
    try {
      window.localStorage.setItem(promptKey, JSON.stringify({ dismissedAt: Date.now() } satisfies PushPromptState));
    } catch {
      // ignore storage failures
    }
    setIsPushPromptOpen(false);
  };

  if (paymentRedirectStatus) {
    const isSuccess = paymentRedirectStatus === "success";
    const Icon = isSuccess ? CheckCircle2 : XCircle;
    return (
      <div className="relative min-h-screen">
        <Suspense fallback={null}>
          <AppParticlesBackground />
        </Suspense>
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center p-4 text-slate-900 dark:text-slate-100 sm:p-6">
          <Card className="w-full border-brand-200 bg-white/95 dark:border-slate-700 dark:bg-slate-900/90">
            <CardHeader>
              <div className="mb-2 flex items-center gap-2">
                <Icon className={isSuccess ? "h-5 w-5 text-emerald-600 dark:text-emerald-400" : "h-5 w-5 text-rose-600 dark:text-rose-400"} />
                <CardTitle>
                  {isSuccess ? t("app.paymentRedirectSuccessTitle") : t("app.paymentRedirectCancelTitle")}
                </CardTitle>
              </div>
              <CardDescription>
                {isSuccess ? t("app.paymentRedirectSuccessDescription") : t("app.paymentRedirectCancelDescription")}
              </CardDescription>
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    void navigate({ to: "/finances/overview" });
                  }}
                >
                  {t("app.paymentRedirectBackToFinances")}
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <Suspense fallback={null}>
        <AppParticlesBackground />
      </Suspense>
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-7xl p-4 pb-10 text-slate-900 dark:text-slate-100 sm:p-6">
      {!isSupabaseConfigured ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/60">
          <CardHeader>
            <CardTitle>{t("app.supabaseMissingTitle")}</CardTitle>
            <CardDescription>{t("app.supabaseMissingDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!loadingSession && !session ? (
        <Suspense fallback={viewLoadingFallback}>
          <AuthView busy={busy} onSignIn={onSignIn} onSignUp={onSignUp} onGoogleSignIn={onGoogleSignIn} />
        </Suspense>
      ) : null}

      {!loadingSession && session && !activeHousehold ? (
        householdsLoadError ? (
          <Card className="mb-4 border border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/60">
            <CardHeader>
              <CardTitle>{t("app.householdsLoadErrorTitle")}</CardTitle>
              <CardDescription>
                {t("app.householdsLoadErrorDescription")}
                <br />
                <span className="font-mono text-xs">{householdsLoadError}</span>
              </CardDescription>
              <div className="pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-900/60"
                  onClick={() => void onSignOut()}
                >
                  {t("common.logout")}
                </button>
              </div>
            </CardHeader>
          </Card>
        ) : (
        <Suspense fallback={viewLoadingFallback}>
          <HouseholdSetupView
            households={households}
            busy={busy}
            initialInviteCode={initialInviteCode}
            onCreate={onCreateHousehold}
            onJoin={onJoinHousehold}
            onSelect={(household) => setActiveHousehold(household)}
            onSignOut={onSignOut}
          />
        </Suspense>
        )
      ) : null}

      {!loadingSession && session && activeHousehold ? (
        <section className={isMobileKeyboardOpen ? "pb-0 sm:pb-0" : "pb-24 sm:pb-0"}>
          <div className="sm:grid sm:grid-cols-[230px_minmax(0,1fr)] sm:gap-6">
            <aside className="hidden sm:block">
              <div className="sticky top-6 rounded-2xl border border-brand-100 bg-white/90 p-3 shadow-card dark:border-slate-700 dark:bg-slate-900/80">
                <ul className="space-y-1">
                  {tabItems.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={
                            active
                              ? "relative flex w-full items-center gap-2 rounded-lg bg-brand-100 px-3 py-2 text-left text-sm font-medium text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                              : "relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          }
                          onClick={() => onTabChange(item.id)}
                        >
                          <Icon className="h-4 w-4" />
                          {t(`tab.${item.id}`)}
                          {item.id === "tasks" && dueTasksBadge.allDue > 0 ? (
                            <span className="absolute right-2 top-1 inline-flex min-h-5 items-center justify-center rounded-md border border-brand-200 bg-brand-500 px-1.5 text-[10px] font-semibold leading-none text-white dark:border-brand-700 dark:bg-brand-600">
                              {dueTasksBadge.label}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {subItems.length > 0 ? (
                  <div className="mt-4 border-t border-brand-100 pt-3 dark:border-slate-700">
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      {t("subnav.title")}
                    </p>
                    <ul className="space-y-1">
                      {subItems.map((item) => {
                        const Icon = item.icon;
                        const active = activeSubPath === item.path;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => void navigate({ to: item.path })}
                              className={
                                active
                                  ? "flex w-full items-center gap-2 rounded-lg bg-brand-100 px-3 py-2 text-left text-sm font-medium text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                                  : "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800"
                              }
                            >
                              <Icon className="h-4 w-4" />
                              {t(item.labelKey)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </aside>

            <div className="pt-24 sm:pt-0 lg:pt-0">
              {mobileSubItems.length > 0 ? (
                <div className="fixed inset-x-0 top-0 z-40 border-b border-brand-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:hidden">
                  <div className="mx-auto max-w-7xl">
                    <div className="mb-2 px-1">
                      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {t(`tab.${tab}`)}
                      </p>
                    </div>
                    <ul
                      className={
                        hasSingleMobileSubItem
                          ? "invisible grid grid-cols-1 gap-1"
                          : mobileSubItems.length > 3
                            ? "grid grid-cols-4 gap-1"
                            : "grid grid-cols-3 gap-1"
                      }
                      aria-hidden={hasSingleMobileSubItem}
                    >
                      {mobileSubItems.map((item) => {
                        const Icon = item.icon;
                        const active = activeMobileSubPath === item.path;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => void navigate({ to: item.path })}
                              className={
                                active
                                  ? "flex w-full items-center justify-center gap-1 rounded-lg bg-brand-100 px-2 py-2 text-xs font-medium text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                                  : "flex w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-600 dark:text-slate-300"
                              }
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{t(item.labelKey)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              ) : null}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={isMobileViewport ? { opacity: 0 } : { opacity: 0, y: 10 }}
                  animate={isMobileViewport ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={isMobileViewport ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <Suspense fallback={viewLoadingFallback}>
                    {tab === "home" ? (
                      <HomeTab
                        section={homeSubTab}
                        household={activeHousehold}
                        households={households}
                        currentMember={currentMember}
                        userId={userId!}
                        members={householdMembers}
                        userLabel={userDisplayName ?? userEmail}
                        busy={busy}
                        mobileTabBarVisible={!isMobileKeyboardOpen}
                        bucketItems={bucketItems}
                        tasks={tasks}
                        taskCompletions={taskCompletions}
                        financeEntries={finances}
                        cashAuditRequests={cashAuditRequests}
                        householdEvents={householdEvents}
                        onSelectHousehold={(householdId) => {
                          const next = households.find((entry: { id: string }) => entry.id === householdId);
                          if (next) setActiveHousehold(next);
                        }}
                        onSaveLandingMarkdown={onUpdateHomeMarkdown}
                        onAddBucketItem={onAddBucketItem}
                        onToggleBucketItem={onToggleBucketItem}
                        onUpdateBucketItem={onUpdateBucketItem}
                        onDeleteBucketItem={onDeleteBucketItem}
                        onToggleBucketDateVote={onToggleBucketDateVote}
                        onCompleteTask={onCompleteTask}
                      />
                    ) : null}

                    {tab === "shopping" ? (
                      <ShoppingTab
                        section={shoppingSubTab}
                        items={shoppingItems}
                        completions={shoppingCompletions}
                        members={householdMembers}
                        userId={userId!}
                        busy={busy}
                        mobileTabBarVisible={!isMobileKeyboardOpen}
                        onAdd={onAddShoppingItem}
                        onToggle={onToggleShoppingItem}
                        onUpdate={onUpdateShoppingItem}
                        onDelete={onDeleteShoppingItem}
                      />
                    ) : null}

                    {tab === "tasks" ? (
                      <TasksTab
                        section={taskSubTab}
                        tasks={tasks}
                        completions={taskCompletions}
                        members={householdMembers}
                        memberPimpers={memberPimpers}
                        userId={userId!}
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
                    ) : null}

                    {tab === "finances" ? (
                      <FinancesTab
                        section={financeSubTab}
                        entries={finances}
                        subscriptions={financeSubscriptions}
                        cashAuditRequests={cashAuditRequests}
                        household={activeHousehold}
                        currentMember={currentMember}
                        members={householdMembers}
                        busy={busy}
                        userId={userId!}
                        mobileTabBarVisible={!isMobileKeyboardOpen}
                        onAdd={onAddFinanceEntry}
                        onUpdateEntry={onUpdateFinanceEntry}
                        onDeleteEntry={onDeleteFinanceEntry}
                        onAddSubscription={onAddFinanceSubscription}
                        onUpdateSubscription={onUpdateFinanceSubscription}
                        onDeleteSubscription={onDeleteFinanceSubscription}
                        onUpdateHousehold={onUpdateHousehold}
                        onUpdateMemberSettings={onUpdateMemberSettings}
                        onUpdateMemberSettingsForUser={onUpdateMemberSettingsForUser}
                        onRequestCashAudit={onRequestCashAudit}
                      />
                    ) : null}

                    {tab === "settings" ? (
                      <SettingsTab
                        section={settingsSubTab}
                        household={activeHousehold}
                        members={householdMembers}
                        currentMember={currentMember}
                        userId={userId!}
                        userEmail={userEmail}
                        userAvatarUrl={userAvatarUrl}
                        userDisplayName={userDisplayName}
                        userPaypalName={userPaypalName}
                        userRevolutName={userRevolutName}
                        userWeroName={userWeroName}
                        busy={busy}
                        notificationPermission={notificationPermission}
                        onEnableNotifications={onEnableNotifications}
                        onUpdateHousehold={onUpdateHousehold}
                        onUpdateUserAvatar={onUpdateUserAvatar}
                        onUpdateUserDisplayName={onUpdateUserDisplayName}
                        onUpdateUserColor={onUpdateUserColor}
                        onUpdateUserPaymentHandles={onUpdateUserPaymentHandles}
                        onUpdateVacationMode={onUpdateVacationMode}
                        onSetMemberRole={onSetMemberRole}
                        onRemoveMember={onRemoveMember}
                        onSignOut={onSignOut}
                        onLeaveHousehold={onLeaveHouseholdWithRedirect}
                        onDissolveHousehold={onDissolveHouseholdWithRedirect}
                      />
                    ) : null}
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {!isMobileKeyboardOpen ? (
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:hidden">
              <ul className="grid grid-cols-5 gap-1">
                {tabItems.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          active
                            ? "relative flex w-full flex-col items-center rounded-lg bg-brand-100 px-1 py-2 text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                            : "relative flex w-full flex-col items-center rounded-lg px-1 py-2 text-slate-500 dark:text-slate-400"
                        }
                        onClick={() => onTabChange(item.id)}
                        aria-label={t(`tab.${item.id}`)}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="mt-1 text-[10px] font-medium">{t(`tab.${item.id}`)}</span>
                        {item.id === "tasks" && dueTasksBadge.allDue > 0 ? (
                          <span className="absolute right-1 top-1 inline-flex min-h-4 items-center justify-center rounded-md border border-brand-200 bg-brand-500 px-1 text-[9px] font-semibold leading-none text-white dark:border-brand-700 dark:bg-brand-600">
                            {dueTasksBadge.label}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </section>
      ) : null}
      </div>
      {showLoadingOverlay ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-white/80 backdrop-blur-sm transition-opacity duration-300 dark:bg-slate-950/70"
          style={{ opacity: loadingOverlayOpaque ? 1 : 0 }}
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-200/70 bg-white/90 px-6 py-5 shadow-xl dark:border-slate-700 dark:bg-slate-900/90">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-slate-600 dark:border-t-brand-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("app.loadingSession")}</p>
          </div>
        </div>
      ) : null}
      <Dialog
        open={isPushPromptOpen}
        onOpenChange={(open) => {
          if (!open) onPushPromptLater();
        }}
      >
        <DialogContent className="z-[130] max-w-md border-brand-200/80 bg-white/95 dark:border-slate-700 dark:bg-slate-900/95">
          <DialogHeader>
            <DialogTitle>{t("app.pushPromptTitle")}</DialogTitle>
            <DialogDescription>{t("app.pushPromptDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onPushPromptLater}>
              {t("app.pushPromptLater")}
            </Button>
            <Button type="button" onClick={() => void onPushPromptEnable()}>
              {t("app.pushPromptEnable")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default App;
