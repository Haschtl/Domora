import { v4 as uuid } from "uuid";
import { z } from "zod";
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

const optionalNumberSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  },
  z.number().finite().nullable()
);

const positiveOptionalNumberSchema = optionalNumberSchema.refine(
  (value) => value === null || value > 0,
  "Expected a positive number or null"
);

const nonNegativeOptionalNumberSchema = optionalNumberSchema.refine(
  (value) => value === null || value >= 0,
  "Expected a non-negative number or null"
);

const householdSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  image_url: z.string().nullable().optional().transform((value) => value ?? null),
  address: z.string().default(""),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  apartment_size_sqm: positiveOptionalNumberSchema,
  warm_rent_monthly: nonNegativeOptionalNumberSchema,
  invite_code: z.string().min(1),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const householdMemberSchema = z.object({
  household_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["owner", "member"]),
  room_size_sqm: positiveOptionalNumberSchema,
  common_area_factor: z.coerce.number().finite().positive(),
  created_at: z.string().min(1)
});

const shoppingItemSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  recurrence_interval_minutes: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
  done: z.coerce.boolean(),
  done_at: z.string().nullable().optional().transform((value) => value ?? null),
  done_by: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const taskSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
  start_date: z.string().min(1),
  due_at: z.string().min(1),
  frequency_days: z.coerce.number().int().positive(),
  effort_pimpers: z.coerce.number().int().positive(),
  done: z.coerce.boolean(),
  done_at: z.string().nullable().optional().transform((value) => value ?? null),
  done_by: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  assignee_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const shoppingCompletionSchema = z.object({
  id: z.string().uuid(),
  shopping_item_id: z.string().uuid(),
  household_id: z.string().uuid(),
  title_snapshot: z.string().default(""),
  tags_snapshot: z.array(z.string()).default([]),
  completed_by: z.string().uuid(),
  completed_at: z.string().min(1)
});

const taskCompletionSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  household_id: z.string().uuid(),
  task_title_snapshot: z.string().default(""),
  user_id: z.string().uuid(),
  pimpers_earned: z.coerce.number().int().positive(),
  completed_at: z.string().min(1)
});

const financeEntrySchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  description: z.string().min(1),
  category: z.string().min(1),
  amount: z.coerce.number().finite().nonnegative(),
  paid_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const normalizeHousehold = (row: Record<string, unknown>): Household => ({
  ...householdSchema.parse(row)
});

const normalizeHouseholdMember = (row: Record<string, unknown>): HouseholdMember => ({
  ...householdMemberSchema.parse(row)
});

const normalizeShoppingItem = (row: Record<string, unknown>): ShoppingItem => ({
  ...shoppingItemSchema.parse(row)
});

const normalizeTask = (row: Record<string, unknown>, rotationUserIds: string[]): TaskItem => ({
  ...taskSchema.parse(row),
  rotation_user_ids: rotationUserIds
});

const normalizeShoppingCompletion = (row: Record<string, unknown>): ShoppingItemCompletion => ({
  ...shoppingCompletionSchema.parse(row)
});

const normalizeTaskCompletion = (row: Record<string, unknown>): TaskCompletion => ({
  ...taskCompletionSchema.parse(row)
});

