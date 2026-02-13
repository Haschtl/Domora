import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  BarChart3,
  CheckSquare,
  FileText,
  Home,
  LayoutList,
  Settings,
  ShoppingCart,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { isSupabaseConfigured } from "./lib/supabase";
import type { AppTab } from "./lib/types";
import { AppParticlesBackground } from "./components/app-particles-background";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { AuthView } from "./features/AuthView";
import { HouseholdSetupView } from "./features/HouseholdSetupView";
import { FinancesTab } from "./features/tabs/FinancesTab";
import { HomeTab } from "./features/tabs/HomeTab";
import { SettingsTab } from "./features/tabs/SettingsTab";
import { ShoppingTab } from "./features/tabs/ShoppingTab";
import { TasksTab } from "./features/tabs/TasksTab";
import { useWorkspaceController } from "./hooks/useWorkspaceController";

const tabPathMap: Record<AppTab, string> = {
  home: "/home/summary",
  shopping: "/shopping/list",
  tasks: "/tasks/overview",
  finances: "/finances/overview",
  settings: "/settings/me"
};

type HomeSubTab = "summary" | "feed";
type ShoppingSubTab = "list" | "history";
type TaskSubTab = "overview" | "stats" | "history";
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
  if (pathname.startsWith("/home/feed")) return "feed";
  return "summary";
};

