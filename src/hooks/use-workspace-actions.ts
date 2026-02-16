import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/query-keys";

interface UseWorkspaceActionsOptions {
  queryClient: QueryClient;
  activeHouseholdId: string | null;
  executeAction: (action: () => Promise<void>) => Promise<void>;
}

interface OptimisticUpdate<TData = unknown> {
  queryKey: readonly unknown[];
  updater: (current: TData | undefined) => TData | undefined;
}

export const useWorkspaceActions = ({ queryClient, activeHouseholdId, executeAction }: UseWorkspaceActionsOptions) => {
  const invalidateWorkspace = useCallback(async () => {
    if (!activeHouseholdId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.household(activeHouseholdId), exact: false });
  }, [activeHouseholdId, queryClient]);

  const runWithWorkspaceInvalidation = useCallback(
    async (action: () => Promise<void>) => {
      await executeAction(async () => {
        await action();
        await invalidateWorkspace();
      });
    },
    [executeAction, invalidateWorkspace]
  );

  const runWithOptimisticUpdate = useCallback(
    async (options: {
      updates: OptimisticUpdate<unknown>[];
      action: () => Promise<void>;
      invalidate?: boolean;
    }) => {
      await executeAction(async () => {
        const snapshots = options.updates.map(({ queryKey }) => ({
          queryKey,
          data: queryClient.getQueryData(queryKey)
        }));

        options.updates.forEach(({ queryKey, updater }) => {
          queryClient.setQueryData(queryKey, (current:unknown) => updater(current));
        });

        try {
          await options.action();
        } catch (error) {
          snapshots.forEach(({ queryKey, data }) => {
            queryClient.setQueryData(queryKey, data);
          });
          throw error;
        } finally {
          if (options.invalidate !== false) {
            await invalidateWorkspace();
          }
        }
      });
    },
    [executeAction, invalidateWorkspace, queryClient]
  );

  return {
    invalidateWorkspace,
    runWithWorkspaceInvalidation,
    runWithOptimisticUpdate
  };
};
