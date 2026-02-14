import type { TaskCompletion, TaskItem } from "../../lib/types";

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const buildMonthGrid = (monthDate: Date) => {
  const firstDay = startOfMonth(monthDate);
  const lastDay = endOfMonth(monthDate);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() - (index + 1));
    cells.push({ date, inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(monthDate.getFullYear(), monthDate.getMonth(), day), inCurrentMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const lastDate = cells[cells.length - 1]?.date ?? lastDay;
    const date = new Date(lastDate);
    date.setDate(lastDate.getDate() + 1);
    cells.push({ date, inCurrentMonth: false });
  }

  return cells;
};

export type CalendarEntry = {
  dueTasks: TaskItem[];
  completedTasks: TaskCompletion[];
  memberIds: string[];
};

export const buildCalendarEntriesByDay = (tasks: TaskItem[], completions: TaskCompletion[]) => {
  const map = new Map<string, CalendarEntry>();

  tasks.forEach((task) => {
    if (!task.is_active) return;
    const taskDueDate = new Date(task.due_at);
    if (Number.isNaN(taskDueDate.getTime())) return;
    const key = dayKey(taskDueDate);
    const current = map.get(key) ?? { dueTasks: [], completedTasks: [], memberIds: [] };
    current.dueTasks.push(task);

    const assigneeKey = task.assignee_id ?? "__unassigned__";
    if (!current.memberIds.includes(assigneeKey)) {
      current.memberIds.push(assigneeKey);
    }

    map.set(key, current);
  });

  completions.forEach((completion) => {
    const completedAt = new Date(completion.completed_at);
    if (Number.isNaN(completedAt.getTime())) return;
    const key = dayKey(completedAt);
    const current = map.get(key) ?? { dueTasks: [], completedTasks: [], memberIds: [] };
    current.completedTasks.push(completion);

    if (!current.memberIds.includes(completion.user_id)) {
      current.memberIds.push(completion.user_id);
    }

    map.set(key, current);
  });

  return map;
};

export type CalendarSpanPart = {
  id: string;
  userId: string;
  kind: "single" | "start" | "mid" | "end";
};

export const buildCompletionSpansByDay = (
  completions: TaskCompletion[],
  visibleCalendarDayKeys: Set<string>,
  visibleRange: { start: Date; end: Date } | null
) => {
  const map = new Map<string, CalendarSpanPart[]>();
  const visibleStart = visibleRange?.start;
  const visibleEnd = visibleRange?.end;
  if (!visibleStart || !visibleEnd) return map;

  completions.forEach((completion) => {
    const completedDate = new Date(completion.completed_at);
    if (Number.isNaN(completedDate.getTime())) return;

    const dueDate = completion.due_at_snapshot ? new Date(completion.due_at_snapshot) : completedDate;
    const normalizedDue = Number.isNaN(dueDate.getTime()) ? completedDate : dueDate;

    const rangeStart = startOfDay(normalizedDue <= completedDate ? normalizedDue : completedDate);
    const rangeEnd = startOfDay(normalizedDue <= completedDate ? completedDate : normalizedDue);
    const visibleRangeStart = rangeStart.getTime() < visibleStart.getTime() ? visibleStart : rangeStart;
    const visibleRangeEnd = rangeEnd.getTime() > visibleEnd.getTime() ? visibleEnd : rangeEnd;

    if (visibleRangeStart.getTime() > visibleRangeEnd.getTime()) return;

    const startKey = dayKey(rangeStart);
    const endKey = dayKey(rangeEnd);

    const cursor = new Date(visibleRangeStart);
    while (cursor.getTime() <= visibleRangeEnd.getTime()) {
      const key = dayKey(cursor);
      if (visibleCalendarDayKeys.has(key)) {
        const kind =
          key === startKey && key === endKey
            ? "single"
            : key === startKey
              ? "start"
              : key === endKey
                ? "end"
                : "mid";

        const current = map.get(key) ?? [];
        current.push({
          id: completion.id,
          userId: completion.user_id,
          kind
        });
        map.set(key, current);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return map;
};
