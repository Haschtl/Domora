export const queryKeys = {
  session: ["auth", "session"] as const,
  households: (userId: string) => ["households", userId] as const,
  workspace: (householdId: string) => ["workspace", householdId] as const
};
