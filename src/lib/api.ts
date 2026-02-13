import { v4 as uuid } from "uuid";
import { supabase } from "./supabase";
import type {
  FinanceEntry,
  Household,
  HouseholdMember,
  HouseholdMemberPimpers,
  NewTaskInput,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "./types";

const buildInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeHousehold = (row: Record<string, unknown>): Household => ({
  id: String(row.id),
  name: String(row.name ?? ""),
  image_url: row.image_url ? String(row.image_url) : null,
  address: String(row.address ?? ""),
  currency: String(row.currency ?? "EUR"),
  apartment_size_sqm: toNumberOrNull(row.apartment_size_sqm),
  warm_rent_monthly: toNumberOrNull(row.warm_rent_monthly),
  invite_code: String(row.invite_code),
  created_by: String(row.created_by),
  created_at: String(row.created_at)
});

const normalizeHouseholdMember = (row: Record<string, unknown>): HouseholdMember => ({
  household_id: String(row.household_id),
  user_id: String(row.user_id),
  role: (String(row.role ?? "member") as HouseholdMember["role"]) ?? "member",
  room_size_sqm: toNumberOrNull(row.room_size_sqm),
  common_area_factor: Number(row.common_area_factor ?? 1),
  created_at: String(row.created_at)
});

const normalizeShoppingItem = (row: Record<string, unknown>): ShoppingItem => ({
  id: String(row.id),
  household_id: String(row.household_id),
  title: String(row.title ?? ""),
  tags: Array.isArray(row.tags) ? row.tags.map((entry) => String(entry)) : [],
  recurrence_interval_minutes:
    row.recurrence_interval_minutes === null || row.recurrence_interval_minutes === undefined
      ? null
      : Number(row.recurrence_interval_minutes),
  done: Boolean(row.done),
  done_at: row.done_at ? String(row.done_at) : null,
  done_by: row.done_by ? String(row.done_by) : null,
  created_by: String(row.created_by),
  created_at: String(row.created_at)
});

const normalizeTask = (row: Record<string, unknown>, rotationUserIds: string[]): TaskItem => ({
  id: String(row.id),
  household_id: String(row.household_id),
  title: String(row.title ?? ""),
  description: String(row.description ?? ""),
  start_date: String(row.start_date ?? ""),
  due_at: String(row.due_at),
  frequency_days: Number(row.frequency_days ?? 7),
  effort_pimpers: Number(row.effort_pimpers ?? 1),
  done: Boolean(row.done),
  done_at: row.done_at ? String(row.done_at) : null,
  done_by: row.done_by ? String(row.done_by) : null,
  assignee_id: row.assignee_id ? String(row.assignee_id) : null,
  created_by: String(row.created_by),
  created_at: String(row.created_at),
  rotation_user_ids: rotationUserIds
});

const normalizeShoppingCompletion = (row: Record<string, unknown>): ShoppingItemCompletion => ({
  id: String(row.id),
  shopping_item_id: String(row.shopping_item_id),
  household_id: String(row.household_id),
  title_snapshot: String(row.title_snapshot ?? ""),
  tags_snapshot: Array.isArray(row.tags_snapshot) ? row.tags_snapshot.map((entry) => String(entry)) : [],
  completed_by: String(row.completed_by),
  completed_at: String(row.completed_at)
});

const normalizeTaskCompletion = (row: Record<string, unknown>): TaskCompletion => ({
  id: String(row.id),
  task_id: String(row.task_id),
  household_id: String(row.household_id),
  task_title_snapshot: String(row.task_title_snapshot ?? ""),
  user_id: String(row.user_id),
  pimpers_earned: Number(row.pimpers_earned ?? 0),
  completed_at: String(row.completed_at)
});

const normalizeFinanceEntry = (row: Record<string, unknown>): FinanceEntry => ({
  id: String(row.id),
  household_id: String(row.household_id),
  description: String(row.description ?? ""),
  category: String(row.category ?? "general"),
  amount: Number(row.amount ?? 0),
  paid_by: String(row.paid_by),
  created_at: String(row.created_at)
});

const getDueAtFromStartDate = (startDate: string) => {
  const asDate = new Date(`${startDate}T09:00:00`);
  if (Number.isNaN(asDate.getTime())) {
    return new Date().toISOString();
  }
  return asDate.toISOString();
};

export const signIn = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

export const signUp = async (email: string, password: string) => {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
};

export const signInWithGoogle = async () => {
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined
  });

  if (error) throw error;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

