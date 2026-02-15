import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/query-keys";

interface UseWorkspaceActionsOptions {
  queryClient: QueryClient;
  activeHouseholdId: string | null;
  executeAction: (action: () => Promise<void>) => Promise<void>;
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

  return {
    invalidateWorkspace,
    runWithWorkspaceInvalidation
  };
};
