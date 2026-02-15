import { useMemo } from "react";
import { getTaskLibrarySuggestions } from "../../lib/task-suggestions";
import type { TaskCompletion, TaskItem } from "../../lib/types";

export interface TaskSuggestion {
  key: string;
  title: string;
  description: string;
  tags: string[];
  count: number;
  source: "history" | "library";
  frequencyDays: number;
  effortPimpers: number;
}

export const buildTaskSuggestions = (
  tasks: TaskItem[],
  completions: TaskCompletion[],
  language: string
): TaskSuggestion[] => {
  const taskHistorySuggestions = (() => {
    const byTitle = new Map<string, TaskSuggestion>();

    tasks.forEach((task) => {
      const normalizedTitle = task.title.trim();
      if (!normalizedTitle) return;
      const key = normalizedTitle.toLocaleLowerCase();
      const current = byTitle.get(key) ?? {
        key: `history:${key}`,
        title: normalizedTitle,
        description: task.description ?? "",
        tags: [],
        count: 0,
        source: "history" as const,
        frequencyDays: task.frequency_days,
        effortPimpers: task.effort_pimpers
      };
      current.count += 1;
      byTitle.set(key, current);
    });

    completions.forEach((completion) => {
      const normalizedTitle = completion.task_title_snapshot.trim();
      if (!normalizedTitle) return;
      const key = normalizedTitle.toLocaleLowerCase();
      const current = byTitle.get(key) ?? {
        key: `history:${key}`,
        title: normalizedTitle,
        description: "",
        tags: [],
        count: 0,
        source: "history" as const,
        frequencyDays: 7,
        effortPimpers: 1
      };
      current.count += 1;
      byTitle.set(key, current);
    });

    return [...byTitle.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  })();

  const taskLibrarySuggestions = getTaskLibrarySuggestions(language).map((entry) => ({
    key: `library:${entry.key}`,
    title: entry.title,
    description: entry.description,
    tags: entry.tags,
    count: 0,
    source: "library" as const,
    frequencyDays: entry.frequencyDays,
    effortPimpers: entry.effortPimpers
  }));

  const map = new Map<string, TaskSuggestion>();
  taskHistorySuggestions.forEach((entry) => map.set(entry.title.toLocaleLowerCase(), entry));
  taskLibrarySuggestions.forEach((entry) => {
    const key = entry.title.toLocaleLowerCase();
    if (!map.has(key)) map.set(key, entry);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
};

export const useTaskSuggestions = (tasks: TaskItem[], completions: TaskCompletion[], language: string) =>
  useMemo(() => buildTaskSuggestions(tasks, completions, language), [completions, language, tasks]);
