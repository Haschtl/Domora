import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type QueryKey,
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { householdQueryOptions, type HouseholdQueryKey } from "../lib/household-queries";
import {
  getFinanceEntriesPage,
  getHouseholdEventsPage,
  type FinanceEntriesPage,
  type HouseholdEventsPage
} from "../lib/api";
import type {
  BucketItem,
  CashAuditRequest,
  FinanceSubscription,
  HouseholdWhiteboard,
  HouseholdMemberPimpers,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "../lib/types";

const emptyArrayQuery = <T>() => ({
  queryFn: async (): Promise<T[]> => []
});

const resolveHouseholdBatch = async (
  queryClient: ReturnType<typeof useQueryClient>,
  householdId: string,
  keys: HouseholdQueryKey[]
) => {
  const results = await Promise.all(
    keys.map((key) => {
      const options = householdQueryOptions[key](householdId);
      return queryClient.ensureQueryData(options as Parameters<typeof queryClient.ensureQueryData>[0]);
    })
  );
  return keys.reduce<Record<string, unknown>>((acc, key, index) => {
    acc[key] = results[index];
    return acc;
  }, {});
};

export const useHouseholdHomeBatch = (householdId: string | null, enabled = true) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: householdId ? ["household", householdId, "batch", "home"] : ["household", "none", "batch", "home"],
    queryFn: () =>
      resolveHouseholdBatch(queryClient, householdId!, [
        "bucketItems",
        "tasks",
        "taskCompletions",
        "cashAuditRequests",
        "householdWhiteboard"
      ]),
    enabled: Boolean(householdId) && enabled
  });
};

export const useHouseholdTasksBatch = (householdId: string | null, enabled = true) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: householdId ? ["household", householdId, "batch", "tasks"] : ["household", "none", "batch", "tasks"],
    queryFn: () =>
      resolveHouseholdBatch(queryClient, householdId!, ["tasks", "taskCompletions", "memberPimpers"]),
    enabled: Boolean(householdId) && enabled
  });
};

export const useHouseholdShoppingBatch = (householdId: string | null, enabled = true) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: householdId
      ? ["household", householdId, "batch", "shopping"]
      : ["household", "none", "batch", "shopping"],
    queryFn: () =>
      resolveHouseholdBatch(queryClient, householdId!, ["shoppingItems", "shoppingCompletions"]),
    enabled: Boolean(householdId) && enabled
  });
};

export const useHouseholdFinancesBatch = (householdId: string | null, enabled = true) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: householdId
      ? ["household", householdId, "batch", "finances"]
      : ["household", "none", "batch", "finances"],
    queryFn: () =>
      resolveHouseholdBatch(queryClient, householdId!, ["financeSubscriptions", "cashAuditRequests"]),
    enabled: Boolean(householdId) && enabled
  });
};

export const useHouseholdBucketItems = (householdId: string | null) =>
  useQuery<BucketItem[]>({
    ...(householdId
      ? householdQueryOptions.bucketItems(householdId)
      : { queryKey: ["household", "none", "bucket-items"], ...emptyArrayQuery<BucketItem>() }),
    enabled: Boolean(householdId)
  });

export const useHouseholdShoppingItems = (householdId: string | null) =>
  useQuery<ShoppingItem[]>({
    ...(householdId
      ? householdQueryOptions.shoppingItems(householdId)
      : { queryKey: ["household", "none", "shopping-items"], ...emptyArrayQuery<ShoppingItem>() }),
    enabled: Boolean(householdId)
  });

export const useHouseholdShoppingCompletions = (householdId: string | null) =>
  useQuery<ShoppingItemCompletion[]>({
    ...(householdId
      ? householdQueryOptions.shoppingCompletions(householdId)
      : { queryKey: ["household", "none", "shopping-completions"], ...emptyArrayQuery<ShoppingItemCompletion>() }),
    enabled: Boolean(householdId)
  });

export const useHouseholdTasks = (householdId: string | null, enabled = true) =>
  useQuery<TaskItem[]>({
    ...(householdId
      ? householdQueryOptions.tasks(householdId)
      : { queryKey: ["household", "none", "tasks"], ...emptyArrayQuery<TaskItem>() }),
    enabled: Boolean(householdId) && enabled
  });

export const useHouseholdTaskCompletions = (householdId: string | null, enabled = true) =>
  useQuery<TaskCompletion[]>({
    ...(householdId
      ? householdQueryOptions.taskCompletions(householdId)
      : { queryKey: ["household", "none", "task-completions"], ...emptyArrayQuery<TaskCompletion>() }),
    enabled: Boolean(householdId) && enabled
  });

export const useHouseholdFinances = (
  householdId: string | null,
  enabled = true
): UseInfiniteQueryResult<InfiniteData<FinanceEntriesPage, string | null>, Error> =>
  useInfiniteQuery<
    FinanceEntriesPage,
    Error,
    InfiniteData<FinanceEntriesPage, string | null>,
    QueryKey,
    string | null
  >({
    queryKey: householdId ? householdQueryOptions.finances(householdId).queryKey : ["household", "none", "finances"],
    queryFn: ({ pageParam }) => getFinanceEntriesPage(householdId!, { cursor: pageParam as string | null | undefined }),
    enabled: Boolean(householdId) && enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

export const useHouseholdCashAuditRequests = (householdId: string | null, enabled = true) =>
  useQuery<CashAuditRequest[]>({
    ...(householdId
      ? householdQueryOptions.cashAuditRequests(householdId)
      : { queryKey: ["household", "none", "cash-audit-requests"], ...emptyArrayQuery<CashAuditRequest>() }),
    enabled: Boolean(householdId) && enabled
  });

export const useHouseholdFinanceSubscriptions = (householdId: string | null, enabled = true) =>
  useQuery<FinanceSubscription[]>({
    ...(householdId
      ? householdQueryOptions.financeSubscriptions(householdId)
      : { queryKey: ["household", "none", "finance-subscriptions"], ...emptyArrayQuery<FinanceSubscription>() }),
    enabled: Boolean(householdId) && enabled
  });

export const useHouseholdMemberPimpers = (householdId: string | null, enabled = true) =>
  useQuery<HouseholdMemberPimpers[]>({
    ...(householdId
      ? householdQueryOptions.memberPimpers(householdId)
      : { queryKey: ["household", "none", "member-pimpers"], ...emptyArrayQuery<HouseholdMemberPimpers>() }),
    enabled: Boolean(householdId) && enabled
  });

export const useHouseholdEvents = (
  householdId: string | null,
  enabled = true
): UseInfiniteQueryResult<InfiniteData<HouseholdEventsPage, string | null>, Error> =>
  useInfiniteQuery<
    HouseholdEventsPage,
    Error,
    InfiniteData<HouseholdEventsPage, string | null>,
    QueryKey,
    string | null
  >({
    queryKey: householdId ? householdQueryOptions.householdEvents(householdId).queryKey : ["household", "none", "events"],
    queryFn: ({ pageParam }) => getHouseholdEventsPage(householdId!, { cursor: pageParam as string | null | undefined }),
    enabled: Boolean(householdId) && enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

export const useHouseholdWhiteboard = (householdId: string | null, enabled = true) =>
  useQuery<HouseholdWhiteboard>({
    ...(householdId
      ? householdQueryOptions.householdWhiteboard(householdId)
      : {
          queryKey: ["household", "none", "whiteboard"],
          queryFn: async () => ({
            household_id: "none",
            scene_json: "",
            updated_by: null,
            updated_at: new Date(0).toISOString()
          })
        }),
    enabled: Boolean(householdId) && enabled
  });
