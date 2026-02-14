import { getTaskLibrarySuggestions } from "../../../lib/task-suggestions";
import type { TaskCompletion, TaskItem } from "../../../lib/types";
import { buildTaskSuggestions } from "./use-task-suggestions";

const task = (partial: Partial<TaskItem>): TaskItem => ({
  id: partial.id ?? "t-1",
  household_id: partial.household_id ?? "h-1",
  title: partial.title ?? "Bad putzen",
  description: partial.description ?? "",
  start_date: partial.start_date ?? "2026-02-13",
  due_at: partial.due_at ?? "2026-02-13T12:00:00.000Z",
  cron_pattern: partial.cron_pattern ?? "0 9 */7 * *",
  frequency_days: partial.frequency_days ?? 7,
  effort_pimpers: partial.effort_pimpers ?? 1,
  prioritize_low_pimpers: partial.prioritize_low_pimpers ?? true,
  is_active: partial.is_active ?? true,
  done: partial.done ?? false,
  done_at: partial.done_at ?? null,
  done_by: partial.done_by ?? null,
  assignee_id: partial.assignee_id ?? null,
  created_by: partial.created_by ?? "u-1",
  created_at: partial.created_at ?? "2026-02-13T10:00:00.000Z",
  rotation_user_ids: partial.rotation_user_ids ?? ["u-1"]
});

const completion = (partial: Partial<TaskCompletion>): TaskCompletion => ({
  id: partial.id ?? "tc-1",
  task_id: partial.task_id ?? "t-1",
  household_id: partial.household_id ?? "h-1",
  task_title_snapshot: partial.task_title_snapshot ?? "Bad putzen",
  user_id: partial.user_id ?? "u-1",
  pimpers_earned: partial.pimpers_earned ?? 1,
  completed_at: partial.completed_at ?? "2026-02-13T12:00:00.000Z"
});

describe("buildTaskSuggestions", () => {
  it("ranks history by count and keeps task metadata", () => {
    const suggestions = buildTaskSuggestions(
      [
        task({ id: "t-1", title: "Bad putzen", frequency_days: 7, effort_pimpers: 3 }),
        task({ id: "t-2", title: "Muell rausbringen", frequency_days: 3, effort_pimpers: 1 })
      ],
      [
        completion({ id: "c-1", task_title_snapshot: "Muell rausbringen" }),
        completion({ id: "c-2", task_title_snapshot: "Muell rausbringen" })
      ],
      "de"
    );

    const top = suggestions[0];
    expect(top?.title).toBe("Muell rausbringen");
    expect(top?.count).toBe(3);
    expect(top?.source).toBe("history");
    expect(top?.frequencyDays).toBe(3);
    expect(top?.effortPimpers).toBe(1);
  });

  it("prefers history over library for same normalized title", () => {
    const libraryTitle = getTaskLibrarySuggestions("de")[0]?.title ?? "Bad putzen";
    const suggestions = buildTaskSuggestions(
      [task({ id: "t-1", title: libraryTitle, description: "Meine Variante" })],
      [],
      "de"
    );

    const sameTitle = suggestions.filter((entry) => entry.title.toLocaleLowerCase() === libraryTitle.toLocaleLowerCase());
    expect(sameTitle).toHaveLength(1);
    expect(sameTitle[0]?.source).toBe("history");
    expect(sameTitle[0]?.description).toBe("Meine Variante");
  });
});