const normalizeFinanceEntry = (row: Record<string, unknown>): FinanceEntry => ({
  ...financeEntrySchema.parse(row)
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
  const normalizedAvatar = z.string().trim().parse(avatarUrl);

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
  const validatedName = z.string().trim().min(1).max(120).parse(name);
  const validatedUserId = z.string().uuid().parse(userId);

  const { data, error } = await supabase
    .from("households")
    .insert({
      id: uuid(),
      name: validatedName,
      invite_code: buildInviteCode(),
      created_by: validatedUserId
    })
    .select("*")
    .single();

  if (error) throw error;

  const { error: membershipError } = await supabase.from("household_members").insert({
    household_id: data.id,
    user_id: userId,
    role: "owner"
  });

  if (membershipError) {
    // Avoid leaving orphan households if owner membership insert fails.
    await supabase.from("households").delete().eq("id", data.id);
    throw membershipError;
  }

  return normalizeHousehold(data as Record<string, unknown>);
};

export const joinHouseholdByInvite = async (inviteCode: string, userId: string): Promise<Household> => {
  const validatedInviteCode = z.string().trim().min(1).max(32).parse(inviteCode).toUpperCase();
  const validatedUserId = z.string().uuid().parse(userId);

  const { data: household, error } = await supabase
    .from("households")
    .select("*")
    .eq("invite_code", validatedInviteCode)
    .single();

  if (error) throw error;

  const { error: membershipError } = await supabase.from("household_members").upsert(
    {
      household_id: household.id,
      user_id: validatedUserId,
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
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const parsedInput = z.object({
    imageUrl: z.string().trim(),
    address: z.string().trim().max(300),
    currency: z.string().trim().toUpperCase().length(3),
    apartmentSizeSqm: positiveOptionalNumberSchema,
    warmRentMonthly: nonNegativeOptionalNumberSchema
  }).parse(input);

  const { data, error } = await supabase
    .from("households")
    .update({
      image_url: parsedInput.imageUrl.length > 0 ? parsedInput.imageUrl : null,
      address: parsedInput.address,
      currency: parsedInput.currency,
      apartment_size_sqm: parsedInput.apartmentSizeSqm,
      warm_rent_monthly: parsedInput.warmRentMonthly
    })
    .eq("id", validatedHouseholdId)
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
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);
  const parsedInput = z.object({
    roomSizeSqm: positiveOptionalNumberSchema,
    commonAreaFactor: z.coerce.number().finite().positive()
  }).parse(input);

  const { data, error } = await supabase
    .from("household_members")
    .update({
      room_size_sqm: parsedInput.roomSizeSqm,
      common_area_factor: parsedInput.commonAreaFactor
    })
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHouseholdMember(data as Record<string, unknown>);
};

export const leaveHousehold = async (householdId: string, userId: string) => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);

  const { data: memberRow, error: memberError } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId)
    .single();

  if (memberError) throw memberError;

  const role = String(memberRow.role ?? "member");
  if (role === "owner") {
    const { count, error: ownerCountError } = await supabase
      .from("household_members")
      .select("user_id", { count: "exact", head: true })
      .eq("household_id", validatedHouseholdId)
      .eq("role", "owner");

    if (ownerCountError) throw ownerCountError;

    if ((count ?? 0) <= 1) {
      throw new Error("Du bist der letzte Owner. Lege zuerst einen weiteren Owner fest.");
    }
  }

  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId);

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
  const parsedInput = z.object({
    householdId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    recurrenceIntervalMinutes: z.coerce.number().int().positive().nullable(),
    userId: z.string().uuid()
  }).parse({
    householdId,
    title,
    tags: tags.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    recurrenceIntervalMinutes,
    userId
  });

  const { data, error } = await supabase
    .from("shopping_items")
    .insert({
      id: uuid(),
      household_id: parsedInput.householdId,
      title: parsedInput.title,
      tags: parsedInput.tags,
      recurrence_interval_minutes: parsedInput.recurrenceIntervalMinutes,
      done: false,
      created_by: parsedInput.userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeShoppingItem(data as Record<string, unknown>);
};

export const updateShoppingItemStatus = async (id: string, done: boolean, userId: string) => {
  const validatedId = z.string().uuid().parse(id);
  const validatedUserId = z.string().uuid().parse(userId);

  if (done) {
    const { data: sourceItem, error: sourceItemError } = await supabase
      .from("shopping_items")
      .select("id,household_id,title,tags,done")
      .eq("id", validatedId)
      .single();

    if (sourceItemError) throw sourceItemError;

    if (!sourceItem.done) {
      const { error: completionError } = await supabase.from("shopping_item_completions").insert({
        shopping_item_id: sourceItem.id,
        household_id: sourceItem.household_id,
        title_snapshot: sourceItem.title,
        tags_snapshot: sourceItem.tags ?? [],
        completed_by: validatedUserId,
        completed_at: new Date().toISOString()
      });

      if (completionError) throw completionError;
    }
  }

  const payload = done
    ? {
        done: true,
        done_at: new Date().toISOString(),
        done_by: validatedUserId
      }
    : {
        done: false,
        done_at: null,
        done_by: null
      };

  const { error } = await supabase.from("shopping_items").update(payload).eq("id", validatedId);
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
  const validatedId = z.string().uuid().parse(id);
  const { error } = await supabase.from("shopping_items").delete().eq("id", validatedId);
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
  const parsedInput = z.object({
    householdId: z.string().uuid(),
    userId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    startDate: z.string().min(1),
    frequencyDays: z.coerce.number().int().positive(),
    effortPimpers: z.coerce.number().int().positive(),
    rotationUserIds: z.array(z.string().uuid()).min(1)
  }).parse({
    householdId,
    userId,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    frequencyDays: input.frequencyDays,
    effortPimpers: input.effortPimpers,
    rotationUserIds: input.rotationUserIds.filter((entry, index, all) => all.indexOf(entry) === index)
  });

  const rotationUserIds = parsedInput.rotationUserIds;

  const taskId = uuid();
  const dueAt = getDueAtFromStartDate(parsedInput.startDate);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      id: taskId,
      household_id: parsedInput.householdId,
      title: parsedInput.title,
      description: parsedInput.description,
      start_date: parsedInput.startDate,
      due_at: dueAt,
      frequency_days: parsedInput.frequencyDays,
      effort_pimpers: parsedInput.effortPimpers,
      assignee_id: rotationUserIds[0],
      done: false,
      created_by: parsedInput.userId
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
  const validatedTaskId = z.string().uuid().parse(taskId);
  const validatedUserId = z.string().uuid().parse(userId);

  const { error } = await supabase.rpc("complete_task", {
    p_task_id: validatedTaskId,
    p_user_id: validatedUserId
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
  const parsedInput = z.object({
    householdId: z.string().uuid(),
    userId: z.string().uuid(),
    description: z.string().trim().min(1).max(200),
    amount: z.coerce.number().finite().nonnegative(),
    category: z.string().trim().max(80)
  }).parse({
    householdId,
    userId,
    description,
    amount,
    category
  });

  const normalizedCategory = parsedInput.category || "general";

  const { data, error } = await supabase
    .from("finance_entries")
    .insert({
      id: uuid(),
      household_id: parsedInput.householdId,
      description: parsedInput.description,
      category: normalizedCategory,
      amount: parsedInput.amount,
      paid_by: parsedInput.userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeFinanceEntry(data as Record<string, unknown>);
};

export const requestCashAudit = async (householdId: string, userId: string) => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);

  const { error } = await supabase.from("cash_audit_requests").insert({
    id: uuid(),
    household_id: validatedHouseholdId,
    requested_by: validatedUserId,
    status: "queued"
  });

  if (error) throw error;
};
