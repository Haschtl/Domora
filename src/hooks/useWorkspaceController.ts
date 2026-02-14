import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  addFinanceEntry,
  addFinanceSubscription,
  addShoppingItem,
  addTask,
  deleteTask,
  dissolveHousehold,
  completeTask,
  createHousehold,
  deleteFinanceEntry,
  deleteFinanceSubscription,
  deleteShoppingItem,
  getCurrentSession,
  joinHouseholdByInvite,
  leaveHousehold,
  removeHouseholdMember,
  requestCashAudit,
  setHouseholdMemberRole,
  signOut,
  signIn,
  signInWithGoogle,
  signUp,
  updateFinanceEntry,
  updateFinanceSubscription,
  updateHouseholdSettings,
  updateHouseholdLandingPage,
  updateTaskActiveState,
  updateTask,
  takeoverTask,
  skipTask,
  updateMemberSettings,
  resetHouseholdPimpers,
  updateMemberTaskLaziness,
  updateShoppingItemStatus,
  updateUserAvatar,
  updateUserDisplayName,
  updateUserPaymentHandles
} from "../lib/api";
import { setActiveHouseholdId } from "../lib/app-store";
import { queryKeys } from "../lib/query-keys";
import type {
  FinanceEntry,
  FinanceSubscription,
  NewFinanceSubscriptionInput,
  Household,
  NewTaskInput,
  UpdateHouseholdInput,
  ShoppingRecurrenceUnit,
  ShoppingItem,
  TaskItem
} from "../lib/types";
import { useTaskNotifications } from "./useTaskNotifications";
import { useWorkspaceData } from "./use-workspace-data";
import { useWorkspaceActions } from "./use-workspace-actions";

