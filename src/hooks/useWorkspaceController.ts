import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  addBucketItem,
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
  deleteBucketItem,
  deleteShoppingItem,
  getCurrentSession,
  joinHouseholdByInvite,
  leaveHousehold,
  removeHouseholdMember,
  requestCashAudit,
  rateTaskCompletion,
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
  updateMemberVacationMode,
  updateShoppingItem,
  updateShoppingItemStatus,
  updateUserAvatar,
  updateUserColor,
  updateUserDisplayName,
  updateUserPaymentHandles,
  updateBucketDateVote,
  updateBucketItem,
  updateBucketItemStatus
} from "../lib/api";
import { setActiveHouseholdId } from "../lib/app-store";
import { queryKeys } from "../lib/query-keys";
import type {
  BucketItem,
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
import { useWorkspaceData } from "./use-workspace-data";
import { useWorkspaceActions } from "./use-workspace-actions";
import { registerWebPushToken } from "../lib/push-registration";
import { useNotificationPermission } from "./use-notification-permission";

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
    householdMembers,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    currentMember
  } = useWorkspaceData();

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { permission, requestPermission } = useNotificationPermission();

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
        const text =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "message" in err && typeof (err as { message?: unknown }).message === "string"
              ? (err as { message: string }).message
              : t("app.unknownError");
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

  const onUpdateShoppingItem = useCallback(
    async (
      item: ShoppingItem,
      input: {
        title: string;
        tags: string[];
        recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null;
      }
    ) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateShoppingItem(item.id, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
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

  const onAddBucketItem = useCallback(
    async (input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await addBucketItem(activeHousehold.id, input, userId);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onToggleBucketItem = useCallback(
    async (item: BucketItem) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateBucketItemStatus(item.id, !item.done, userId);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onUpdateBucketItem = useCallback(
    async (item: BucketItem, input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateBucketItem(item.id, input);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onDeleteBucketItem = useCallback(
    async (item: BucketItem) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await deleteBucketItem(item.id);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation]
  );

  const onToggleBucketDateVote = useCallback(
    async (item: BucketItem, suggestedDate: string, voted: boolean) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateBucketDateVote({
          bucketItemId: item.id,
          householdId: activeHousehold.id,
          suggestedDate,
          userId,
          voted
        });
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
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

  const onRateTaskCompletion = useCallback(
    async (taskCompletionId: string, rating: number) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await rateTaskCompletion(taskCompletionId, rating);
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, userId]
  );

  const onAddFinanceEntry = useCallback(
    async (input: {
      description: string;
      amount: number;
      category: string;
      receiptImageUrl?: string | null;
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
        receiptImageUrl?: string | null;
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
        if (activeHousehold) {
          await registerWebPushToken({
            householdId: activeHousehold.id,
            locale: typeof navigator !== "undefined" ? navigator.language : undefined,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          });
        }
        setMessage(t("app.pushEnabled"));
      } else {
        setError(t("app.pushDenied"));
      }
    });
  }, [activeHousehold, executeAction, requestPermission, t]);

  useEffect(() => {
    if (!activeHousehold) return;
    if (permission !== "granted") return;
    void registerWebPushToken({
      householdId: activeHousehold.id,
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }, [activeHousehold, permission]);

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

  const onUpdateMemberSettingsForUser = useCallback(
    async (targetUserId: string, input: { roomSizeSqm: number | null; commonAreaFactor: number }) => {
      if (!activeHousehold) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateMemberSettings(activeHousehold.id, targetUserId, input);
        setMessage(t("settings.memberSaved"));
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t]
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

  const onUpdateVacationMode = useCallback(
    async (vacationMode: boolean) => {
      if (!activeHousehold || !userId) return;

      await runWithWorkspaceInvalidation(async () => {
        await updateMemberVacationMode(activeHousehold.id, userId, vacationMode);
        setMessage(t("settings.vacationModeSaved"));
      });
    },
    [activeHousehold, runWithWorkspaceInvalidation, t, userId]
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

  const onUpdateUserColor = useCallback(
    async (userColor: string) => {
      await executeAction(async () => {
        await updateUserColor(userColor);
        await invalidateWorkspace();
        setMessage(t("settings.profileColorSaved"));
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
    householdMembers,
    userId,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    currentMember,
    notificationPermission: permission,
    setActiveHousehold,
    onSignIn,
    onSignUp,
    onGoogleSignIn,
    onSignOut,
    onCreateHousehold,
    onJoinHousehold,
    onAddBucketItem,
    onToggleBucketItem,
    onUpdateBucketItem,
    onDeleteBucketItem,
    onToggleBucketDateVote,
    onAddShoppingItem,
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
  };
};
