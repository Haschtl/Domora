import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  addFinanceEntry,
  addShoppingItem,
  addTask,
  dissolveHousehold,
  completeTask,
  createHousehold,
  deleteFinanceEntry,
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
  updateHouseholdSettings,
  updateMemberSettings,
  updateShoppingItemStatus,
  updateUserAvatar,
  updateUserDisplayName
} from "../lib/api";
import { setActiveHouseholdId } from "../lib/app-store";
import { queryKeys } from "../lib/query-keys";
import type {
  FinanceEntry,
  Household,
  NewTaskInput,
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
    activeHouseholdId,
    activeHousehold,
    workspace,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    currentMember,
    completedTasks
  } = useWorkspaceData();

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      name: string;
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
        await invalidateWorkspace();
        setMessage(t("settings.householdSaved"));
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
    activeHousehold,
    shoppingItems: workspace.shoppingItems,
    shoppingCompletions: workspace.shoppingCompletions,
    tasks: workspace.tasks,
    taskCompletions: workspace.taskCompletions,
    finances: workspace.finances,
    cashAuditRequests: workspace.cashAuditRequests,
    householdMembers: workspace.householdMembers,
    memberPimpers: workspace.memberPimpers,
    userId,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    currentMember,
    completedTasks,
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
    onAddFinanceEntry,
    onUpdateFinanceEntry,
    onDeleteFinanceEntry,
    onRequestCashAudit,
    onEnableNotifications,
    onUpdateHousehold,
    onUpdateMemberSettings,
    onUpdateUserAvatar,
    onUpdateUserDisplayName,
    onLeaveHousehold,
    onDissolveHousehold,
    onSetMemberRole,
    onRemoveMember
  };
};
