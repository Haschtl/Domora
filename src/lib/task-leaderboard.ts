import { parseISO, isValid } from "date-fns";
import type { TaskCompletion } from "./types";

export type MemberOfMonth = {
  userId: string;
  totalPimpers: number;
  averageDelayMinutes: number;
  completionCount: number;
};

export const getMemberOfMonth = (
  completions: TaskCompletion[],
  range: { start: Date; end: Date }
): MemberOfMonth | null => {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const stats = new Map<string, { totalPimpers: number; totalDelay: number; count: number }>();

  completions.forEach((entry) => {
    const parsed = parseISO(entry.completed_at);
    if (!isValid(parsed)) return;
    const ts = parsed.getTime();
    if (ts < startMs || ts > endMs) return;
    const current = stats.get(entry.user_id) ?? { totalPimpers: 0, totalDelay: 0, count: 0 };
    stats.set(entry.user_id, {
      totalPimpers: current.totalPimpers + Math.max(0, entry.pimpers_earned),
      totalDelay: current.totalDelay + Math.max(0, entry.delay_minutes ?? 0),
      count: current.count + 1
    });
  });

  if (stats.size === 0) return null;

  const rows: MemberOfMonth[] = Array.from(stats.entries()).map(([userId, value]) => ({
    userId,
    totalPimpers: value.totalPimpers,
    completionCount: value.count,
    averageDelayMinutes: value.count > 0 ? value.totalDelay / value.count : 0
  }));

  rows.sort(
    (a, b) =>
      b.totalPimpers - a.totalPimpers ||
      a.averageDelayMinutes - b.averageDelayMinutes ||
      a.userId.localeCompare(b.userId)
  );

  return rows[0] ?? null;
};
