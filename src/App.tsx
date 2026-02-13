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
  home: "/home",
  shopping: "/shopping",
  tasks: "/tasks/overview",
  finances: "/finances/overview",
  settings: "/settings"
};

type TaskSubTab = "overview" | "stats" | "history";
type FinanceSubTab = "overview" | "stats" | "archive" | "subscriptions";

const resolveTabFromPathname = (pathname: string): AppTab => {
  if (pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/shopping")) return "shopping";
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/finances")) return "finances";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
};

const resolveTaskSubTabFromPathname = (pathname: string): TaskSubTab => {
  if (pathname.startsWith("/tasks/stats")) return "stats";
  if (pathname.startsWith("/tasks/history")) return "history";
  return "overview";
};

const resolveFinanceSubTabFromPathname = (pathname: string): FinanceSubTab => {
  if (pathname.startsWith("/finances/stats")) return "stats";
  if (pathname.startsWith("/finances/archive")) return "archive";
  if (pathname.startsWith("/finances/subscriptions")) return "subscriptions";
  return "overview";
};

const tabItems: Array<{ id: AppTab; icon: LucideIcon }> = [
  { id: "home", icon: Home },
  { id: "shopping", icon: ShoppingCart },
  { id: "tasks", icon: CheckSquare },
  { id: "finances", icon: Wallet },
  { id: "settings", icon: Settings }
];

const taskSubPathMap: Record<TaskSubTab, "/tasks/overview" | "/tasks/stats" | "/tasks/history"> = {
  overview: "/tasks/overview",
  stats: "/tasks/stats",
  history: "/tasks/history"
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
    householdMembers,
    memberPimpers,
    userId,
    userEmail,
    userAvatarUrl,
    currentMember,
    completedTasks,
    notificationPermission,
    setActiveHousehold,
    onSignIn,
    onSignUp,
    onGoogleSignIn,
    onCreateHousehold,
    onJoinHousehold,
    onAddShoppingItem,
    onToggleShoppingItem,
    onDeleteShoppingItem,
    onAddTask,
    onCompleteTask,
    onAddFinanceEntry,
    onRequestCashAudit,
    onEnableNotifications,
    onUpdateHousehold,
    onUpdateMemberSettings,
    onUpdateUserAvatar,
    onLeaveHousehold
  } = useWorkspaceController();

  const tab = useMemo(() => resolveTabFromPathname(location.pathname), [location.pathname]);
  const taskSubTab = useMemo(() => resolveTaskSubTabFromPathname(location.pathname), [location.pathname]);
  const financeSubTab = useMemo(() => resolveFinanceSubTabFromPathname(location.pathname), [location.pathname]);
  const hasSubNav = tab === "tasks" || tab === "finances";

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

  const subItems: Array<{ id: string; icon: LucideIcon; labelKey: string; path: string }> =
    tab === "tasks"
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
        : [];

  const activeSubPath = tab === "tasks" ? taskSubPathMap[taskSubTab] : tab === "finances" ? financeSubPathMap[financeSubTab] : "";

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (message) toast.success(message);
  }, [message]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl p-4 pb-10 text-slate-900 dark:text-slate-100 sm:p-6">
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
          onCreate={onCreateHousehold}
          onJoin={onJoinHousehold}
          onSelect={(household) => setActiveHousehold(household)}
        />
      ) : null}

      {!loadingSession && session && activeHousehold ? (
        <section className="pb-24 lg:pb-0">
          <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
            <aside className="hidden lg:block">
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
                              ? "flex w-full items-center gap-2 rounded-lg bg-brand-100 px-3 py-2 text-left text-sm font-medium text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                              : "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          }
                          onClick={() => onTabChange(item.id)}
                        >
                          <Icon className="h-4 w-4" />
                          {t(`tab.${item.id}`)}
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

            <div className={hasSubNav ? "pt-16 sm:pt-0 lg:pt-0" : ""}>
              {subItems.length > 0 ? (
                <div className="fixed inset-x-0 top-0 z-40 border-b border-brand-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:hidden">
                  <div className="mx-auto max-w-7xl">
                    <ul className={subItems.length > 3 ? "grid grid-cols-4 gap-1" : "grid grid-cols-3 gap-1"}>
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
                      household={activeHousehold}
                      households={households}
                      userEmail={userEmail}
                      completedTasks={completedTasks}
                      totalTasks={tasks.length}
                      onSelectHousehold={(householdId) => {
                        const next = households.find((entry: { id: string }) => entry.id === householdId);
                        if (next) setActiveHousehold(next);
                      }}
                    />
                  ) : null}

                  {tab === "shopping" ? (
                    <ShoppingTab
                      items={shoppingItems}
                      completions={shoppingCompletions}
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
                    />
                  ) : null}

                  {tab === "finances" ? (
                    <FinancesTab
                      section={financeSubTab}
                      entries={finances}
                      members={householdMembers}
                      busy={busy}
                      userId={userId!}
                      onAdd={onAddFinanceEntry}
                      onRequestCashAudit={onRequestCashAudit}
                    />
                  ) : null}

                  {tab === "settings" ? (
                    <SettingsTab
                      household={activeHousehold}
                      currentMember={currentMember}
                      userEmail={userEmail}
                      userAvatarUrl={userAvatarUrl}
                      busy={busy}
                      onUpdateHousehold={onUpdateHousehold}
                      onUpdateMemberSettings={onUpdateMemberSettings}
                      onUpdateUserAvatar={onUpdateUserAvatar}
                      onLeaveHousehold={onLeaveHouseholdWithRedirect}
                    />
                  ) : null}
                </motion.div>
              </AnimatePresence>

              <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("app.tasksDone", { done: completedTasks, total: tasks.length })}
              </p>
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
                          ? "flex w-full flex-col items-center rounded-lg bg-brand-100 px-1 py-2 text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                          : "flex w-full flex-col items-center rounded-lg px-1 py-2 text-slate-500 dark:text-slate-400"
                      }
                      onClick={() => onTabChange(item.id)}
                      aria-label={t(`tab.${item.id}`)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="mt-1 text-[10px] font-medium">{t(`tab.${item.id}`)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </section>
      ) : null}
    </div>
  );
};

export default App;
