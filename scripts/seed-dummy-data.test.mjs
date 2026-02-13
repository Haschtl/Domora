import { describe, expect, it } from "vitest";
import {
  buildCompletionRows,
  buildFinanceRows,
  buildMemberRows,
  buildPimperRows,
  buildShoppingCompletionRows,
  buildShoppingRows,
  buildRotationRows,
  buildTaskRows,
  randomCode,
  toInt
} from "./seed-dummy-data.mjs";

describe("seed-dummy-data", () => {
  it("parses integers with floor and lower bound", () => {
    expect(toInt("7.9", 5)).toBe(7);
    expect(toInt("0", 5)).toBe(1);
    expect(toInt("not-a-number", 5)).toBe(5);
  });

  it("creates a code with requested length and alphabet", () => {
    const deterministic = [0, 0.5, 0.99, 0.25];
    let index = 0;
    const value = randomCode(4, () => {
      const next = deterministic[index % deterministic.length];
      index += 1;
      return next;
    });

    expect(value).toHaveLength(4);
    expect(value).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });

  it("builds deterministic member/task/finance rows with valid invariants", () => {
    const now = new Date("2026-02-13T12:00:00.000Z");
    const users = [{ id: "u-1" }, { id: "u-2" }, { id: "u-3" }];
    const householdId = "h-1";

    const memberRows = buildMemberRows({ householdId, users });
    expect(memberRows).toHaveLength(3);
    expect(memberRows[0]).toMatchObject({ role: "owner", common_area_factor: 1.1 });
    expect(memberRows.slice(1).every((entry) => entry.role === "member")).toBe(true);

    const taskRows = buildTaskRows({
      taskCount: 6,
      users,
      householdId,
      ownerId: users[0].id,
      now
    });
    expect(taskRows).toHaveLength(6);
    expect(taskRows.every((entry) => entry.household_id === householdId)).toBe(true);
    expect(taskRows.every((entry) => entry.frequency_days > 0 && entry.effort_pimpers > 0)).toBe(true);

    const insertedTasks = taskRows.map((entry, idx) => ({
      id: `t-${idx + 1}`,
      title: entry.title,
      done: entry.done,
      done_by: entry.done_by,
      effort_pimpers: entry.effort_pimpers,
      due_at: entry.due_at
    }));

    const rotationRows = buildRotationRows({ insertedTasks, users });
    expect(rotationRows).toHaveLength(insertedTasks.length * users.length);

    const completionRows = buildCompletionRows({ insertedTasks, householdId });
    expect(completionRows.every((entry) => entry.household_id === householdId)).toBe(true);
    expect(completionRows.every((entry) => entry.pimpers_earned > 0)).toBe(true);

    const pimperRows = buildPimperRows({ users, householdId, completionRows });
    expect(pimperRows).toHaveLength(users.length);
    expect(pimperRows.every((entry) => entry.total_pimpers >= 0)).toBe(true);

    let randomCall = 0;
    const financeRows = buildFinanceRows({
      financeCount: 5,
      users,
      householdId,
      now,
      random: () => {
        randomCall += 1;
        return 0.42;
      }
    });
    expect(financeRows).toHaveLength(5);
    expect(randomCall).toBe(5);
    expect(financeRows.every((entry) => entry.amount >= 8 && entry.amount <= 128)).toBe(true);
    expect(financeRows.every((entry) => entry.household_id === householdId)).toBe(true);

    const shoppingRows = buildShoppingRows({
      shoppingCount: 7,
      users,
      householdId,
      ownerId: users[0].id,
      now
    });
    expect(shoppingRows).toHaveLength(7);
    expect(shoppingRows.every((entry) => entry.household_id === householdId)).toBe(true);
    expect(
      shoppingRows.every(
        (entry) =>
          (entry.recurrence_interval_value === null && entry.recurrence_interval_unit === null) ||
          (entry.recurrence_interval_value > 0 && ["days", "weeks", "months"].includes(entry.recurrence_interval_unit))
      )
    ).toBe(true);

    const insertedShoppingItems = shoppingRows.map((entry, idx) => ({
      id: `s-${idx + 1}`,
      title: entry.title,
      tags: entry.tags,
      done: entry.done,
      done_by: entry.done_by,
      done_at: entry.done_at
    }));
    const shoppingCompletionRows = buildShoppingCompletionRows({ insertedShoppingItems, householdId });
    expect(shoppingCompletionRows.every((entry) => entry.household_id === householdId)).toBe(true);
    expect(shoppingCompletionRows.every((entry) => entry.completed_by)).toBe(true);
  });
});
