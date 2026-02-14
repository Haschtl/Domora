export const memberProfiles = [
  { displayName: "Anna Becker" },
  { displayName: "Maximilian Koch" },
  { displayName: "Leonie Hartmann" },
  { displayName: "Jonas Wagner" },
  { displayName: "Sofia Neumann" },
  { displayName: "Noah Fischer" },
  { displayName: "Mia Schuster" },
  { displayName: "Paul Krüger" },
  { displayName: "Clara Weiss" },
  { displayName: "Lukas Braun" }
];

export const financeCategories = ["groceries", "utilities", "internet", "cleaning", "household", "repairs"];

export const taskTitles = [
  "Küche putzen",
  "Bad putzen",
  "Müll rausbringen",
  "Flur saugen",
  "Einkauf planen",
  "Papiermüll entsorgen",
  "Vorrat checken",
  "Fenster putzen",
  "Pflanzen giessen",
  "Waschmaschine reinigen"
];

export const financeDescriptions = [
  "Wocheneinkauf",
  "Putzmittel",
  "Strom Nachzahlung",
  "Internet Monatsbeitrag",
  "Toilettenpapier und Basics",
  "Küchenutensilien",
  "Reparatur Kleinmaterial",
  "Spülmittel + Schwamm"
];

export const shoppingTitles = [
  "Milch",
  "Haferflocken",
  "Toilettenpapier",
  "Spülmaschinentabs",
  "Müllbeutel",
  "Zahnpasta",
  "Spülmittel",
  "Küchenrolle",
  "Waschmittel",
  "Brot",
  "Eier",
  "Kaffee",
  "Müsli",
  "Seife",
  "Allzweckreiniger"
];

export const shoppingTags = [
  ["lebensmittel"],
  ["frühstück"],
  ["haushalt", "hygiene"],
  ["haushalt", "küche"],
  ["haushalt"],
  ["hygiene"],
  ["küche"],
  ["haushalt", "küche"],
  ["wäsche"],
  ["bäckerei"],
  ["lebensmittel", "protein"],
  ["getränke"],
  ["frühstück"],
  ["hygiene"],
  ["putzen"]
];

export const toInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

export const randomCode = (length, random = Math.random) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(random() * chars.length)];
  }
  return out;
};

export const buildMemberRows = ({ householdId, users }) =>
  users.map((user, index) => ({
    household_id: householdId,
    user_id: user.id,
    role: index === 0 ? "owner" : "member",
    room_size_sqm: 12 + index * 2,
    common_area_factor: index === 0 ? 1.1 : 1
  }));

export const buildTaskRows = ({ taskCount, users, householdId, ownerId, now }) => {
  const rows = [];
  for (let i = 0; i < taskCount; i += 1) {
    const assignee = users[i % users.length];
    const isDone = i % 3 === 0;
    const dueAt = new Date(now.getTime() + (i - 3) * 24 * 60 * 60 * 1000);
    const doneAt = isDone ? new Date(dueAt.getTime() + 4 * 60 * 60 * 1000) : null;
    const effort = 1 + (i % 4);

    rows.push({
      household_id: householdId,
      title: taskTitles[i % taskTitles.length],
      description: `Demo Task ${i + 1}`,
      start_date: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      due_at: dueAt.toISOString(),
      frequency_days: 3 + (i % 5),
      effort_pimpers: effort,
      done: isDone,
      done_at: doneAt ? doneAt.toISOString() : null,
      done_by: isDone ? assignee.id : null,
      assignee_id: assignee.id,
      created_by: ownerId
    });
  }

  return rows;
};

export const buildRotationRows = ({ insertedTasks, users }) => {
  const rows = [];
  insertedTasks.forEach((task, taskIndex) => {
    users.forEach((_user, position) => {
      rows.push({
        task_id: task.id,
        user_id: users[(position + taskIndex) % users.length].id,
        position
      });
    });
  });
  return rows;
};

export const buildCompletionRows = ({ insertedTasks, householdId }) => {
  const rows = [];
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  insertedTasks.forEach((task, index) => {
    const userId = task.done_by ?? task.assignee_id;
    if (!userId) return;

    const completionCount = task.done ? 4 + (index % 4) : 2 + (index % 2);
    const pairIndex = Math.floor(index / 2);
    const pairCycleDays = 6 + (pairIndex % 4);
    const baseCompletedAt = new Date(now.getTime() - pairIndex * 3 * dayMs);

    for (let round = 0; round < completionCount; round += 1) {
      // Paired tasks (index 0/1, 2/3, ...) share many completion timestamps.
      // This creates more realistic "we did two chores together" patterns.
      const completedAt = new Date(baseCompletedAt.getTime() - round * pairCycleDays * dayMs);
      completedAt.setUTCHours(18 + (pairIndex % 3), (round * 7) % 60, 0, 0);

      // Realistic late completions: between 1 and 30 days after due date.
      const delayDays = 1 + ((pairIndex * 7 + round * 11 + (index % 2) * 3) % 30);
      const delayMinutes = delayDays * 24 * 60;
      const dueAt = new Date(completedAt.getTime() - delayDays * dayMs);
      rows.push({
        task_id: task.id,
        household_id: householdId,
        task_title_snapshot: task.title,
        user_id: userId,
        pimpers_earned: task.effort_pimpers,
        due_at_snapshot: dueAt.toISOString(),
        delay_minutes: delayMinutes,
        completed_at: completedAt.toISOString()
      });
    }
  });

  return rows;
};

