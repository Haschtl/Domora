import { useCallback, useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
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
  upsertHouseholdWhiteboard,
  updateTaskActiveState,
  updateTask,
  takeoverTask,
  skipTask,
  updateMemberSettings,
  updateMemberTaskLaziness,
  resetHouseholdPimpers,
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
  HouseholdMember,
  HouseholdMemberPimpers,
  FinanceEntry,
  FinanceSubscription,
  FinanceSubscriptionRecurrence,
  NewFinanceSubscriptionInput,
  Household,
  NewTaskInput,
  UpdateHouseholdInput,
  ShoppingRecurrenceUnit,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "../lib/types";
import { useWorkspaceData } from "./use-workspace-data";
import { useWorkspaceActions } from "./use-workspace-actions";
import { registerWebPushToken } from "../lib/push-registration";
import { useNotificationPermission } from "./use-notification-permission";

const sortShoppingItems = (items: ShoppingItem[]) =>
  [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.created_at.localeCompare(a.created_at);
  });

const sortBucketItems = (items: BucketItem[]) =>
  [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.created_at.localeCompare(a.created_at);
  });

const sortTasks = (items: TaskItem[]) => [...items].sort((a, b) => a.due_at.localeCompare(b.due_at));

const sortFinanceEntries = (items: FinanceEntry[]) =>
  [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));

const sortFinanceSubscriptions = (items: FinanceSubscription[]) =>
  [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));

const taskFrequencyDaysToCronPattern = (frequencyDays: number) => {
  const normalized = Math.max(1, Math.floor(frequencyDays));
  return `0 9 */${normalized} * *`;
};

const financeRecurrenceToCronPattern = (recurrence: FinanceSubscriptionRecurrence) => {
  if (recurrence === "weekly") return "0 9 * * 1";
  if (recurrence === "quarterly") return "0 9 1 */3 *";
  return "0 9 1 * *";
};

const getDueAtFromStartDate = (startDate: string) => {
  const asDate = new Date(`${startDate}T09:00:00`);
  if (Number.isNaN(asDate.getTime())) {
    return new Date().toISOString();
  }
  return asDate.toISOString();
};

const getNextDueAt = (task: TaskItem, nowIso: string) => {
  const now = new Date(nowIso);
  const dueAt = new Date(task.due_at);
  const base = Number.isNaN(dueAt.getTime()) ? now : dueAt > now ? dueAt : now;
  const intervalDays = Math.max(1, Math.floor(task.frequency_days));
  const next = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return next.toISOString();
};

const getNextRotationAssignee = (task: TaskItem) => {
  const rotation = task.rotation_user_ids ?? [];
  if (rotation.length === 0) return task.assignee_id;
  const currentIndex = task.assignee_id ? rotation.indexOf(task.assignee_id) : -1;
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % rotation.length : 0;
  return rotation[nextIndex];
};