const resolveTaskSubTabFromPathname = (pathname: string): TaskSubTab => {
  if (pathname.startsWith("/tasks/stats")) return "stats";
  if (pathname.startsWith("/tasks/history")) return "history";
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

const homeSubPathMap: Record<HomeSubTab, "/home/summary" | "/home/feed"> = {
  summary: "/home/summary",
  feed: "/home/feed"
};

const taskSubPathMap: Record<TaskSubTab, "/tasks/overview" | "/tasks/stats" | "/tasks/history"> = {
  overview: "/tasks/overview",
  stats: "/tasks/stats",
  history: "/tasks/history"
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
    activeHousehold,
    shoppingItems,
    shoppingCompletions,
    tasks,
    taskCompletions,
    finances,
    financeSubscriptions,
    cashAuditRequests,
    householdMembers,
    memberPimpers,
    userId,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    currentMember,
    completedTasks,
    notificationPermission,
    setActiveHousehold,
    onSignIn,
    onSignUp,
    onGoogleSignIn,
    onSignOut,
    onCreateHousehold,
    onJoinHousehold,
    onAddShoppingItem,
    onToggleShoppingItem,
    onDeleteShoppingItem,
    onAddTask,
    onCompleteTask,
    onSkipTask,
    onTakeoverTask,
    onToggleTaskActive,
    onUpdateTask,
    onDeleteTask,
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
    onUpdateUserAvatar,
    onUpdateUserDisplayName,
    onLeaveHousehold,
    onDissolveHousehold,
    onSetMemberRole,
    onRemoveMember
  } = useWorkspaceController();

  const tab = useMemo(() => resolveTabFromPathname(location.pathname), [location.pathname]);
  const homeSubTab = useMemo(() => resolveHomeSubTabFromPathname(location.pathname), [location.pathname]);
  const shoppingSubTab = useMemo(() => resolveShoppingSubTabFromPathname(location.pathname), [location.pathname]);
  const taskSubTab = useMemo(() => resolveTaskSubTabFromPathname(location.pathname), [location.pathname]);
  const financeSubTab = useMemo(() => resolveFinanceSubTabFromPathname(location.pathname), [location.pathname]);
  const settingsSubTab = useMemo(() => resolveSettingsSubTabFromPathname(location.pathname), [location.pathname]);
  const dueTasksCount = useMemo(() => {
    const now = Date.now();
    return tasks.filter((task) => task.is_active && !task.done && new Date(task.due_at).getTime() <= now).length;
  }, [tasks]);
  const initialInviteCode = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return (params.get("invite") ?? "").trim().toUpperCase();
  }, [location.pathname]);

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
          { id: "history", icon: FileText, labelKey: "subnav.tasks.history", path: taskSubPathMap.history }
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

  return (
    <div className="relative min-h-screen">
      <AppParticlesBackground />
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-7xl p-4 pb-10 text-slate-900 dark:text-slate-100 sm:p-6">
      {!isSupabaseConfigured ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/60">
          <CardHeader>
            <CardTitle>{t("app.supabaseMissingTitle")}</CardTitle>
            <CardDescription>{t("app.supabaseMissingDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loadingSession ? <p className="text-sm text-slate-700 dark:text-slate-300">{t("app.loadingSession")}</p> : null}

      {!loadingSession && !session ? (
        <AuthView busy={busy} onSignIn={onSignIn} onSignUp={onSignUp} onGoogleSignIn={onGoogleSignIn} />
      ) : null}

      {!loadingSession && session && !activeHousehold ? (
        <HouseholdSetupView
          households={households}
          busy={busy}
          initialInviteCode={initialInviteCode}
          onCreate={onCreateHousehold}
          onJoin={onJoinHousehold}
          onSelect={(household) => setActiveHousehold(household)}
          onSignOut={onSignOut}
        />
      ) : null}

      {!loadingSession && session && activeHousehold ? (
        <section className="pb-24 sm:pb-0">
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
                          {item.id === "tasks" && dueTasksCount > 0 ? (
                            <span className="absolute right-2 top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-brand-200 bg-brand-500 px-1.5 text-[10px] font-semibold leading-none text-white dark:border-brand-700 dark:bg-brand-600">
                              {dueTasksCount}
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
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
                      completedTasks={completedTasks}
                      totalTasks={tasks.length}
                      tasks={tasks}
                      taskCompletions={taskCompletions}
                      shoppingCompletions={shoppingCompletions}
                      financeEntries={finances}
                      cashAuditRequests={cashAuditRequests}
                      onSelectHousehold={(householdId) => {
                        const next = households.find((entry: { id: string }) => entry.id === householdId);
                        if (next) setActiveHousehold(next);
                      }}
                      onSaveLandingMarkdown={onUpdateHomeMarkdown}
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
                      onAdd={onAddShoppingItem}
                      onToggle={onToggleShoppingItem}
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
                      notificationPermission={notificationPermission}
                      onEnableNotifications={onEnableNotifications}
                      onAdd={onAddTask}
                      onComplete={onCompleteTask}
                      onSkip={onSkipTask}
                      onTakeover={onTakeoverTask}
                      onToggleActive={onToggleTaskActive}
                      onUpdate={onUpdateTask}
                      onDelete={onDeleteTask}
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
                      onAdd={onAddFinanceEntry}
                      onUpdateEntry={onUpdateFinanceEntry}
                      onDeleteEntry={onDeleteFinanceEntry}
                      onAddSubscription={onAddFinanceSubscription}
                      onUpdateSubscription={onUpdateFinanceSubscription}
                      onDeleteSubscription={onDeleteFinanceSubscription}
                      onUpdateHousehold={onUpdateHousehold}
                      onUpdateMemberSettings={onUpdateMemberSettings}
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
                      busy={busy}
                      onUpdateHousehold={onUpdateHousehold}
                      onUpdateUserAvatar={onUpdateUserAvatar}
                      onUpdateUserDisplayName={onUpdateUserDisplayName}
                      onSetMemberRole={onSetMemberRole}
                      onRemoveMember={onRemoveMember}
                      onSignOut={onSignOut}
                      onLeaveHousehold={onLeaveHouseholdWithRedirect}
                      onDissolveHousehold={onDissolveHouseholdWithRedirect}
                    />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

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
                      {item.id === "tasks" && dueTasksCount > 0 ? (
                        <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border border-brand-200 bg-brand-500 px-1 text-[9px] font-semibold leading-none text-white dark:border-brand-700 dark:bg-brand-600">
                          {dueTasksCount}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </section>
      ) : null}
      </div>
    </div>
  );
};

export default App;