export const buildEventRows = ({
  householdId,
  completionRows,
  shoppingCompletionRows,
  financeRows,
  memberRows
}) => {
  const rows = [];

  completionRows.forEach((entry) => {
    rows.push({
      household_id: householdId,
      event_type: "task_completed",
      actor_user_id: entry.user_id,
      subject_user_id: null,
      payload: {
        taskId: entry.task_id,
        title: entry.task_title_snapshot
      },
      created_at: entry.completed_at
    });
  });

  shoppingCompletionRows.forEach((entry) => {
    rows.push({
      household_id: householdId,
      event_type: "shopping_completed",
      actor_user_id: entry.completed_by,
      subject_user_id: null,
      payload: {
        shoppingItemId: entry.shopping_item_id,
        title: entry.title_snapshot
      },
      created_at: entry.completed_at
    });
  });

  financeRows.forEach((entry) => {
    rows.push({
      household_id: householdId,
      event_type: "finance_created",
      actor_user_id: entry.created_by,
      subject_user_id: null,
      payload: {
        description: entry.description,
        amount: entry.amount
      },
      created_at: entry.created_at
    });
  });

  memberRows.forEach((entry, index) => {
    if (entry.role !== "owner") return;
    rows.push({
      household_id: householdId,
      event_type: "role_changed",
      actor_user_id: memberRows[0]?.user_id ?? entry.user_id,
      subject_user_id: entry.user_id,
      payload: {
        previousRole: "member",
        nextRole: "owner"
      },
      created_at: new Date(Date.now() - (index + 1) * 12 * 60 * 60 * 1000).toISOString()
    });
  });

  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

export const buildPimperRows = ({ users, householdId, completionRows }) => {
  const pimperTotals = new Map();
  completionRows.forEach((entry) => {
    pimperTotals.set(entry.user_id, (pimperTotals.get(entry.user_id) ?? 0) + entry.pimpers_earned);
  });

  return users.map((user) => ({
    household_id: householdId,
    user_id: user.id,
    total_pimpers: pimperTotals.get(user.id) ?? 0
  }));
};

export const buildFinanceRows = ({ financeCount, users, householdId, now, random = Math.random }) => {
  const rows = [];
  const allUserIds = users.map((entry) => entry.id);
  const historyDays = Math.max(60, Math.ceil((financeCount * 210) / Math.max(financeCount, 1)));

  const pickUsersByMode = (mode, anchorIndex) => {
    if (allUserIds.length === 0) return [];
    if (allUserIds.length === 1) return [allUserIds[0]];

    if (mode === "single") {
      return [allUserIds[anchorIndex % allUserIds.length]];
    }

    if (mode === "pair") {
      const first = anchorIndex % allUserIds.length;
      const second = (anchorIndex + 1) % allUserIds.length;
      return [...new Set([allUserIds[first], allUserIds[second]])];
    }

    if (mode === "allExceptOne") {
      const excluded = allUserIds[anchorIndex % allUserIds.length];
      const subset = allUserIds.filter((id) => id !== excluded);
      return subset.length > 0 ? subset : [excluded];
    }

    if (mode === "triple") {
      if (allUserIds.length <= 3) return [...allUserIds];
      const start = anchorIndex % allUserIds.length;
      return [0, 1, 2].map((offset) => allUserIds[(start + offset) % allUserIds.length]);
    }

    return [...allUserIds];
  };

  for (let i = 0; i < financeCount; i += 1) {
    const payer = users[i % users.length];
    const creator = users[(i + 1) % users.length] ?? payer;
    const progress = i / Math.max(financeCount - 1, 1);
    const dayOffset = Math.round(progress * historyDays);
    const jitterHours = (i % 5) * 3 + 1;
    const createdAt = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000 - jitterHours * 60 * 60 * 1000);
    const amount = Number((8 + random() * 120).toFixed(2));
    const variant = i % 6;

    let paidByUserIds = [payer.id];
    if (variant === 1) {
      paidByUserIds = pickUsersByMode("pair", i);
      if (!paidByUserIds.includes(payer.id)) paidByUserIds = [payer.id, ...paidByUserIds].slice(0, 2);
    } else if (variant === 4) {
      paidByUserIds = pickUsersByMode("triple", i);
      if (!paidByUserIds.includes(payer.id)) paidByUserIds = [payer.id, ...paidByUserIds];
    }

    let beneficiaryUserIds;
    if (variant === 0) {
      beneficiaryUserIds = pickUsersByMode("all", i);
    } else if (variant === 1) {
      beneficiaryUserIds = pickUsersByMode("pair", i + 1);
    } else if (variant === 2) {
      beneficiaryUserIds = pickUsersByMode("allExceptOne", i);
    } else if (variant === 3) {
      beneficiaryUserIds = pickUsersByMode("single", i + 2);
    } else if (variant === 4) {
      beneficiaryUserIds = pickUsersByMode("triple", i + 1);
    } else {
      beneficiaryUserIds = pickUsersByMode("all", i);
    }

    rows.push({
      household_id: householdId,
      description: financeDescriptions[i % financeDescriptions.length],
      category: financeCategories[i % financeCategories.length],
      amount,
      paid_by: payer.id,
      paid_by_user_ids: paidByUserIds.length > 0 ? [...new Set(paidByUserIds)] : [payer.id],
      beneficiary_user_ids: beneficiaryUserIds.length > 0 ? [...new Set(beneficiaryUserIds)] : [payer.id],
      entry_date: createdAt.toISOString().slice(0, 10),
      created_by: creator.id,
      created_at: createdAt.toISOString()
    });
  }

  return rows;
};

