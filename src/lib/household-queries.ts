import type { QueryClient } from "@tanstack/react-query";
import {
  getBucketItems,
  getCashAuditRequests,
  getFinanceEntries,
  getFinanceSubscriptions,
  getHouseholdEvents,
  getHouseholdMemberPimpers,
  getHouseholdMembers,
  getShoppingCompletions,
  getShoppingItems,
  getTaskCompletions,
  getTasks
} from "./api";
import { queryKeys } from "./query-keys";

export const householdQueryOptions = {
  bucketItems: (householdId: string) => ({
    queryKey: queryKeys.householdBucketItems(householdId),
    queryFn: () => getBucketItems(householdId)
  }),
  shoppingItems: (householdId: string) => ({
    queryKey: queryKeys.householdShoppingItems(householdId),
    queryFn: () => getShoppingItems(householdId)
  }),
  shoppingCompletions: (householdId: string) => ({
    queryKey: queryKeys.householdShoppingCompletions(householdId),
    queryFn: () => getShoppingCompletions(householdId)
  }),
  tasks: (householdId: string) => ({
    queryKey: queryKeys.householdTasks(householdId),
    queryFn: () => getTasks(householdId)
  }),
  taskCompletions: (householdId: string) => ({
    queryKey: queryKeys.householdTaskCompletions(householdId),
    queryFn: () => getTaskCompletions(householdId)
  }),
  finances: (householdId: string) => ({
    queryKey: queryKeys.householdFinances(householdId),
    queryFn: () => getFinanceEntries(householdId)
  }),
  cashAuditRequests: (householdId: string) => ({
    queryKey: queryKeys.householdCashAuditRequests(householdId),
    queryFn: () => getCashAuditRequests(householdId)
  }),
  financeSubscriptions: (householdId: string) => ({
    queryKey: queryKeys.householdFinanceSubscriptions(householdId),
    queryFn: () => getFinanceSubscriptions(householdId)
  }),
  householdMembers: (householdId: string) => ({
    queryKey: queryKeys.householdMembers(householdId),
    queryFn: () => getHouseholdMembers(householdId)
  }),
  memberPimpers: (householdId: string) => ({
    queryKey: queryKeys.householdMemberPimpers(householdId),
    queryFn: () => getHouseholdMemberPimpers(householdId)
  }),
  householdEvents: (householdId: string) => ({
    queryKey: queryKeys.householdEvents(householdId),
    queryFn: () => getHouseholdEvents(householdId)
  })
};

export type HouseholdQueryKey = keyof typeof householdQueryOptions;

export const ensureHouseholdQueries = async (
  queryClient: QueryClient,
  householdId: string,
  queries: HouseholdQueryKey[]
) => {
  await Promise.all(
    queries.map((key) => {
      const options = householdQueryOptions[key](householdId);
      return queryClient.ensureQueryData(
        options as Parameters<QueryClient["ensureQueryData"]>[0]
      );
    })
  );
};
