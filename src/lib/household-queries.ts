import type { QueryClient } from "@tanstack/react-query";
import {
  getBucketItems,
  getCashAuditRequests,
  getFinanceSubscriptions,
  getHouseholdMemberPimpers,
  getHouseholdMembers,
  getOneOffTaskClaims,
  getMemberVacations,
  getHouseholdWhiteboard,
  getShoppingCompletions,
  getShoppingItems,
  getTaskComments,
  getTaskCompletions,
  getTaskTimeCorrectionProposals,
  getTaskTimeEntries,
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
  taskComments: (householdId: string) => ({
    queryKey: queryKeys.householdTaskComments(householdId),
    queryFn: () => getTaskComments(householdId)
  }),
  taskTimeEntries: (householdId: string) => ({
    queryKey: queryKeys.householdTaskTimeEntries(householdId),
    queryFn: () => getTaskTimeEntries(householdId)
  }),
  taskTimeCorrectionProposals: (householdId: string) => ({
    queryKey: queryKeys.householdTaskTimeCorrectionProposals(householdId),
    queryFn: () => getTaskTimeCorrectionProposals(householdId)
  }),
  oneOffTaskClaims: (householdId: string) => ({
    queryKey: queryKeys.householdOneOffTaskClaims(householdId),
    queryFn: () => getOneOffTaskClaims(householdId)
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
  memberVacations: (householdId: string) => ({
    queryKey: queryKeys.householdMemberVacations(householdId),
    queryFn: () => getMemberVacations(householdId)
  }),
  memberPimpers: (householdId: string) => ({
    queryKey: queryKeys.householdMemberPimpers(householdId),
    queryFn: () => getHouseholdMemberPimpers(householdId)
  }),
  householdWhiteboard: (householdId: string) => ({
    queryKey: queryKeys.householdWhiteboard(householdId),
    queryFn: () => getHouseholdWhiteboard(householdId)
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