export const buildSubscriptionRows = ({ householdId, ownerId, users, now }) => {
  const allUserIds = users.map((entry) => entry.id);
  const firstUser = users[0]?.id ?? ownerId;
  const secondUser = users[1]?.id ?? firstUser;
  const lastUser = users[users.length - 1]?.id ?? firstUser;

  return [
    {
      household_id: householdId,
      name: "Rundfunkbeitrag",
      category: "utilities",
      amount: 18.36,
      paid_by_user_ids: [firstUser],
      beneficiary_user_ids: allUserIds.length > 0 ? allUserIds : [firstUser],
      cron_pattern: "0 9 1 */3 *",
      created_by: ownerId,
      created_at: new Date(now.getTime() - 110 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      household_id: householdId,
      name: "Internet",
      category: "internet",
      amount: 44.99,
      paid_by_user_ids: [...new Set([firstUser, secondUser])],
      beneficiary_user_ids: users.length > 2 ? allUserIds.filter((id) => id !== lastUser) : [...allUserIds],
      cron_pattern: "0 9 1 * *",
      created_by: ownerId,
      created_at: new Date(now.getTime() - 140 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];
};

export const buildShoppingRows = ({ shoppingCount, users, householdId, ownerId, now }) => {
  const rows = [];
  const historyDays = Math.max(45, Math.ceil((shoppingCount * 150) / Math.max(shoppingCount, 1)));

  for (let i = 0; i < shoppingCount; i += 1) {
    const creator = users[i % users.length] ?? { id: ownerId };
    const isDone = i % 4 === 0;
    const progress = i / Math.max(shoppingCount - 1, 1);
    const dayOffset = Math.round(progress * historyDays);
    const createdAt = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000 - (i % 6) * 60 * 60 * 1000);
    const doneAt = isDone ? new Date(createdAt.getTime() + 6 * 60 * 60 * 1000) : null;
    const hasRecurrence = i % 3 === 0;
    const recurrenceInterval =
      hasRecurrence
        ? i % 2 === 0
          ? { value: 1 + (i % 2), unit: "weeks" }
          : { value: 1, unit: "months" }
        : null;

    rows.push({
      household_id: householdId,
      title: shoppingTitles[i % shoppingTitles.length],
      tags: shoppingTags[i % shoppingTags.length],
      recurrence_interval_value: recurrenceInterval?.value ?? null,
      recurrence_interval_unit: recurrenceInterval?.unit ?? null,
      done: isDone,
      done_at: doneAt ? doneAt.toISOString() : null,
      done_by: isDone ? creator.id : null,
      created_by: creator.id,
      created_at: createdAt.toISOString()
    });
  }

  return rows;
};

export const buildCashAuditRows = ({ householdId, requestedBy, now, auditCount = 4 }) => {
  const count = Math.max(1, auditCount);
  const rows = [];

  for (let i = 0; i < count; i += 1) {
    const monthsAgo = count - i;
    const createdAt = new Date(now.getTime());
    createdAt.setMonth(createdAt.getMonth() - monthsAgo);
    createdAt.setDate(Math.max(2, 24 - i * 3));
    createdAt.setHours(18, 30, 0, 0);

    rows.push({
      household_id: householdId,
      requested_by: requestedBy,
      status: "sent",
      created_at: createdAt.toISOString()
    });
  }

  return rows;
};

export const buildShoppingCompletionRows = ({ insertedShoppingItems, householdId }) =>
  insertedShoppingItems
    .filter((item) => item.done && item.done_by && item.done_at)
    .map((item) => ({
      shopping_item_id: item.id,
      household_id: householdId,
      title_snapshot: item.title,
      tags_snapshot: item.tags ?? [],
      completed_by: item.done_by,
      completed_at: item.done_at
    }));
