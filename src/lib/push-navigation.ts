export const getForegroundPushRoute = (data: Record<string, string>) => {
  const type = data.type;
  if (data.taskId) {
    if (type === "task_completed" || type === "task_skipped") {
      return "/tasks/history";
    }
    return "/tasks/overview";
  }
  if (data.shoppingItemId) {
    if (type === "shopping_completed") {
      return "/shopping/history";
    }
    return "/shopping/list";
  }
  if (data.financeEntryId) {
    return "/finances/overview";
  }
  if (data.bucketItemId) {
    return "/home/bucket";
  }
  if (type === "cash_audit_requested") {
    return "/finances/overview";
  }
  return "/home/summary";
};
