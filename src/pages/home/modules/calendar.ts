import type { BucketItem, CashAuditRequest, FinanceEntry, TaskCompletion, TaskItem } from "../../../lib/types";

export type HomeCalendarBucketVote = {
  item: BucketItem;
  date: string;
  voters: string[];
};

export type HomeCalendarShoppingEntry = {
  id: string;
  title: string;
  userId: string | null;
  at: string;
};

export type HomeCalendarVacationEntry = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  note: string | null;
  manual?: boolean;
};

export type HomeCalendarVacationSpan = HomeCalendarVacationEntry & {
  kind: "single" | "start" | "middle" | "end";
};

export type HomeCalendarDueTask = {
  task: TaskItem;
  status: "overdue" | "due" | "upcoming";
};

export type HomeCalendarEntry = {
  cleaningDueTasks: HomeCalendarDueTask[];
  taskCompletions: TaskCompletion[];
  financeEntries: FinanceEntry[];
  bucketVotes: HomeCalendarBucketVote[];
  shoppingEntries: HomeCalendarShoppingEntry[];
  cashAudits: CashAuditRequest[];
  vacations: HomeCalendarVacationEntry[];
};

export const MAX_CALENDAR_TOOLTIP_ITEMS = 4;
