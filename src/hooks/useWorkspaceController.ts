import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Session } from "@supabase/supabase-js";
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
  signUp,
  updateHouseholdSettings,
  updateMemberSettings,
  updateShoppingItemStatus,
  updateUserAvatar
} from "../lib/api";
import { appStore, setActiveHouseholdId } from "../lib/app-store";
import { queryKeys } from "../lib/query-keys";
import { supabase } from "../lib/supabase";
import type {
  FinanceEntry,
  Household,
  HouseholdMember,
  HouseholdMemberPimpers,
  NewTaskInput,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "../lib/types";
import { useTaskNotifications } from "./useTaskNotifications";

interface WorkspaceData {
  shoppingItems: ShoppingItem[];
  shoppingCompletions: ShoppingItemCompletion[];
  tasks: TaskItem[];
  taskCompletions: TaskCompletion[];
  finances: FinanceEntry[];
  householdMembers: HouseholdMember[];
  memberPimpers: HouseholdMemberPimpers[];
}

const emptyWorkspace: WorkspaceData = {
  shoppingItems: [],
  shoppingCompletions: [],
  tasks: [],
  taskCompletions: [],
  finances: [],
  householdMembers: [],
  memberPimpers: []
};

const getWorkspaceData = async (householdId: string): Promise<WorkspaceData> => {
  const [shoppingItems, shoppingCompletions, tasks, taskCompletions, finances, householdMembers, memberPimpers] =
    await Promise.all([
      getShoppingItems(householdId),
      getShoppingCompletions(householdId),
      getTasks(householdId),
      getTaskCompletions(householdId),
      getFinanceEntries(householdId),
      getHouseholdMembers(householdId),
      getHouseholdMemberPimpers(householdId)
    ]);

  return {
    shoppingItems,
    shoppingCompletions,
    tasks,
    taskCompletions,
    finances,
    householdMembers,
    memberPimpers
  };
};

export const useWorkspaceController = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sessionQuery = useQuery<Session | null>({
    queryKey: queryKeys.session,
    queryFn: getCurrentSession
  });

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      queryClient.setQueryData(queryKeys.session, nextSession);
      setError(null);
      setMessage(null);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const session = sessionQuery.data ?? null;
  const userId = session?.user.id;

  const householdsQuery = useQuery<Household[]>({
    queryKey: userId ? queryKeys.households(userId) : ["households", "anonymous"],
    queryFn: () => getHouseholdsForUser(userId!),
    enabled: Boolean(userId)
  });

  const households = useMemo<Household[]>(() => householdsQuery.data ?? [], [householdsQuery.data]);
  const activeHouseholdId = useStore(appStore, (state: { activeHouseholdId: string | null }) => state.activeHouseholdId);

  useEffect(() => {
    if (households.length === 0) {
      setActiveHouseholdId(null);
      return;
    }

    if (activeHouseholdId && households.some((entry) => entry.id === activeHouseholdId)) {
      return;
    }

    setActiveHouseholdId(households[0].id);
  }, [activeHouseholdId, households]);

  const activeHousehold = useMemo(
    () => households.find((entry) => entry.id === activeHouseholdId) ?? null,
    [activeHouseholdId, households]
  );

  const workspaceQuery = useQuery<WorkspaceData>({
    queryKey: activeHousehold ? queryKeys.workspace(activeHousehold.id) : ["workspace", "none"],
    queryFn: () => getWorkspaceData(activeHousehold!.id),
    enabled: Boolean(activeHousehold)
  });

  const workspace = workspaceQuery.data ?? emptyWorkspace;

  const userEmail = session?.user.email;
  const userAvatarUrl = useMemo(() => {
    const raw = session?.user.user_metadata?.avatar_url;
    return typeof raw === "string" ? raw : null;
  }, [session?.user.user_metadata?.avatar_url]);

  const currentMember = useMemo(
    () =>
      userId ? workspace.householdMembers.find((entry: HouseholdMember) => entry.user_id === userId) ?? null : null,
    [workspace.householdMembers, userId]
  );

  const completedTasks = useMemo(
    () => workspace.tasks.filter((task: TaskItem) => task.done).length,
    [workspace.tasks]
  );

  const { permission, requestPermission } = useTaskNotifications(workspace.tasks, userId);

  const actionMutation = useMutation({
    mutationFn: async (action: () => Promise<void>) => action()
  });

  const executeAction = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      setMessage(null);

      try {
        await actionMutation.mutateAsync(action);
      } catch (err) {
        const text = err instanceof Error ? err.message : t("app.unknownError");
        setError(text);
      }
    },
    [actionMutation, t]
  );

  const onSignIn = useCallback(
    async (email: string, password: string) => {
      await executeAction(async () => {
        await signIn(email, password);
        setMessage(t("app.signInSuccess"));
      });
    },
    [executeAction, t]
  );

  const onSignUp = useCallback(
    async (email: string, password: string) => {
      await executeAction(async () => {
        await signUp(email, password);
        setMessage(t("app.signUpSuccess"));
      });
    },
    [executeAction, t]
  );

  const onGoogleSignIn = useCallback(async () => {
    await executeAction(async () => {
      await signInWithGoogle();
    });
  }, [executeAction]);

  const onCreateHousehold = useCallback(
    async (name: string) => {
      if (!userId) return;

      await executeAction(async () => {
        const created = await createHousehold(name, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.households(userId) });
        setActiveHouseholdId(created.id);
        setMessage(t("app.householdCreated", { name: created.name }));
      });
    },
    [executeAction, queryClient, t, userId]
  );

  const onJoinHousehold = useCallback(
    async (inviteCode: string) => {
      if (!userId) return;

      await executeAction(async () => {
        const joined = await joinHouseholdByInvite(inviteCode, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.households(userId) });
        setActiveHouseholdId(joined.id);
        setMessage(t("app.householdJoined", { name: joined.name }));
      });
    },
    [executeAction, queryClient, t, userId]
  );

  const onAddShoppingItem = useCallback(
    async (title: string, tags: string[], recurrenceIntervalMinutes: number | null) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        await addShoppingItem(activeHousehold.id, title, tags, recurrenceIntervalMinutes, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
      });
    },
    [activeHousehold, executeAction, queryClient, userId]
  );

  const onToggleShoppingItem = useCallback(
    async (item: ShoppingItem) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        await updateShoppingItemStatus(item.id, !item.done, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
      });
    },
    [activeHousehold, executeAction, queryClient, userId]
  );

  const onDeleteShoppingItem = useCallback(
    async (item: ShoppingItem) => {
      if (!activeHousehold) return;

      await executeAction(async () => {
        await deleteShoppingItem(item.id);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
      });
    },
    [activeHousehold, executeAction, queryClient]
  );

  const onAddTask = useCallback(
    async (input: NewTaskInput) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        await addTask(activeHousehold.id, input, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
      });
    },
    [activeHousehold, executeAction, queryClient, userId]
  );

  const onCompleteTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        await completeTask(task.id, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
        setMessage(t("tasks.completedMessage", { title: task.title }));
      });
    },
    [activeHousehold, executeAction, queryClient, t, userId]
  );

  const onAddFinanceEntry = useCallback(
    async (description: string, amount: number, category: string) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        await addFinanceEntry(activeHousehold.id, description, amount, category, userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
      });
    },
    [activeHousehold, executeAction, queryClient, userId]
  );

  const onRequestCashAudit = useCallback(async () => {
    if (!activeHousehold || !userId) return;

    await executeAction(async () => {
      await requestCashAudit(activeHousehold.id, userId);
      setMessage(t("app.cashAuditQueued"));
    });
  }, [activeHousehold, executeAction, t, userId]);

  const onEnableNotifications = useCallback(async () => {
    await executeAction(async () => {
      const result = await requestPermission();
      if (result === "granted") {
        setMessage(t("app.pushEnabled"));
      } else {
        setError(t("app.pushDenied"));
      }
    });
  }, [executeAction, requestPermission, t]);

  const onUpdateHousehold = useCallback(
    async (input: {
      imageUrl: string;
      address: string;
      currency: string;
      apartmentSizeSqm: number | null;
      warmRentMonthly: number | null;
    }) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        const updated = await updateHouseholdSettings(activeHousehold.id, input);
        queryClient.setQueryData(queryKeys.households(userId), (current: Household[] | undefined) =>
          (current ?? []).map((entry) => (entry.id === updated.id ? updated : entry))
        );
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
        setMessage(t("settings.householdSaved"));
      });
    },
    [activeHousehold, executeAction, queryClient, t, userId]
  );

  const onUpdateMemberSettings = useCallback(
    async (input: { roomSizeSqm: number | null; commonAreaFactor: number }) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        await updateMemberSettings(activeHousehold.id, userId, input);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHousehold.id) });
        setMessage(t("settings.memberSaved"));
      });
    },
    [activeHousehold, executeAction, queryClient, t, userId]
  );

  const onUpdateUserAvatar = useCallback(
    async (avatarUrl: string) => {
      await executeAction(async () => {
        await updateUserAvatar(avatarUrl);
        const nextSession = await getCurrentSession();
        queryClient.setQueryData(queryKeys.session, nextSession);
        setMessage(t("settings.profileSaved"));
      });
    },
    [executeAction, queryClient, t]
  );

  const onLeaveHousehold = useCallback(async () => {
    if (!activeHousehold || !userId) return;

    await executeAction(async () => {
      await leaveHousehold(activeHousehold.id, userId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.households(userId) });
      setActiveHouseholdId(null);
      setMessage(t("settings.leftHousehold"));
    });
  }, [activeHousehold, executeAction, queryClient, t, userId]);

  const setActiveHousehold = useCallback((household: Household | null) => {
    setActiveHouseholdId(household?.id ?? null);
  }, []);

  return {
    session,
    loadingSession: sessionQuery.isLoading,
    busy: actionMutation.isPending,
    error,
    message,
    households,
    activeHousehold,
    shoppingItems: workspace.shoppingItems,
    shoppingCompletions: workspace.shoppingCompletions,
    tasks: workspace.tasks,
    taskCompletions: workspace.taskCompletions,
    finances: workspace.finances,
    householdMembers: workspace.householdMembers,
    memberPimpers: workspace.memberPimpers,
    userId,
    userEmail,
    userAvatarUrl,
    currentMember,
    completedTasks,
    notificationPermission: permission,
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
  };
};
