export const queryKeys = {
  session: ["auth", "session"] as const,
  households: (userId: string) => ["households", userId] as const,
  household: (householdId: string) => ["household", householdId] as const,
  householdBucketItems: (householdId: string) => ["household", householdId, "bucket-items"] as const,
  householdShoppingItems: (householdId: string) => ["household", householdId, "shopping-items"] as const,
  householdShoppingCompletions: (householdId: string) => ["household", householdId, "shopping-completions"] as const,
  householdTasks: (householdId: string) => ["household", householdId, "tasks"] as const,
  householdTaskCompletions: (householdId: string) => ["household", householdId, "task-completions"] as const,
  householdFinances: (householdId: string) => ["household", householdId, "finances"] as const,
  householdCashAuditRequests: (householdId: string) => ["household", householdId, "cash-audit-requests"] as const,
  householdFinanceSubscriptions: (householdId: string) => ["household", householdId, "finance-subscriptions"] as const,
  householdMembers: (householdId: string) => ["household", householdId, "members"] as const,
  householdMemberPimpers: (householdId: string) => ["household", householdId, "member-pimpers"] as const,
  householdEvents: (householdId: string) => ["household", householdId, "events"] as const
};