export const updateUserAvatar = async (avatarUrl: string) => {
  const normalizedAvatar = avatarUrl.trim();

  const { error } = await supabase.auth.updateUser({
    data: {
      avatar_url: normalizedAvatar.length > 0 ? normalizedAvatar : null
    }
  });

  if (error) throw error;
};

export const getHouseholdsForUser = async (userId: string): Promise<Household[]> => {
  const { data, error } = await supabase
    .from("household_members")
    .select("household:households(*)")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? [])
    .map((entry) => {
      const relation = (entry as { household: Record<string, unknown> | Record<string, unknown>[] | null }).household;
      if (!relation) return null;
      return Array.isArray(relation) ? (relation[0] ?? null) : relation;
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => normalizeHousehold(entry));
};

export const getHouseholdMembers = async (householdId: string): Promise<HouseholdMember[]> => {
  const { data, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((entry) => normalizeHouseholdMember(entry as Record<string, unknown>));
};

export const getHouseholdMemberPimpers = async (householdId: string): Promise<HouseholdMemberPimpers[]> => {
  const { data, error } = await supabase
    .from("household_member_pimpers")
    .select("*")
    .eq("household_id", householdId)
    .order("total_pimpers", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((entry) => ({
    ...(entry as HouseholdMemberPimpers),
    total_pimpers: Number(entry.total_pimpers)
  }));
};

export const createHousehold = async (name: string, userId: string): Promise<Household> => {
  const { data, error } = await supabase
    .from("households")
    .insert({
      id: uuid(),
      name,
      invite_code: buildInviteCode(),
      created_by: userId
    })
    .select("*")
    .single();

  if (error) throw error;

  const { error: membershipError } = await supabase.from("household_members").insert({
    household_id: data.id,
    user_id: userId,
    role: "owner"
  });

  if (membershipError) throw membershipError;

  return normalizeHousehold(data as Record<string, unknown>);
};

export const joinHouseholdByInvite = async (inviteCode: string, userId: string): Promise<Household> => {
  const { data: household, error } = await supabase
    .from("households")
    .select("*")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .single();

  if (error) throw error;

  const { error: membershipError } = await supabase.from("household_members").upsert(
    {
      household_id: household.id,
      user_id: userId,
      role: "member"
    },
    { onConflict: "household_id,user_id" }
  );

  if (membershipError) throw membershipError;

  return normalizeHousehold(household as Record<string, unknown>);
};

export const updateHouseholdSettings = async (
  householdId: string,
  input: {
    imageUrl: string;
    address: string;
    currency: string;
    apartmentSizeSqm: number | null;
    warmRentMonthly: number | null;
  }
): Promise<Household> => {
  const normalizedImageUrl = input.imageUrl.trim();
  const normalizedAddress = input.address.trim();
  const normalizedCurrency = input.currency.trim().toUpperCase().slice(0, 3);

  if (normalizedCurrency.length !== 3) {
    throw new Error("Currency muss genau 3 Zeichen haben.");
  }

  const { data, error } = await supabase
    .from("households")
    .update({
      image_url: normalizedImageUrl.length > 0 ? normalizedImageUrl : null,
      address: normalizedAddress,
      currency: normalizedCurrency,
      apartment_size_sqm: input.apartmentSizeSqm,
      warm_rent_monthly: input.warmRentMonthly
    })
    .eq("id", householdId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHousehold(data as Record<string, unknown>);
};

export const updateMemberSettings = async (
  householdId: string,
  userId: string,
  input: { roomSizeSqm: number | null; commonAreaFactor: number }
): Promise<HouseholdMember> => {
  const commonAreaFactor = Number(input.commonAreaFactor);
  if (!Number.isFinite(commonAreaFactor) || commonAreaFactor <= 0) {
    throw new Error("Gemeinschaftsfaktor muss groesser als 0 sein.");
  }

  const { data, error } = await supabase
    .from("household_members")
    .update({
      room_size_sqm: input.roomSizeSqm,
      common_area_factor: commonAreaFactor
    })
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHouseholdMember(data as Record<string, unknown>);
};

export const leaveHousehold = async (householdId: string, userId: string) => {
  const { data: memberRow, error: memberError } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .single();

  if (memberError) throw memberError;

  const role = String(memberRow.role ?? "member");
  if (role === "owner") {
    const { count, error: ownerCountError } = await supabase
      .from("household_members")
      .select("user_id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("role", "owner");

    if (ownerCountError) throw ownerCountError;

    if ((count ?? 0) <= 1) {
      throw new Error("Du bist der letzte Owner. Lege zuerst einen weiteren Owner fest.");
    }
  }

  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) throw error;
};

export const getShoppingItems = async (householdId: string): Promise<ShoppingItem[]> => {
  const { error: resetError } = await supabase.rpc("reset_due_recurring_shopping_items", {
    p_household_id: householdId
  });

  if (resetError) throw resetError;

  const { data, error } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("household_id", householdId)
    .order("done", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((entry) => normalizeShoppingItem(entry as Record<string, unknown>));
};

export const addShoppingItem = async (
  householdId: string,
  title: string,
  tags: string[],
  recurrenceIntervalMinutes: number | null,
  userId: string
): Promise<ShoppingItem> => {
  const normalizedTags = tags
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 10);

  const { data, error } = await supabase
    .from("shopping_items")
    .insert({
      id: uuid(),
      household_id: householdId,
      title: title.trim(),
      tags: normalizedTags,
      recurrence_interval_minutes: recurrenceIntervalMinutes,
      done: false,
      created_by: userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeShoppingItem(data as Record<string, unknown>);
};

export const updateShoppingItemStatus = async (id: string, done: boolean, userId: string) => {
  if (done) {
    const { data: sourceItem, error: sourceItemError } = await supabase
      .from("shopping_items")
      .select("id,household_id,title,tags,done")
      .eq("id", id)
      .single();

    if (sourceItemError) throw sourceItemError;

    if (!sourceItem.done) {
      const { error: completionError } = await supabase.from("shopping_item_completions").insert({
        shopping_item_id: sourceItem.id,
        household_id: sourceItem.household_id,
        title_snapshot: sourceItem.title,
        tags_snapshot: sourceItem.tags ?? [],
        completed_by: userId,
        completed_at: new Date().toISOString()
      });

      if (completionError) throw completionError;
    }
  }

  const payload = done
    ? {
        done: true,
        done_at: new Date().toISOString(),
        done_by: userId
      }
    : {
        done: false,
        done_at: null,
        done_by: null
      };

  const { error } = await supabase.from("shopping_items").update(payload).eq("id", id);
  if (error) throw error;
};

export const getShoppingCompletions = async (householdId: string): Promise<ShoppingItemCompletion[]> => {
  const { data, error } = await supabase
    .from("shopping_item_completions")
    .select("*")
    .eq("household_id", householdId)
    .order("completed_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map((entry) => normalizeShoppingCompletion(entry as Record<string, unknown>));
};

export const deleteShoppingItem = async (id: string) => {
  const { error } = await supabase.from("shopping_items").delete().eq("id", id);
  if (error) throw error;
};

export const getTasks = async (householdId: string): Promise<TaskItem[]> => {
  const { error: reopenError } = await supabase.rpc("reopen_due_tasks", {
    p_household_id: householdId
  });
  if (reopenError) throw reopenError;

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("household_id", householdId)
    .order("due_at", { ascending: true });

  if (error) throw error;

  const tasks = (data ?? []) as Record<string, unknown>[];
  const taskIds = tasks.map((entry) => String(entry.id));

  let rotationRows: Array<Record<string, unknown>> = [];
  if (taskIds.length > 0) {
    const { data: loadedRotation, error: rotationError } = await supabase
      .from("task_rotation_members")
      .select("task_id,user_id,position")
      .in("task_id", taskIds)
      .order("position", { ascending: true });

    if (rotationError) throw rotationError;
    rotationRows = (loadedRotation ?? []) as Array<Record<string, unknown>>;
  }

  const rotationMap = new Map<string, string[]>();
  rotationRows.forEach((entry) => {
    const taskId = String(entry.task_id);
    const userId = String(entry.user_id);
    const current = rotationMap.get(taskId) ?? [];
    rotationMap.set(taskId, [...current, userId]);
  });

  return tasks.map((entry) => normalizeTask(entry, rotationMap.get(String(entry.id)) ?? []));
};

export const addTask = async (
  householdId: string,
  input: NewTaskInput,
  userId: string
): Promise<TaskItem> => {
  const cleanedTitle = input.title.trim();
  const cleanedDescription = input.description.trim();
  const rotationUserIds = input.rotationUserIds.filter((entry, index, all) => all.indexOf(entry) === index);

  if (rotationUserIds.length === 0) {
    throw new Error("Task braucht mindestens eine Person in der Rotation.");
  }

  const taskId = uuid();
  const dueAt = getDueAtFromStartDate(input.startDate);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      id: taskId,
      household_id: householdId,
      title: cleanedTitle,
      description: cleanedDescription,
      start_date: input.startDate,
      due_at: dueAt,
      frequency_days: Math.max(1, Math.floor(input.frequencyDays)),
      effort_pimpers: Math.max(1, Math.floor(input.effortPimpers)),
      assignee_id: rotationUserIds[0],
      done: false,
      created_by: userId
    })
    .select("*")
    .single();

  if (error) throw error;

  const rotationRows = rotationUserIds.map((rotationUserId, index) => ({
    task_id: taskId,
    user_id: rotationUserId,
    position: index
  }));

  const { error: rotationError } = await supabase.from("task_rotation_members").insert(rotationRows);
  if (rotationError) {
    await supabase.from("tasks").delete().eq("id", taskId);
    throw rotationError;
  }

  return normalizeTask(data as Record<string, unknown>, rotationUserIds);
};

export const completeTask = async (taskId: string, userId: string) => {
  const { error } = await supabase.rpc("complete_task", {
    p_task_id: taskId,
    p_user_id: userId
  });

  if (error) throw error;
};

export const getTaskCompletions = async (householdId: string): Promise<TaskCompletion[]> => {
  const { data, error } = await supabase
    .from("task_completions")
    .select("*")
    .eq("household_id", householdId)
    .order("completed_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map((entry) => normalizeTaskCompletion(entry as Record<string, unknown>));
};

export const getFinanceEntries = async (householdId: string): Promise<FinanceEntry[]> => {
  const { data, error } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((entry) => normalizeFinanceEntry(entry as Record<string, unknown>));
};

export const addFinanceEntry = async (
  householdId: string,
  description: string,
  amount: number,
  category: string,
  userId: string
): Promise<FinanceEntry> => {
  const normalizedCategory = category.trim() || "general";

  const { data, error } = await supabase
    .from("finance_entries")
    .insert({
      id: uuid(),
      household_id: householdId,
      description: description.trim(),
      category: normalizedCategory,
      amount,
      paid_by: userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeFinanceEntry(data as Record<string, unknown>);
};

export const requestCashAudit = async (householdId: string, userId: string) => {
  const { error } = await supabase.from("cash_audit_requests").insert({
    id: uuid(),
    household_id: householdId,
    requested_by: userId,
    status: "queued"
  });

  if (error) throw error;
};