export const useWorkspaceController = () => {
  const { t } = useTranslation();
  const {
    sessionQuery,
    queryClient,
    session,
    userId,
    households,
    householdsLoadError,
    activeHouseholdId,
    activeHousehold,
    workspace,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    currentMember,
    completedTasks,
    householdEvents
  } = useWorkspaceData();

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { permission, requestPermission } = useTaskNotifications(workspace.tasks, workspace.householdEvents, userId);

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
  const { invalidateWorkspace, runWithWorkspaceInvalidation } = useWorkspaceActions({
    queryClient,
    activeHouseholdId,
    executeAction
  });

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

  const onSignOut = useCallback(async () => {
    await executeAction(async () => {
      await signOut();
      setActiveHouseholdId(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.households(userId) });
      }
    });
  }, [executeAction, queryClient, userId]);

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
    async (title: string, tags: string[], recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await addShoppingItem(activeHousehold.id, title, tags, recurrenceInterval, userId);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onToggleShoppingItem = useCallback(
    async (item: ShoppingItem) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateShoppingItemStatus(item.id, !item.done, userId);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onDeleteShoppingItem = useCallback(
    async (item: ShoppingItem) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await deleteShoppingItem(item.id);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onAddTask = useCallback(
    async (input: NewTaskInput) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await addTask(activeHousehold.id, input, userId);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onCompleteTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await completeTask(task.id, userId);
        setMessage(t("tasks.completedMessage", { title: task.title }));
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t, userId]
  );

  const onSkipTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await skipTask(task.id, userId);
        setMessage(t("tasks.skippedMessage", { title: task.title }));
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t, userId]
  );

  const onTakeoverTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await takeoverTask(task.id, userId);
        setMessage(t("tasks.takenOverMessage", { title: task.title }));
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t, userId]
  );

  const onToggleTaskActive = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateTaskActiveState(task.id, !task.is_active);
        setMessage(
          task.is_active
            ? t("tasks.deactivatedMessage", { title: task.title })
            : t("tasks.activatedMessage", { title: task.title })
        );
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t]
  );

  const onUpdateTask = useCallback(
    async (task: TaskItem, input: NewTaskInput) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateTask(task.id, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onDeleteTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await deleteTask(task.id);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onAddFinanceEntry = useCallback(
    async (input: {
      description: string;
      amount: number;
      category: string;
      paidByUserIds: string[];
      beneficiaryUserIds: string[];
      entryDate?: string | null;
    }) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await addFinanceEntry(activeHousehold.id, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onUpdateFinanceEntry = useCallback(
    async (
      entry: FinanceEntry,
      input: {
        description: string;
        amount: number;
        category: string;
        paidByUserIds: string[];
        beneficiaryUserIds: string[];
        entryDate?: string | null;
      }
    ) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateFinanceEntry(entry.id, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onDeleteFinanceEntry = useCallback(
    async (entry: FinanceEntry) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await deleteFinanceEntry(entry.id);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onAddFinanceSubscription = useCallback(
    async (input: NewFinanceSubscriptionInput) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await addFinanceSubscription(activeHousehold.id, userId, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onUpdateFinanceSubscription = useCallback(
    async (subscription: FinanceSubscription, input: NewFinanceSubscriptionInput) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateFinanceSubscription(subscription.id, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onDeleteFinanceSubscription = useCallback(
    async (subscription: FinanceSubscription) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await deleteFinanceSubscription(subscription.id);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
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
    async (input: UpdateHouseholdInput) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        const updated = await updateHouseholdSettings(activeHousehold.id, input);
        queryClient.setQueryData(queryKeys.households(userId), (current: Household[] | undefined) =>
          (current ?? []).map((entry) => (entry.id === updated.id ? updated : entry))
        );
        await invalidateWorkspace();
        setMessage(t("settings.householdSaved"));
      });
    },
    [activeHousehold, executeAction, invalidateWorkspace, queryClient, t, userId]
  );

  const onUpdateHomeMarkdown = useCallback(
    async (markdown: string) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        const updated = await updateHouseholdLandingPage(activeHousehold.id, markdown);
        queryClient.setQueryData(queryKeys.households(userId), (current: Household[] | undefined) =>
          (current ?? []).map((entry) => (entry.id === updated.id ? updated : entry))
        );
        await invalidateWorkspace();
        setMessage(t("home.saved"));
      });
    },
    [activeHousehold, executeAction, invalidateWorkspace, queryClient, t, userId]
  );

  const onUpdateMemberSettings = useCallback(
    async (input: { roomSizeSqm: number | null; commonAreaFactor: number }) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateMemberSettings(activeHousehold.id, userId, input);
        setMessage(t("settings.memberSaved"));
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t, userId]
  );

  const onUpdateMemberTaskLaziness = useCallback(
    async (targetUserId: string, taskLazinessFactor: number) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateMemberTaskLaziness(activeHousehold.id, targetUserId, taskLazinessFactor);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onResetHouseholdPimpers = useCallback(async () => {
    if (!activeHousehold) return;

    await runWithWorkspaceInvalidation(async () => {
      await resetHouseholdPimpers(activeHousehold.id);
      setMessage(t("tasks.resetPimpersSuccess"));
    });
  }, [activeHousehold, runWithWorkspaceInvalidation, t]);

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

  const onUpdateUserDisplayName = useCallback(
    async (displayName: string) => {
      await executeAction(async () => {
        await updateUserDisplayName(displayName);
        const nextSession = await getCurrentSession();
        queryClient.setQueryData(queryKeys.session, nextSession);
        setMessage(t("settings.profileNameSaved"));
      });
    },
    [executeAction, queryClient, t]
  );

  const onUpdateUserPaymentHandles = useCallback(
    async (input: { paypalName: string; revolutName: string; weroName: string }) => {
      await executeAction(async () => {
        await updateUserPaymentHandles(input);
        await invalidateWorkspace();
        setMessage(t("settings.paymentSaved"));
      });
    },
    [executeAction, invalidateWorkspace, t]
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

  const onDissolveHousehold = useCallback(async () => {
    if (!activeHousehold || !userId) return;

    await executeAction(async () => {
      await dissolveHousehold(activeHousehold.id, userId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.households(userId) });
      setActiveHouseholdId(null);
      setMessage(t("settings.dissolvedHousehold"));
    });
  }, [activeHousehold, executeAction, queryClient, t, userId]);

  const onSetMemberRole = useCallback(
    async (targetUserId: string, role: "owner" | "member") => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await setHouseholdMemberRole(activeHousehold.id, targetUserId, role);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onRemoveMember = useCallback(
    async (targetUserId: string) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await removeHouseholdMember(activeHousehold.id, targetUserId);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

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
    householdsLoadError,
    activeHousehold,
    shoppingItems: workspace.shoppingItems,
    shoppingCompletions: workspace.shoppingCompletions,
    tasks: workspace.tasks,
    taskCompletions: workspace.taskCompletions,
    finances: workspace.finances,
    financeSubscriptions: workspace.financeSubscriptions,
    cashAuditRequests: workspace.cashAuditRequests,
    householdMembers: workspace.householdMembers,
    memberPimpers: workspace.memberPimpers,
    userId,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    currentMember,
    completedTasks,
    householdEvents,
    notificationPermission: permission,
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
    onUpdateMemberTaskLaziness,
    onResetHouseholdPimpers,
    onUpdateUserAvatar,
    onUpdateUserDisplayName,
    onUpdateUserPaymentHandles,
    onLeaveHousehold,
    onDissolveHousehold,
    onSetMemberRole,
    onRemoveMember
  };
};
