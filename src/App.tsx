import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { AnimatePresence, motion } from "framer-motion";
import { Home, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addFinanceEntry,
  addShoppingItem,
  addTask,
  completeTask,
  createHousehold,
  deleteShoppingItem,
  getCurrentSession,
  getFinanceEntries,
  getHouseholdMemberPimpers,
  getHouseholdMembers,
  getHouseholdsForUser,
  getShoppingCompletions,
  getShoppingItems,
  getTaskCompletions,
  getTasks,
  joinHouseholdByInvite,
  leaveHousehold,
  requestCashAudit,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  updateHouseholdSettings,
  updateMemberSettings,
  updateShoppingItemStatus,
  updateUserAvatar
} from "./lib/api";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type {
  AppTab,
  FinanceEntry,
  Household,
  HouseholdMember,
  HouseholdMemberPimpers,
  NewTaskInput,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "./lib/types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AuthView } from "./features/AuthView";
import { HouseholdSetupView } from "./features/HouseholdSetupView";
import { FinancesTab } from "./features/tabs/FinancesTab";
import { SettingsTab } from "./features/tabs/SettingsTab";
import { ShoppingTab } from "./features/tabs/ShoppingTab";
import { TasksTab } from "./features/tabs/TasksTab";
import { useTaskNotifications } from "./hooks/useTaskNotifications";

const tabPathMap: Record<AppTab, "/shopping" | "/tasks" | "/finances" | "/settings"> = {
  shopping: "/shopping",
  tasks: "/tasks",
  finances: "/finances",
  settings: "/settings"
};

const resolveTabFromPathname = (pathname: string): AppTab => {
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/finances")) return "finances";
  if (pathname.startsWith("/settings")) return "settings";
  return "shopping";
};

const App = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHousehold, setActiveHousehold] = useState<Household | null>(null);

  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [shoppingCompletions, setShoppingCompletions] = useState<ShoppingItemCompletion[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskCompletions, setTaskCompletions] = useState<TaskCompletion[]>([]);
  const [finances, setFinances] = useState<FinanceEntry[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [memberPimpers, setMemberPimpers] = useState<HouseholdMemberPimpers[]>([]);

  const userId = session?.user.id;
  const userEmail = session?.user.email;
  const userAvatarUrl = useMemo(() => {
    const raw = session?.user.user_metadata?.avatar_url;
    return typeof raw === "string" ? raw : null;
  }, [session?.user.user_metadata?.avatar_url]);
  const currentMember = useMemo(
    () => (userId ? householdMembers.find((entry) => entry.user_id === userId) ?? null : null),
    [householdMembers, userId]
  );
  const tab = useMemo(() => resolveTabFromPathname(location.pathname), [location.pathname]);

  const { permission, requestPermission } = useTaskNotifications(tasks, userId);

  const completedTasks = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);

  const withAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await action();
    } catch (err) {
      const text = err instanceof Error ? err.message : t("app.unknownError");
      setError(text);
    } finally {
      setBusy(false);
    }
  };

  const loadHouseholds = async (id: string) => {
    const loadedHouseholds = await getHouseholdsForUser(id);
    setHouseholds(loadedHouseholds);

    if (loadedHouseholds.length === 0) {
      setActiveHousehold(null);
      return;
    }

    setActiveHousehold((current) => {
      if (current && loadedHouseholds.some((entry) => entry.id === current.id)) {
        return current;
      }
      return loadedHouseholds[0];
    });
  };

  const loadWorkspaceData = async (householdId: string) => {
    const [loadedShopping, loadedShoppingCompletions, loadedTasks, loadedTaskCompletions, loadedFinances, loadedMembers, loadedPimpers] = await Promise.all([
      getShoppingItems(householdId),
      getShoppingCompletions(householdId),
      getTasks(householdId),
      getTaskCompletions(householdId),
      getFinanceEntries(householdId),
      getHouseholdMembers(householdId),
      getHouseholdMemberPimpers(householdId)
    ]);

    setShoppingItems(loadedShopping);
    setShoppingCompletions(loadedShoppingCompletions);
    setTasks(loadedTasks);
    setTaskCompletions(loadedTaskCompletions);
    setFinances(loadedFinances);
    setHouseholdMembers(loadedMembers);
    setMemberPimpers(loadedPimpers);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const currentSession = await getCurrentSession();
        setSession(currentSession);
      } catch (err) {
        const text = err instanceof Error ? err.message : t("app.sessionLoadError");
        setError(text);
      } finally {
        setLoadingSession(false);
      }
    };

    void bootstrap();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError(null);
      setMessage(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setHouseholds([]);
      setActiveHousehold(null);
      return;
    }

    void withAction(async () => {
      await loadHouseholds(userId);
    });
  }, [userId]);

  useEffect(() => {
    if (!activeHousehold) {
      setShoppingItems([]);
      setShoppingCompletions([]);
      setTasks([]);
      setTaskCompletions([]);
      setFinances([]);
      setHouseholdMembers([]);
      setMemberPimpers([]);
      return;
    }

    void withAction(async () => {
      await loadWorkspaceData(activeHousehold.id);
    });
  }, [activeHousehold?.id]);

  const onSignIn = async (email: string, password: string) => {
    await withAction(async () => {
      await signIn(email, password);
      setMessage(t("app.signInSuccess"));
    });
  };

  const onSignUp = async (email: string, password: string) => {
    await withAction(async () => {
      await signUp(email, password);
      setMessage(t("app.signUpSuccess"));
    });
  };

  const onSignOut = async () => {
    await withAction(async () => {
      await signOut();
    });
  };

  const onGoogleSignIn = async () => {
    await withAction(async () => {
      await signInWithGoogle();
    });
  };

  const onCreateHousehold = async (name: string) => {
    if (!userId) return;

    await withAction(async () => {
      const created = await createHousehold(name, userId);
      await loadHouseholds(userId);
      setActiveHousehold(created);
      setMessage(t("app.householdCreated", { name: created.name }));
    });
  };

  const onJoinHousehold = async (inviteCode: string) => {
    if (!userId) return;

    await withAction(async () => {
      const joined = await joinHouseholdByInvite(inviteCode, userId);
      await loadHouseholds(userId);
      setActiveHousehold(joined);
      setMessage(t("app.householdJoined", { name: joined.name }));
    });
  };

  const onAddShoppingItem = async (title: string, tags: string[], recurrenceIntervalMinutes: number | null) => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      const created = await addShoppingItem(activeHousehold.id, title, tags, recurrenceIntervalMinutes, userId);
      setShoppingItems((current) => [created, ...current]);
    });
  };

  const onToggleShoppingItem = async (item: ShoppingItem) => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      const nextDone = !item.done;
      await updateShoppingItemStatus(item.id, nextDone, userId);
      await loadWorkspaceData(activeHousehold.id);
    });
  };

  const onDeleteShoppingItem = async (item: ShoppingItem) => {
    await withAction(async () => {
      await deleteShoppingItem(item.id);
      setShoppingItems((current) => current.filter((entry) => entry.id !== item.id));
    });
  };

  const onAddTask = async (input: NewTaskInput) => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      const created = await addTask(activeHousehold.id, input, userId);
      setTasks((current) => [...current, created].sort((a, b) => a.due_at.localeCompare(b.due_at)));

      await loadWorkspaceData(activeHousehold.id);
    });
  };

  const onCompleteTask = async (task: TaskItem) => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      await completeTask(task.id, userId);
      await loadWorkspaceData(activeHousehold.id);
      setMessage(t("tasks.completedMessage", { title: task.title }));
    });
  };

  const onAddFinanceEntry = async (description: string, amount: number, category: string) => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      const created = await addFinanceEntry(activeHousehold.id, description, amount, category, userId);
      setFinances((current) => [created, ...current]);
    });
  };

  const onRequestCashAudit = async () => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      await requestCashAudit(activeHousehold.id, userId);
      setMessage(t("app.cashAuditQueued"));
    });
  };

  const onEnableNotifications = async () => {
    await withAction(async () => {
      const result = await requestPermission();
      if (result === "granted") {
        setMessage(t("app.pushEnabled"));
      } else {
        setError(t("app.pushDenied"));
      }
    });
  };

  const onUpdateHousehold = async (input: {
    imageUrl: string;
    address: string;
    currency: string;
    apartmentSizeSqm: number | null;
    warmRentMonthly: number | null;
  }) => {
    if (!activeHousehold) return;

    await withAction(async () => {
      const updated = await updateHouseholdSettings(activeHousehold.id, input);
      setHouseholds((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setActiveHousehold(updated);
      setMessage(t("settings.householdSaved"));
    });
  };

  const onUpdateMemberSettings = async (input: { roomSizeSqm: number | null; commonAreaFactor: number }) => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      const updated = await updateMemberSettings(activeHousehold.id, userId, input);
      setHouseholdMembers((current) =>
        current.map((entry) =>
          entry.household_id === updated.household_id && entry.user_id === updated.user_id ? updated : entry
        )
      );
      setMessage(t("settings.memberSaved"));
    });
  };

  const onUpdateUserAvatar = async (avatarUrl: string) => {
    await withAction(async () => {
      await updateUserAvatar(avatarUrl);
      const nextSession = await getCurrentSession();
      setSession(nextSession);
      setMessage(t("settings.profileSaved"));
    });
  };

  const onLeaveHousehold = async () => {
    if (!activeHousehold || !userId) return;

    await withAction(async () => {
      await leaveHousehold(activeHousehold.id, userId);
      await loadHouseholds(userId);
      setMessage(t("settings.leftHousehold"));

      if (location.pathname === "/settings") {
        void navigate({ to: "/shopping" });
      }
    });
  };

  const onTabChange = (value: string) => {
    const nextTab = value as AppTab;
    const nextPath = tabPathMap[nextTab] ?? "/shopping";

    if (nextPath === location.pathname) return;
    void navigate({ to: nextPath });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl p-4 pb-10 text-slate-900 dark:text-slate-100 sm:p-6">
      <header className="mb-4 rounded-2xl bg-brand-900 px-4 py-4 text-white shadow-card dark:bg-slate-900 dark:ring-1 dark:ring-slate-700">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-100">{t("app.brand")}</p>
              <h1 className="text-2xl font-bold">{t("app.title")}</h1>
              <p className="text-sm text-brand-100">{t("app.subtitle")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeHousehold ? <Badge className="bg-white text-brand-900">{activeHousehold.name}</Badge> : null}
            {activeHousehold ? (
              <Badge className="bg-brand-700 text-brand-50 dark:bg-brand-800 dark:text-brand-100">
                {t("app.codeBadge", { code: activeHousehold.invite_code })}
              </Badge>
            ) : null}
            {session ? (
              <Button size="sm" variant="outline" onClick={onSignOut}>
                <LogOut className="mr-1 h-4 w-4" />
                {t("common.logout")}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {!isSupabaseConfigured ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/60">
          <CardHeader>
            <CardTitle>{t("app.supabaseMissingTitle")}</CardTitle>
            <CardDescription>{t("app.supabaseMissingDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loadingSession ? <p className="text-sm text-slate-700 dark:text-slate-300">{t("app.loadingSession")}</p> : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

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
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Home className="h-5 w-5" />
                    {t("app.dashboardTitle")}
                  </CardTitle>
                  <CardDescription>{userEmail ?? t("app.noUserLabel")}</CardDescription>
                </div>

                {households.length > 1 ? (
                  <select
                    className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={activeHousehold.id}
                    onChange={(event) => {
                      const next = households.find((entry) => entry.id === event.target.value);
                      if (next) setActiveHousehold(next);
                    }}
                  >
                    {households.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </CardHeader>
          </Card>

          <Tabs value={tab} onValueChange={onTabChange}>
            <TabsList>
              <TabsTrigger value="shopping">{t("tab.shopping")}</TabsTrigger>
              <TabsTrigger value="tasks">{t("tab.tasks")}</TabsTrigger>
              <TabsTrigger value="finances">{t("tab.finances")}</TabsTrigger>
              <TabsTrigger value="settings">{t("tab.settings")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
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
                  tasks={tasks}
                  completions={taskCompletions}
                  members={householdMembers}
                  memberPimpers={memberPimpers}
                  userId={userId!}
                  busy={busy}
                  notificationPermission={permission}
                  onEnableNotifications={onEnableNotifications}
                  onAdd={onAddTask}
                  onComplete={onCompleteTask}
                />
              ) : null}

              {tab === "finances" ? (
                <FinancesTab
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
                  onLeaveHousehold={onLeaveHousehold}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {t("app.tasksDone", { done: completedTasks, total: tasks.length })}
          </p>
        </section>
      ) : null}
    </div>
  );
};

export default App;
