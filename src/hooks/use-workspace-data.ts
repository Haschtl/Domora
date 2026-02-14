import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Session } from "@supabase/supabase-js";
import { appStore, setActiveHouseholdId } from "../lib/app-store";
import {
  getCashAuditRequests,
  getCurrentSession,
  getFinanceEntries,
  getFinanceSubscriptions,
  getHouseholdEvents,
  getHouseholdMemberPimpers,
  getHouseholdMembers,
  getHouseholdsForUser,
  getShoppingCompletions,
  getShoppingItems,
  getTaskCompletions,
  getTasks
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { supabase } from "../lib/supabase";
import type {
  CashAuditRequest,
  FinanceEntry,
  FinanceSubscription,
  HouseholdEvent,
  Household,
  HouseholdMember,
  HouseholdMemberPimpers,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "../lib/types";

interface WorkspaceData {
  shoppingItems: ShoppingItem[];
  shoppingCompletions: ShoppingItemCompletion[];
  tasks: TaskItem[];
  taskCompletions: TaskCompletion[];
  finances: FinanceEntry[];
  cashAuditRequests: CashAuditRequest[];
  financeSubscriptions: FinanceSubscription[];
  householdMembers: HouseholdMember[];
  memberPimpers: HouseholdMemberPimpers[];
  householdEvents: HouseholdEvent[];
}

const emptyWorkspace: WorkspaceData = {
  shoppingItems: [],
  shoppingCompletions: [],
  tasks: [],
  taskCompletions: [],
  finances: [],
  cashAuditRequests: [],
  financeSubscriptions: [],
  householdMembers: [],
  memberPimpers: [],
  householdEvents: []
};

const getWorkspaceData = async (householdId: string): Promise<WorkspaceData> => {
  const [shoppingItems, shoppingCompletions, tasks, taskCompletions, finances, cashAuditRequests, financeSubscriptions, householdMembers, memberPimpers, householdEvents] =
    await Promise.all([
      getShoppingItems(householdId),
      getShoppingCompletions(householdId),
      getTasks(householdId),
      getTaskCompletions(householdId),
      getFinanceEntries(householdId),
      getCashAuditRequests(householdId),
      getFinanceSubscriptions(householdId),
      getHouseholdMembers(householdId),
      getHouseholdMemberPimpers(householdId),
      getHouseholdEvents(householdId)
    ]);

  return {
    shoppingItems,
    shoppingCompletions,
    tasks,
    taskCompletions,
    finances,
    cashAuditRequests,
    financeSubscriptions,
    householdMembers,
    memberPimpers,
    householdEvents
  };
};

export const useWorkspaceData = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery<Session | null>({
    queryKey: queryKeys.session,
    queryFn: getCurrentSession
  });

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      queryClient.setQueryData(queryKeys.session, nextSession);
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
  const householdsLoadError = useMemo(() => {
    const queryError = householdsQuery.error;
    if (!queryError) return null;
    return queryError instanceof Error ? queryError.message : "Unknown error";
  }, [householdsQuery.error]);
  const households = useMemo<Household[]>(() => householdsQuery.data ?? [], [householdsQuery.data]);
  const activeHouseholdId = useStore(appStore, (state: { activeHouseholdId: string | null }) => state.activeHouseholdId);

  useEffect(() => {
    if (!activeHouseholdId) return;

    const channel = supabase
      .channel(`household-events-${activeHouseholdId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "household_events",
          filter: `household_id=eq.${activeHouseholdId}`
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.workspace(activeHouseholdId) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeHouseholdId, queryClient]);

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
  const userDisplayName = useMemo(() => {
    const metadata = session?.user.user_metadata;
    const rawDisplayName = metadata?.display_name;
    if (typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0) return rawDisplayName.trim();

    const rawFullName = metadata?.full_name;
    if (typeof rawFullName === "string" && rawFullName.trim().length > 0) return rawFullName.trim();

    return null;
  }, [session?.user.user_metadata]);

  const currentMember = useMemo(
    () =>
      userId ? workspace.householdMembers.find((entry: HouseholdMember) => entry.user_id === userId) ?? null : null,
    [workspace.householdMembers, userId]
  );
  const userPaypalName = currentMember?.paypal_name ?? null;
  const userRevolutName = currentMember?.revolut_name ?? null;
  const userWeroName = currentMember?.wero_name ?? null;

  const completedTasks = useMemo(
    () => workspace.tasks.filter((task: TaskItem) => task.done).length,
    [workspace.tasks]
  );

  return {
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
    householdEvents: workspace.householdEvents
  };
};