const applyCompletionRating = (completion: TaskCompletion, rating: number) => {
  const previousRating = completion.my_rating;
  const currentCount = completion.rating_count ?? 0;
  const currentAverage = completion.rating_average ?? 0;
  let nextCount = currentCount;
  let nextAverage = currentAverage;

  if (previousRating == null) {
    const total = currentAverage * currentCount;
    nextCount = currentCount + 1;
    nextAverage = nextCount === 0 ? rating : (total + rating) / nextCount;
  } else if (currentCount > 0) {
    const total = currentAverage * currentCount;
    nextAverage = (total - previousRating + rating) / currentCount;
  } else {
    nextAverage = rating;
    nextCount = 1;
  }

  return {
    ...completion,
    my_rating: rating,
    rating_count: nextCount,
    rating_average: Number.isFinite(nextAverage) ? Number(nextAverage.toFixed(2)) : completion.rating_average
  };
};

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
  const { invalidateWorkspace, runWithOptimisticUpdate } = useWorkspaceActions({
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

      const nowIso = new Date().toISOString();
      const optimisticItem: ShoppingItem = {
        id: uuid(),
        household_id: activeHousehold.id,
        title,
        tags,
        recurrence_interval_value: recurrenceInterval?.value ?? null,
        recurrence_interval_unit: recurrenceInterval?.unit ?? null,
        done: false,
        done_at: null,
        done_by: null,
        created_by: userId,
        created_at: nowIso
      };

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdShoppingItems(activeHousehold.id),
            updater: (current) => sortShoppingItems([optimisticItem, ...((current as ShoppingItem[]) ?? [])])
          }
        ],
        action: async () => {
          await addShoppingItem(activeHousehold.id, title, tags, recurrenceInterval, userId);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onToggleShoppingItem = useCallback(
    async (item: ShoppingItem) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const willComplete = !item.done;
      const completion: ShoppingItemCompletion | null = willComplete
        ? {
            id: uuid(),
            shopping_item_id: item.id,
            household_id: activeHousehold.id,
            title_snapshot: item.title,
            tags_snapshot: item.tags,
            completed_by: userId,
            completed_at: nowIso
          }
        : null;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdShoppingItems(activeHousehold.id),
            updater: (current) => {
              const items = (current as ShoppingItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      done: willComplete,
                      done_at: willComplete ? nowIso : null,
                      done_by: willComplete ? userId : null
                    }
                  : entry
              );
              return sortShoppingItems(next);
            }
          },
          ...(completion
            ? [
                {
                  queryKey: queryKeys.householdShoppingCompletions(activeHousehold.id),
                  updater: (current) => {
                    const existing = (current as ShoppingItemCompletion[]) ?? [];
                    return [completion, ...existing];
                  }
                }
              ]
            : [])
        ],
        action: async () => {
          await updateShoppingItemStatus(item.id, !item.done, userId);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
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

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdShoppingItems(activeHousehold.id),
            updater: (current) => {
              const items = (current as ShoppingItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      title: input.title,
                      tags: input.tags,
                      recurrence_interval_value: input.recurrenceInterval?.value ?? null,
                      recurrence_interval_unit: input.recurrenceInterval?.unit ?? null
                    }
                  : entry
              );
              return sortShoppingItems(next);
            }
          }
        ],
        action: async () => {
          await updateShoppingItem(item.id, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onDeleteShoppingItem = useCallback(
    async (item: ShoppingItem) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdShoppingItems(activeHousehold.id),
            updater: (current) => ((current as ShoppingItem[]) ?? []).filter((entry) => entry.id !== item.id)
          }
        ],
        action: async () => {
          await deleteShoppingItem(item.id);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onAddBucketItem = useCallback(
    async (input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const optimisticItem: BucketItem = {
        id: uuid(),
        household_id: activeHousehold.id,
        title: input.title,
        description_markdown: input.descriptionMarkdown,
        suggested_dates: [...new Set(input.suggestedDates)].sort(),
        votes_by_date: {},
        done: false,
        done_at: null,
        done_by: null,
        created_by: userId,
        created_at: nowIso
      };

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdBucketItems(activeHousehold.id),
            updater: (current) => sortBucketItems([optimisticItem, ...((current as BucketItem[]) ?? [])])
          }
        ],
        action: async () => {
          await addBucketItem(activeHousehold.id, input, userId);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onToggleBucketItem = useCallback(
    async (item: BucketItem) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const willComplete = !item.done;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdBucketItems(activeHousehold.id),
            updater: (current) => {
              const items = (current as BucketItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      done: willComplete,
                      done_at: willComplete ? nowIso : null,
                      done_by: willComplete ? userId : null
                    }
                  : entry
              );
              return sortBucketItems(next);
            }
          }
        ],
        action: async () => {
          await updateBucketItemStatus(item.id, !item.done, userId);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onUpdateBucketItem = useCallback(
    async (item: BucketItem, input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdBucketItems(activeHousehold.id),
            updater: (current) => {
              const items = (current as BucketItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      title: input.title,
                      description_markdown: input.descriptionMarkdown,
                      suggested_dates: [...new Set(input.suggestedDates)].sort()
                    }
                  : entry
              );
              return sortBucketItems(next);
            }
          }
        ],
        action: async () => {
          await updateBucketItem(item.id, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onDeleteBucketItem = useCallback(
    async (item: BucketItem) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdBucketItems(activeHousehold.id),
            updater: (current) => ((current as BucketItem[]) ?? []).filter((entry) => entry.id !== item.id)
          }
        ],
        action: async () => {
          await deleteBucketItem(item.id);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onToggleBucketDateVote = useCallback(
    async (item: BucketItem, suggestedDate: string, voted: boolean) => {
      if (!activeHousehold || !userId) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdBucketItems(activeHousehold.id),
            updater: (current) => {
              const items = (current as BucketItem[]) ?? [];
              const next = items.map((entry) => {
                if (entry.id !== item.id) return entry;
                const votesByDate = { ...(entry.votes_by_date ?? {}) };
                const currentVotes = votesByDate[suggestedDate] ?? [];
                const hasVote = currentVotes.includes(userId);
                let updatedVotes = currentVotes;
                if (voted && !hasVote) {
                  updatedVotes = [...currentVotes, userId];
                } else if (!voted && hasVote) {
                  updatedVotes = currentVotes.filter((id) => id !== userId);
                }
                if (updatedVotes.length === 0) {
                  delete votesByDate[suggestedDate];
                } else {
                  votesByDate[suggestedDate] = updatedVotes;
                }
                return { ...entry, votes_by_date: votesByDate };
              });
              return sortBucketItems(next);
            }
          }
        ],
        action: async () => {
          await updateBucketDateVote({
            bucketItemId: item.id,
            householdId: activeHousehold.id,
            suggestedDate,
            userId,
            voted
          });
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onAddTask = useCallback(
    async (input: NewTaskInput) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const optimisticTask: TaskItem = {
        id: uuid(),
        household_id: activeHousehold.id,
        title: input.title,
        description: input.description,
        current_state_image_url: input.currentStateImageUrl ?? null,
        target_state_image_url: input.targetStateImageUrl ?? null,
        start_date: input.startDate,
        due_at: getDueAtFromStartDate(input.startDate),
        cron_pattern: input.cronPattern?.trim() || taskFrequencyDaysToCronPattern(input.frequencyDays),
        frequency_days: input.frequencyDays,
        effort_pimpers: input.effortPimpers,
        grace_minutes: input.graceMinutes,
        prioritize_low_pimpers: input.prioritizeLowPimpers,
        assignee_fairness_mode: input.assigneeFairnessMode,
        is_active: true,
        done: false,
        done_at: null,
        done_by: null,
        assignee_id: input.rotationUserIds[0] ?? null,
        created_by: userId,
        created_at: nowIso,
        rotation_user_ids: input.rotationUserIds
      };

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => sortTasks([optimisticTask, ...((current as TaskItem[]) ?? [])])
          }
        ],
        action: async () => {
          await addTask(activeHousehold.id, input, userId);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onCompleteTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const nextDueAt = getNextDueAt(task, nowIso);
      const nextAssignee = getNextRotationAssignee(task);
      const graceMinutes = Math.max(task.grace_minutes ?? 0, 0);
      const dueAt = new Date(task.due_at);
      const delayMinutes = Number.isNaN(dueAt.getTime())
        ? 0
        : Math.max(0, Math.floor((Date.parse(nowIso) - (dueAt.getTime() + graceMinutes * 60 * 1000)) / 60000));

      const completion: TaskCompletion = {
        id: uuid(),
        task_id: task.id,
        household_id: task.household_id,
        task_title_snapshot: task.title,
        user_id: userId,
        pimpers_earned: Math.max(task.effort_pimpers, 1),
        due_at_snapshot: task.due_at,
        delay_minutes: delayMinutes,
        completed_at: nowIso,
        rating_average: null,
        rating_count: 0,
        my_rating: null
      };

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => {
              const items = (current as TaskItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === task.id
                  ? {
                      ...entry,
                      done: true,
                      done_at: nowIso,
                      done_by: userId,
                      due_at: nextDueAt,
                      assignee_id: nextAssignee
                    }
                  : entry
              );
              return sortTasks(next);
            }
          },
          {
            queryKey: queryKeys.householdTaskCompletions(activeHousehold.id),
            updater: (current) => {
              const completions = (current as TaskCompletion[]) ?? [];
              return [completion, ...completions];
            }
          },
          {
            queryKey: queryKeys.householdMemberPimpers(activeHousehold.id),
            updater: (current) => {
              const pimpers = (current as HouseholdMemberPimpers[]) ?? [];
              const existing = pimpers.find((entry) => entry.user_id === userId);
              const earned = Math.max(task.effort_pimpers, 1);
              if (!existing) {
                return [
                  ...pimpers,
                  {
                    household_id: task.household_id,
                    user_id: userId,
                    total_pimpers: earned,
                    updated_at: nowIso
                  }
                ];
              }
              return pimpers.map((entry) =>
                entry.user_id === userId
                  ? {
                      ...entry,
                      total_pimpers: entry.total_pimpers + earned,
                      updated_at: nowIso
                    }
                  : entry
              );
            }
          }
        ],
        action: async () => {
          await completeTask(task.id, userId);
          setMessage(t("tasks.completedMessage", { title: task.title }));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t, userId]
  );

  const onSkipTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const nextDueAt = getNextDueAt(task, nowIso);
      const nextAssignee = getNextRotationAssignee(task);

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => {
              const items = (current as TaskItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === task.id
                  ? {
                      ...entry,
                      done: false,
                      done_at: null,
                      done_by: null,
                      due_at: nextDueAt,
                      assignee_id: nextAssignee
                    }
                  : entry
              );
              return sortTasks(next);
            }
          }
        ],
        action: async () => {
          await skipTask(task.id, userId);
          setMessage(t("tasks.skippedMessage", { title: task.title }));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t, userId]
  );

  const onTakeoverTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold || !userId) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => {
              const items = (current as TaskItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === task.id
                  ? {
                      ...entry,
                      assignee_id: userId
                    }
                  : entry
              );
              return sortTasks(next);
            }
          }
        ],
        action: async () => {
          await takeoverTask(task.id, userId);
          setMessage(t("tasks.takenOverMessage", { title: task.title }));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t, userId]
  );

  const onToggleTaskActive = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold) return;

      const nowIso = new Date().toISOString();
      const nextActive = !task.is_active;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => {
              const items = (current as TaskItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === task.id
                  ? {
                      ...entry,
                      is_active: nextActive,
                      due_at: nextActive ? nowIso : entry.due_at,
                      done: nextActive ? false : entry.done,
                      done_at: nextActive ? null : entry.done_at,
                      done_by: nextActive ? null : entry.done_by
                    }
                  : entry
              );
              return sortTasks(next);
            }
          }
        ],
        action: async () => {
          await updateTaskActiveState(task.id, !task.is_active);
          setMessage(
            task.is_active
              ? t("tasks.deactivatedMessage", { title: task.title })
              : t("tasks.activatedMessage", { title: task.title })
          );
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t]
  );

  const onUpdateTask = useCallback(
    async (task: TaskItem, input: NewTaskInput) => {
      if (!activeHousehold || !userId) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => {
              const items = (current as TaskItem[]) ?? [];
              const next = items.map((entry) =>
                entry.id === task.id
                  ? {
                      ...entry,
                      title: input.title,
                      description: input.description,
                      current_state_image_url: input.currentStateImageUrl ?? null,
                      target_state_image_url: input.targetStateImageUrl ?? null,
                      start_date: input.startDate,
                      due_at: getDueAtFromStartDate(input.startDate),
                      cron_pattern: input.cronPattern?.trim() || taskFrequencyDaysToCronPattern(input.frequencyDays),
                      frequency_days: input.frequencyDays,
                      effort_pimpers: input.effortPimpers,
                      grace_minutes: input.graceMinutes,
                      prioritize_low_pimpers: input.prioritizeLowPimpers,
                      assignee_fairness_mode: input.assigneeFairnessMode,
                      assignee_id: input.rotationUserIds[0] ?? null,
                      rotation_user_ids: input.rotationUserIds
                    }
                  : entry
              );
              return sortTasks(next);
            }
          }
        ],
        action: async () => {
          await updateTask(task.id, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onDeleteTask = useCallback(
    async (task: TaskItem) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTasks(activeHousehold.id),
            updater: (current) => ((current as TaskItem[]) ?? []).filter((entry) => entry.id !== task.id)
          }
        ],
        action: async () => {
          await deleteTask(task.id);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onRateTaskCompletion = useCallback(
    async (taskCompletionId: string, rating: number) => {
      if (!activeHousehold || !userId) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdTaskCompletions(activeHousehold.id),
            updater: (current) => {
              const completions = (current as TaskCompletion[]) ?? [];
              return completions.map((entry) =>
                entry.id === taskCompletionId ? applyCompletionRating(entry, rating) : entry
              );
            }
          }
        ],
        action: async () => {
          await rateTaskCompletion(taskCompletionId, rating);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
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

      const normalizedEntryDate = input.entryDate ?? new Date().toISOString().slice(0, 10);
      const createdAt = `${normalizedEntryDate}T12:00:00.000Z`;
      const optimisticEntry: FinanceEntry = {
        id: uuid(),
        household_id: activeHousehold.id,
        description: input.description,
        category: input.category || "general",
        amount: input.amount,
        receipt_image_url: input.receiptImageUrl ?? null,
        paid_by: input.paidByUserIds[0],
        paid_by_user_ids: input.paidByUserIds,
        beneficiary_user_ids: input.beneficiaryUserIds,
        entry_date: normalizedEntryDate,
        created_by: userId,
        created_at: createdAt
      };

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdFinances(activeHousehold.id),
            updater: (current) => sortFinanceEntries([optimisticEntry, ...((current as FinanceEntry[]) ?? [])])
          }
        ],
        action: async () => {
          await addFinanceEntry(activeHousehold.id, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
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

      const normalizedEntryDate = input.entryDate ?? new Date().toISOString().slice(0, 10);
      const createdAt = `${normalizedEntryDate}T12:00:00.000Z`;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdFinances(activeHousehold.id),
            updater: (current) => {
              const entries = (current as FinanceEntry[]) ?? [];
              const next = entries.map((existing) =>
                existing.id === entry.id
                  ? {
                      ...existing,
                      description: input.description,
                      amount: input.amount,
                      category: input.category || "general",
                      receipt_image_url: input.receiptImageUrl ?? null,
                      paid_by: input.paidByUserIds[0],
                      paid_by_user_ids: input.paidByUserIds,
                      beneficiary_user_ids: input.beneficiaryUserIds,
                      entry_date: normalizedEntryDate,
                      created_at: createdAt
                    }
                  : existing
              );
              return sortFinanceEntries(next);
            }
          }
        ],
        action: async () => {
          await updateFinanceEntry(entry.id, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onDeleteFinanceEntry = useCallback(
    async (entry: FinanceEntry) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdFinances(activeHousehold.id),
            updater: (current) => ((current as FinanceEntry[]) ?? []).filter((existing) => existing.id !== entry.id)
          }
        ],
        action: async () => {
          await deleteFinanceEntry(entry.id);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onAddFinanceSubscription = useCallback(
    async (input: NewFinanceSubscriptionInput) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();
      const optimisticSubscription: FinanceSubscription = {
        id: uuid(),
        household_id: activeHousehold.id,
        name: input.name,
        category: input.category || "general",
        amount: input.amount,
        paid_by_user_ids: input.paidByUserIds,
        beneficiary_user_ids: input.beneficiaryUserIds,
        cron_pattern: financeRecurrenceToCronPattern(input.recurrence),
        created_by: userId,
        created_at: nowIso,
        updated_at: nowIso
      };

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdFinanceSubscriptions(activeHousehold.id),
            updater: (current) =>
              sortFinanceSubscriptions([optimisticSubscription, ...((current as FinanceSubscription[]) ?? [])])
          }
        ],
        action: async () => {
          await addFinanceSubscription(activeHousehold.id, userId, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onUpdateFinanceSubscription = useCallback(
    async (subscription: FinanceSubscription, input: NewFinanceSubscriptionInput) => {
      if (!activeHousehold || !userId) return;

      const nowIso = new Date().toISOString();

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdFinanceSubscriptions(activeHousehold.id),
            updater: (current) => {
              const entries = (current as FinanceSubscription[]) ?? [];
              const next = entries.map((entry) =>
                entry.id === subscription.id
                  ? {
                      ...entry,
                      name: input.name,
                      category: input.category || "general",
                      amount: input.amount,
                      paid_by_user_ids: input.paidByUserIds,
                      beneficiary_user_ids: input.beneficiaryUserIds,
                      cron_pattern: financeRecurrenceToCronPattern(input.recurrence),
                      updated_at: nowIso
                    }
                  : entry
              );
              return sortFinanceSubscriptions(next);
            }
          }
        ],
        action: async () => {
          await updateFinanceSubscription(subscription.id, input);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, userId]
  );

  const onDeleteFinanceSubscription = useCallback(
    async (subscription: FinanceSubscription) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdFinanceSubscriptions(activeHousehold.id),
            updater: (current) =>
              ((current as FinanceSubscription[]) ?? []).filter((entry) => entry.id !== subscription.id)
          }
        ],
        action: async () => {
          await deleteFinanceSubscription(subscription.id);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
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

  const onUpdateHouseholdWhiteboard = useCallback(
    async (sceneJson: string) => {
      if (!activeHousehold || !userId) return;

      await executeAction(async () => {
        const updated = await upsertHouseholdWhiteboard(activeHousehold.id, userId, sceneJson);
        queryClient.setQueryData(queryKeys.householdWhiteboard(activeHousehold.id), updated);
      });
    },
    [activeHousehold, executeAction, queryClient, userId]
  );

  const onUpdateMemberSettings = useCallback(
    async (input: { roomSizeSqm: number | null; commonAreaFactor: number }) => {
      if (!activeHousehold || !userId) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdMembers(activeHousehold.id),
            updater: (current) => {
              const members = (current as HouseholdMember[]) ?? [];
              return members.map((member) =>
                member.user_id === userId
                  ? {
                      ...member,
                      room_size_sqm: input.roomSizeSqm,
                      common_area_factor: input.commonAreaFactor
                    }
                  : member
              );
            }
          }
        ],
        action: async () => {
          await updateMemberSettings(activeHousehold.id, userId, input);
          setMessage(t("settings.memberSaved"));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t, userId]
  );

  const onUpdateMemberTaskLaziness = useCallback(
    async (targetUserId: string, taskLazinessFactor: number) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdMembers(activeHousehold.id),
            updater: (current) => {
              const members = (current as HouseholdMember[]) ?? [];
              return members.map((member) =>
                member.user_id === targetUserId
                  ? { ...member, task_laziness_factor: taskLazinessFactor }
                  : member
              );
            }
          }
        ],
        action: async () => {
          await updateMemberTaskLaziness(activeHousehold.id, targetUserId, taskLazinessFactor);
          setMessage(t("settings.memberSaved"));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t]
  );

  const onUpdateMemberSettingsForUser = useCallback(
    async (targetUserId: string, input: { roomSizeSqm: number | null; commonAreaFactor: number }) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdMembers(activeHousehold.id),
            updater: (current) => {
              const members = (current as HouseholdMember[]) ?? [];
              return members.map((member) =>
                member.user_id === targetUserId
                  ? {
                      ...member,
                      room_size_sqm: input.roomSizeSqm,
                      common_area_factor: input.commonAreaFactor
                    }
                  : member
              );
            }
          }
        ],
        action: async () => {
          await updateMemberSettings(activeHousehold.id, targetUserId, input);
          setMessage(t("settings.memberSaved"));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t]
  );

  const onUpdateVacationMode = useCallback(
    async (vacationMode: boolean) => {
      if (!activeHousehold || !userId) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdMembers(activeHousehold.id),
            updater: (current) => {
              const members = (current as HouseholdMember[]) ?? [];
              return members.map((member) =>
                member.user_id === userId ? { ...member, vacation_mode: vacationMode } : member
              );
            }
          }
        ],
        action: async () => {
          await updateMemberVacationMode(activeHousehold.id, userId, vacationMode);
          setMessage(t("settings.vacationModeSaved"));
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate, t, userId]
  );

  const onResetHouseholdPimpers = useCallback(async () => {
    if (!activeHousehold) return;

    await runWithOptimisticUpdate({
      updates: [
        {
          queryKey: queryKeys.householdMemberPimpers(activeHousehold.id),
          updater: (current) => {
            const pimpers = (current as HouseholdMemberPimpers[]) ?? [];
            const nowIso = new Date().toISOString();
            return pimpers.map((entry) => ({
              ...entry,
              total_pimpers: 0,
              updated_at: nowIso
            }));
          }
        }
      ],
      action: async () => {
        await resetHouseholdPimpers(activeHousehold.id);
        setMessage(t("tasks.resetPimpersSuccess"));
      }
    });
  }, [activeHousehold, runWithOptimisticUpdate, t]);

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

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdMembers(activeHousehold.id),
            updater: (current) => {
              const members = (current as HouseholdMember[]) ?? [];
              return members.map((member) =>
                member.user_id === targetUserId ? { ...member, role } : member
              );
            }
          }
        ],
        action: async () => {
          await setHouseholdMemberRole(activeHousehold.id, targetUserId, role);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
  );

  const onRemoveMember = useCallback(
    async (targetUserId: string) => {
      if (!activeHousehold) return;

      await runWithOptimisticUpdate({
        updates: [
          {
            queryKey: queryKeys.householdMembers(activeHousehold.id),
            updater: (current) => ((current as HouseholdMember[]) ?? []).filter((member) => member.user_id !== targetUserId)
          }
        ],
        action: async () => {
          await removeHouseholdMember(activeHousehold.id, targetUserId);
        }
      });
    },
    [activeHousehold, runWithOptimisticUpdate]
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
    onUpdateHouseholdWhiteboard,
    onUpdateHousehold,
    onUpdateMemberSettings,
    onUpdateMemberTaskLaziness,
    onUpdateMemberSettingsForUser,
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
