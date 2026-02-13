export const memberProfiles = [
  { displayName: "Anna Becker" },
  { displayName: "Maximilian Koch" },
  { displayName: "Leonie Hartmann" },
  { displayName: "Jonas Wagner" },
  { displayName: "Sofia Neumann" },
  { displayName: "Noah Fischer" },
  { displayName: "Mia Schuster" },
  { displayName: "Paul Krueger" },
  { displayName: "Clara Weiss" },
  { displayName: "Lukas Braun" }
];

export const financeCategories = ["groceries", "utilities", "internet", "cleaning", "household", "repairs"];

export const taskTitles = [
  "Kueche putzen",
  "Bad putzen",
  "Muell rausbringen",
  "Flur saugen",
  "Einkauf planen",
  "Papiermuell entsorgen",
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
  "Kuechenutensilien",
  "Reparatur Kleinmaterial",
  "Spuelmittel + Schwamm"
];

export const shoppingTitles = [
  "Milch",
  "Haferflocken",
  "Toilettenpapier",
  "Spuelmaschinentabs",
  "Muellbeutel",
  "Zahnpasta",
  "Spuelmittel",
  "Kuechenrolle",
  "Waschmittel",
  "Brot",
  "Eier",
  "Kaffee",
  "Muessli",
  "Seife",
  "Allzweckreiniger"
];

export const shoppingTags = [
  ["lebensmittel"],
  ["fruehstueck"],
  ["haushalt", "hygiene"],
  ["haushalt", "kueche"],
  ["haushalt"],
  ["hygiene"],
  ["kueche"],
  ["haushalt", "kueche"],
  ["waesche"],
  ["baeckerei"],
  ["lebensmittel", "protein"],
  ["getraenke"],
  ["fruehstueck"],
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

export const buildCompletionRows = ({ insertedTasks, householdId }) =>
  insertedTasks
    .filter((task) => task.done && task.done_by)
    .map((task) => ({
      task_id: task.id,
      household_id: householdId,
      task_title_snapshot: task.title,
      user_id: task.done_by,
      pimpers_earned: task.effort_pimpers,
      completed_at: new Date(new Date(task.due_at).getTime() + 2 * 60 * 60 * 1000).toISOString()
    }));

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

  for (let i = 0; i < financeCount; i += 1) {
    const payer = users[i % users.length];
    const progress = i / Math.max(financeCount - 1, 1);
    const dayOffset = Math.round(progress * historyDays);
    const jitterHours = (i % 5) * 3 + 1;
    const createdAt = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000 - jitterHours * 60 * 60 * 1000);
    const amount = Number((8 + random() * 120).toFixed(2));

    rows.push({
      household_id: householdId,
      description: financeDescriptions[i % financeDescriptions.length],
      category: financeCategories[i % financeCategories.length],
      amount,
      paid_by: payer.id,
      paid_by_user_ids: [payer.id],
      beneficiary_user_ids: allUserIds.length > 0 ? allUserIds : [payer.id],
      entry_date: createdAt.toISOString().slice(0, 10),
      created_at: createdAt.toISOString()
    });
  }

  return rows;
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
