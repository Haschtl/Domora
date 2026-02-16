import { v4 as uuid } from "uuid";
import { z } from "zod";
import { calculateBalancesByMember } from "./finance-math";
import {
  assertCanDemoteOwner,
  assertCanDissolveHousehold,
  assertCanLeaveAsOwner,
  assertCanLeaveWithBalance,
  assertCanRemoveOwner
} from "./household-guards";
import { supabase } from "./supabase";
import type {
  BucketItem,
  CashAuditRequest,
  FinanceEntry,
  FinanceSubscription,
  FinanceSubscriptionRecurrence,
  HouseholdEvent,
  HouseholdWhiteboard,
  Household,
  HouseholdMember,
  HouseholdMemberPimpers,
  NewFinanceSubscriptionInput,
  NewTaskInput,
  UpdateHouseholdInput,
  PushPreferences,
  ShoppingRecurrenceUnit,
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
const percentageNumberSchema = z.coerce.number().finite().min(0).max(100);
const shoppingRecurrenceUnitSchema = z.enum(["days", "weeks", "months"]);
const financeSubscriptionRecurrenceSchema = z.enum(["weekly", "monthly", "quarterly"]);

const householdSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  image_url: z.string().nullable().optional().transform((value) => value ?? null),
  address: z.string().default(""),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  apartment_size_sqm: positiveOptionalNumberSchema,
  cold_rent_monthly: nonNegativeOptionalNumberSchema,
  utilities_monthly: nonNegativeOptionalNumberSchema,
  utilities_on_room_sqm_percent: percentageNumberSchema.default(0),
  task_laziness_enabled: z.coerce.boolean().default(false),
  theme_primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#1f8a7f"),
  theme_accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#14b8a6"),
  theme_font_family: z.string().min(1).default('"Space Grotesk", "Segoe UI", sans-serif'),
  theme_radius_scale: z.coerce.number().min(0.5).max(1.5).default(1),
  landing_page_markdown: z.string().default(""),
  invite_code: z.string().min(1),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const householdMemberSchema = z.object({
  household_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["owner", "member"]),
  display_name: z.string().nullable().optional().transform((value) => value ?? null),
  avatar_url: z.string().nullable().optional().transform((value) => value ?? null),
  user_color: z.string().nullable().optional().transform((value) => value ?? null),
  room_size_sqm: positiveOptionalNumberSchema,
  common_area_factor: z.coerce.number().finite().min(0).max(2),
  task_laziness_factor: z.coerce.number().finite().min(0).max(2).default(1),
  vacation_mode: z.coerce.boolean().default(false),
  created_at: z.string().min(1)
});
const userProfileSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().nullable().optional().transform((value) => value ?? null),
  avatar_url: z.string().nullable().optional().transform((value) => value ?? null),
  user_color: z.string().nullable().optional().transform((value) => value ?? null),
  paypal_name: z.string().nullable().optional().transform((value) => value ?? null),
  revolut_name: z.string().nullable().optional().transform((value) => value ?? null),
  wero_name: z.string().nullable().optional().transform((value) => value ?? null)
});

const shoppingItemSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  recurrence_interval_value: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
  recurrence_interval_unit: shoppingRecurrenceUnitSchema.nullable().optional().transform((value) => value ?? null),
  done: z.coerce.boolean(),
  done_at: z.string().nullable().optional().transform((value) => value ?? null),
  done_by: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const bucketItemSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  title: z.string().min(1),
  description_markdown: z.string().nullable().optional().transform((value) => value ?? ""),
  suggested_dates: z.array(z.string().min(1)).nullable().optional().transform((value) => value ?? []),
  done: z.coerce.boolean(),
  done_at: z.string().nullable().optional().transform((value) => value ?? null),
  done_by: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const bucketItemDateVoteSchema = z.object({
  bucket_item_id: z.string().uuid(),
  household_id: z.string().uuid(),
  suggested_date: z.string().min(1),
  user_id: z.string().uuid(),
  created_at: z.string().min(1)
});

const taskSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
  current_state_image_url: z.string().nullable().optional().transform((value) => value ?? null),
  target_state_image_url: z.string().nullable().optional().transform((value) => value ?? null),
  start_date: z.string().min(1),
  due_at: z.string().min(1),
  cron_pattern: z.string().min(1).default("0 9 */7 * *"),
  frequency_days: z.coerce.number().int().positive(),
  effort_pimpers: z.coerce.number().int().positive(),
  grace_minutes: z.coerce.number().int().nonnegative().default(1440),
  prioritize_low_pimpers: z.coerce.boolean().default(true),
  assignee_fairness_mode: z.enum(["actual", "projection", "expected"]).default("expected"),
  is_active: z.coerce.boolean().default(true),
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
  due_at_snapshot: z.string().nullable().optional().transform((value) => value ?? null),
  delay_minutes: z.coerce.number().int().nonnegative().default(0),
  completed_at: z.string().min(1),
  rating_average: z.coerce.number().finite().nullable().optional().transform((value) => value ?? null),
  rating_count: z.coerce.number().int().nonnegative().optional().default(0),
  my_rating: z.coerce.number().int().min(1).max(5).nullable().optional().transform((value) => value ?? null)
});

const taskCompletionRatingSchema = z.object({
  task_completion_id: z.string().uuid(),
  household_id: z.string().uuid(),
  user_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5)
});

const householdEventSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  event_type: z.enum([
    "task_completed",
    "task_skipped",
    "shopping_completed",
    "finance_created",
    "role_changed",
    "cash_audit_requested",
    "admin_hint",
    "pimpers_reset"
  ]),
  actor_user_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  subject_user_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().min(1)
});

const householdWhiteboardSchema = z.object({
  household_id: z.string().uuid(),
  scene_json: z.string().max(10 * 1024 * 1024).default(""),
  updated_by: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  updated_at: z.string().min(1)
});

const financeEntrySchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  description: z.string().min(1),
  category: z.string().min(1),
  amount: z.coerce.number().finite().nonnegative(),
  receipt_image_url: z.string().nullable().optional().transform((value) => value ?? null),
  paid_by: z.string().uuid(),
  paid_by_user_ids: z.array(z.string().uuid()).default([]),
  beneficiary_user_ids: z.array(z.string().uuid()).default([]),
  entry_date: z.string().min(1).default(""),
  created_by: z.string().uuid(),
  created_at: z.string().min(1)
});

const cashAuditRequestSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  requested_by: z.string().uuid(),
  status: z.enum(["queued", "sent", "failed"]),
  created_at: z.string().min(1)
});

const financeSubscriptionSchema = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  name: z.string().min(1),
  category: z.string().min(1),
  amount: z.coerce.number().finite().nonnegative(),
  paid_by_user_ids: z.array(z.string().uuid()).default([]),
  beneficiary_user_ids: z.array(z.string().uuid()).default([]),
  cron_pattern: z.string().min(1),
  created_by: z.string().uuid(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
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

const normalizeBucketItem = (row: Record<string, unknown>): BucketItem => ({
  ...(() => {
    const parsed = bucketItemSchema.parse(row);
    return {
      ...parsed,
      description_markdown: parsed.description_markdown ?? "",
      suggested_dates: [...new Set(parsed.suggested_dates)].sort(),
      votes_by_date: {} as Record<string, string[]>
    };
  })()
});

const normalizeTask = (row: Record<string, unknown>, rotationUserIds: string[]): TaskItem => {
  const parsed = taskSchema.parse(row);
  const dayPart = parsed.cron_pattern.trim().split(/\s+/)[2] ?? "";
  const cronFrequencyDays = dayPart.startsWith("*/") ? Number(dayPart.slice(2)) : Number.NaN;
  const normalizedFrequencyDays =
    Number.isFinite(cronFrequencyDays) && cronFrequencyDays > 0
      ? Math.max(1, Math.floor(cronFrequencyDays))
      : Math.max(1, Math.floor(parsed.frequency_days));

  return {
    ...parsed,
    cron_pattern: parsed.cron_pattern || `0 9 */${Math.max(1, Math.floor(parsed.frequency_days))} * *`,
    frequency_days: normalizedFrequencyDays,
    rotation_user_ids: rotationUserIds
  };
};

const normalizeShoppingCompletion = (row: Record<string, unknown>): ShoppingItemCompletion => ({
  ...shoppingCompletionSchema.parse(row)
});

const normalizeTaskCompletion = (row: Record<string, unknown>): TaskCompletion => ({
  ...taskCompletionSchema.parse(row)
});

const normalizeHouseholdEvent = (row: Record<string, unknown>): HouseholdEvent => ({
  ...householdEventSchema.parse(row)
});

const normalizeHouseholdWhiteboard = (row: Record<string, unknown>): HouseholdWhiteboard => ({
  ...householdWhiteboardSchema.parse(row)
});

const normalizeFinanceEntry = (row: Record<string, unknown>): FinanceEntry => ({
  ...(() => {
    const parsed = financeEntrySchema.parse(row);
    const fallbackDate =
      typeof row.created_at === "string" && row.created_at.length >= 10 ? row.created_at.slice(0, 10) : "";
    return {
      ...parsed,
      paid_by_user_ids: parsed.paid_by_user_ids.length > 0 ? parsed.paid_by_user_ids : [parsed.paid_by],
      beneficiary_user_ids: parsed.beneficiary_user_ids,
      entry_date: parsed.entry_date || fallbackDate
    };
  })()
});

const normalizeCashAuditRequest = (row: Record<string, unknown>): CashAuditRequest => ({
  ...cashAuditRequestSchema.parse(row)
});

const recurrenceToCronPattern = (recurrence: FinanceSubscriptionRecurrence) => {
  if (recurrence === "weekly") return "0 9 * * 1";
  if (recurrence === "quarterly") return "0 9 1 */3 *";
  return "0 9 1 * *";
};

const taskFrequencyDaysToCronPattern = (frequencyDays: number) => {
  const normalized = Math.max(1, Math.floor(frequencyDays));
  return `0 9 */${normalized} * *`;
};

const normalizeFinanceSubscription = (row: Record<string, unknown>): FinanceSubscription => {
  const parsed = financeSubscriptionSchema.parse(row);
  return {
    ...parsed,
    paid_by_user_ids: parsed.paid_by_user_ids,
    beneficiary_user_ids: parsed.beneficiary_user_ids
  };
};

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
  const redirectTo =
    typeof window !== "undefined"
      ? new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString()
      : undefined;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined
  });

  if (error) throw error;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (!error) return;

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const message = typeof error.message === "string" ? error.message : "";
  const shouldFallback = isOffline || /fetch|network/i.test(message);

  if (shouldFallback) {
    const { error: localError } = await supabase.auth.signOut({ scope: "local" });
    if (!localError) return;
  }

  throw error;
};

export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

const requireAuthenticatedUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error("Not authenticated");
  return z.string().uuid().parse(userId);
};

const insertHouseholdEvent = async (input: {
  householdId: string;
  eventType: HouseholdEvent["event_type"];
  actorUserId?: string | null;
  subjectUserId?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: string;
}) => {
  const parsed = z
    .object({
      householdId: z.string().uuid(),
      eventType: z.enum([
        "task_completed",
        "task_skipped",
        "shopping_completed",
        "finance_created",
        "role_changed",
        "cash_audit_requested",
        "admin_hint"
      ]),
      actorUserId: z.string().uuid().nullable().optional(),
      subjectUserId: z.string().uuid().nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
      createdAt: z.string().optional()
    })
    .parse({
      householdId: input.householdId,
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      payload: input.payload ?? {},
      createdAt: input.createdAt
    });

  const { error } = await supabase.from("household_events").insert({
    id: uuid(),
    household_id: parsed.householdId,
    event_type: parsed.eventType,
    actor_user_id: parsed.actorUserId,
    subject_user_id: parsed.subjectUserId,
    payload: parsed.payload ?? {},
    created_at: parsed.createdAt ?? new Date().toISOString()
  });

  if (error) throw error;
};

export const updateUserAvatar = async (avatarUrl: string) => {
  const normalizedAvatar = z.string().trim().parse(avatarUrl);

  const { error } = await supabase.auth.updateUser({
    data: {
      avatar_url: normalizedAvatar.length > 0 ? normalizedAvatar : null
    }
  });

  if (error) throw error;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) return;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      avatar_url: normalizedAvatar.length > 0 ? normalizedAvatar : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;
};

export const updateUserDisplayName = async (displayName: string) => {
  const normalizedDisplayName = z.string().trim().max(80).parse(displayName);

  const { error } = await supabase.auth.updateUser({
    data: {
      display_name: normalizedDisplayName.length > 0 ? normalizedDisplayName : null
    }
  });

  if (error) throw error;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) return;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      display_name: normalizedDisplayName.length > 0 ? normalizedDisplayName : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;
};

export const updateUserPaymentHandles = async (input: {
  paypalName: string;
  revolutName: string;
  weroName: string;
}) => {
  const parsedInput = z
    .object({
      paypalName: z.string().trim().max(120),
      revolutName: z.string().trim().max(120),
      weroName: z.string().trim().max(120)
    })
    .parse(input);

  const userId = await requireAuthenticatedUserId();

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      paypal_name: parsedInput.paypalName || null,
      revolut_name: parsedInput.revolutName || null,
      wero_name: parsedInput.weroName || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (profileError) throw profileError;
};

export const updateUserColor = async (userColor: string) => {
  const normalizedUserColor = z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((value) => value.toLowerCase())
    .parse(userColor);

  const userId = await requireAuthenticatedUserId();

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      user_color: normalizedUserColor,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (profileError) throw profileError;
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
  const members = (data ?? []).map((entry) => normalizeHouseholdMember(entry as Record<string, unknown>));

  if (members.length === 0) return members;

  const memberUserIds = [...new Set(members.map((entry) => entry.user_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,display_name,avatar_url,user_color,paypal_name,revolut_name,wero_name")
    .in("user_id", memberUserIds);

  if (profileError) throw profileError;

  const profileByUserId = new Map(
    (profileRows ?? [])
      .map((entry) => userProfileSchema.parse(entry as Record<string, unknown>))
      .map((entry) => [entry.user_id, entry] as const)
  );

  return members.map((entry) => {
    const profile = profileByUserId.get(entry.user_id);
    return {
      ...entry,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      user_color: profile?.user_color ?? null,
      paypal_name: profile?.paypal_name ?? null,
      revolut_name: profile?.revolut_name ?? null,
      wero_name: profile?.wero_name ?? null
    };
  });
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
  const requesterUserId = await requireAuthenticatedUserId();
  if (requesterUserId !== validatedUserId) {
    throw new Error("Authenticated user does not match provided userId");
  }

  const { data: joinedHouseholdId, error: joinError } = await supabase.rpc("join_household_by_invite", {
    p_invite_code: validatedInviteCode
  });
  if (joinError) throw joinError;
  const resolvedHouseholdId = z.string().uuid().parse(String(joinedHouseholdId));

  const { data: household, error } = await supabase
    .from("households")
    .select("*")
    .eq("id", resolvedHouseholdId)
    .single();
  if (error) throw error;

  return normalizeHousehold(household as Record<string, unknown>);
};

export const updateHouseholdSettings = async (
  householdId: string,
  input: UpdateHouseholdInput
): Promise<Household> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const parsedInput = z.object({
    name: z.string().trim().min(1).max(120),
    imageUrl: z.string().trim(),
    address: z.string().trim().max(300),
    currency: z.string().trim().toUpperCase().length(3),
    apartmentSizeSqm: positiveOptionalNumberSchema,
    coldRentMonthly: nonNegativeOptionalNumberSchema,
    utilitiesMonthly: nonNegativeOptionalNumberSchema,
    utilitiesOnRoomSqmPercent: percentageNumberSchema,
    taskLazinessEnabled: z.coerce.boolean(),
    themePrimaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    themeAccentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    themeFontFamily: z.string().min(1),
    themeRadiusScale: z.coerce.number().min(0.5).max(1.5)
  }).parse(input);

  const { data, error } = await supabase
    .from("households")
    .update({
      name: parsedInput.name,
      image_url: parsedInput.imageUrl.length > 0 ? parsedInput.imageUrl : null,
      address: parsedInput.address,
      currency: parsedInput.currency,
      apartment_size_sqm: parsedInput.apartmentSizeSqm,
      cold_rent_monthly: parsedInput.coldRentMonthly,
      utilities_monthly: parsedInput.utilitiesMonthly,
      utilities_on_room_sqm_percent: parsedInput.utilitiesOnRoomSqmPercent,
      task_laziness_enabled: parsedInput.taskLazinessEnabled,
      theme_primary_color: parsedInput.themePrimaryColor,
      theme_accent_color: parsedInput.themeAccentColor,
      theme_font_family: parsedInput.themeFontFamily,
      theme_radius_scale: parsedInput.themeRadiusScale
    })
    .eq("id", validatedHouseholdId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHousehold(data as Record<string, unknown>);
};

export const updateHouseholdLandingPage = async (
  householdId: string,
  markdown: string
): Promise<Household> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const parsedMarkdown = z.string().max(120_000).parse(markdown);

  const { data, error } = await supabase
    .from("households")
    .update({
      landing_page_markdown: parsedMarkdown
    })
    .eq("id", validatedHouseholdId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHousehold(data as Record<string, unknown>);
};

export const getHouseholdWhiteboard = async (householdId: string): Promise<HouseholdWhiteboard> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const { data, error } = await supabase
    .from("household_whiteboards")
    .select("household_id,scene_json,updated_by,updated_at")
    .eq("household_id", validatedHouseholdId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      household_id: validatedHouseholdId,
      scene_json: "",
      updated_by: null,
      updated_at: new Date(0).toISOString()
    };
  }
  return normalizeHouseholdWhiteboard(data as Record<string, unknown>);
};

export const upsertHouseholdWhiteboard = async (
  householdId: string,
  userId: string,
  sceneJson: string
): Promise<HouseholdWhiteboard> => {
  const parsedHouseholdId = z.string().uuid().parse(householdId);
  const parsedUserId = z.string().uuid().parse(userId);
  const parsedScene = z.string().max(10 * 1024 * 1024).parse(sceneJson);
  const { data, error } = await supabase
    .from("household_whiteboards")
    .upsert(
      {
        household_id: parsedHouseholdId,
        scene_json: parsedScene,
        updated_by: parsedUserId
      },
      { onConflict: "household_id" }
    )
    .select("household_id,scene_json,updated_by,updated_at")
    .single();
  if (error) throw error;
  return normalizeHouseholdWhiteboard(data as Record<string, unknown>);
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
    commonAreaFactor: z.coerce.number().finite().min(0).max(2)
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

export const updateMemberTaskLaziness = async (
  householdId: string,
  userId: string,
  taskLazinessFactor: number
): Promise<HouseholdMember> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);
  const parsedTaskLazinessFactor = z.coerce.number().finite().min(0).max(2).parse(taskLazinessFactor);

  const { data, error } = await supabase
    .from("household_members")
    .update({
      task_laziness_factor: parsedTaskLazinessFactor
    })
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHouseholdMember(data as Record<string, unknown>);
};

export const updateMemberVacationMode = async (
  householdId: string,
  userId: string,
  vacationMode: boolean
): Promise<HouseholdMember> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);
  const parsedVacationMode = z.coerce.boolean().parse(vacationMode);

  const { data, error } = await supabase
    .from("household_members")
    .update({
      vacation_mode: parsedVacationMode
    })
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeHouseholdMember(data as Record<string, unknown>);
};

export const resetHouseholdPimpers = async (householdId: string): Promise<number> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);

  const { data, error } = await supabase.rpc("reset_household_pimpers", {
    p_household_id: validatedHouseholdId
  });

  if (error) throw error;
  const affected = Number(data ?? 0);
  return Number.isFinite(affected) ? affected : 0;
};

export const leaveHousehold = async (householdId: string, userId: string) => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);

  const { data: financeRows, error: financeError } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("household_id", validatedHouseholdId);

  if (financeError) throw financeError;

  const allEntries = (financeRows ?? []).map((row) => normalizeFinanceEntry(row as Record<string, unknown>));

  const { data: auditRows, error: auditError } = await supabase
    .from("cash_audit_requests")
    .select("created_at")
    .eq("household_id", validatedHouseholdId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (auditError) throw auditError;

  const lastCashAuditAt = String(auditRows?.[0]?.created_at ?? "");
  const auditDay = lastCashAuditAt ? lastCashAuditAt.slice(0, 10) : null;
  const entriesSinceLastAudit = auditDay
    ? allEntries.filter((entry) => {
        const entryDay = entry.entry_date || entry.created_at.slice(0, 10);
        return entryDay > auditDay;
      })
    : allEntries;

  const { data: memberRows, error: memberListError } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", validatedHouseholdId);

  if (memberListError) throw memberListError;

  const settlementMemberIds = (memberRows ?? [])
    .map((row) => String(row.user_id ?? ""))
    .filter((entry): entry is string => entry.length > 0);
  const fallbackMemberIds = [...new Set(entriesSinceLastAudit.flatMap((entry) => entry.paid_by_user_ids))];
  const memberIdsForBalance = settlementMemberIds.length > 0 ? settlementMemberIds : fallbackMemberIds;

  const userBalance = calculateBalancesByMember(entriesSinceLastAudit, memberIdsForBalance).find(
    (entry) => entry.memberId === validatedUserId
  )?.balance ?? 0;

  assertCanLeaveWithBalance(userBalance);

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

    assertCanLeaveAsOwner(count ?? 0);
  }

  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId);

  if (error) throw error;
};

export const dissolveHousehold = async (householdId: string, userId: string) => {
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

  const { count, error: memberCountError } = await supabase
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", validatedHouseholdId);

  if (memberCountError) throw memberCountError;
  assertCanDissolveHousehold(role, count ?? 0);

  const { error } = await supabase
    .from("households")
    .delete()
    .eq("id", validatedHouseholdId);

  if (error) throw error;
};

export const setHouseholdMemberRole = async (
  householdId: string,
  targetUserId: string,
  role: "owner" | "member"
) => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedTargetUserId = z.string().uuid().parse(targetUserId);
  const nextRole = z.enum(["owner", "member"]).parse(role);
  const actorUserId = await requireAuthenticatedUserId();

  const { data: targetMember, error: targetMemberError } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedTargetUserId)
    .single();

  if (targetMemberError) throw targetMemberError;
  const previousRole = String(targetMember.role ?? "member");

  if (nextRole === "member") {
    if (previousRole === "owner") {
      const { count, error: ownerCountError } = await supabase
        .from("household_members")
        .select("user_id", { count: "exact", head: true })
        .eq("household_id", validatedHouseholdId)
        .eq("role", "owner");

      if (ownerCountError) throw ownerCountError;
      assertCanDemoteOwner(count ?? 0);
    }
  }

  const { error } = await supabase
    .from("household_members")
    .update({ role: nextRole })
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedTargetUserId);

  if (error) throw error;

  if (previousRole !== nextRole) {
    await insertHouseholdEvent({
      householdId: validatedHouseholdId,
      eventType: "role_changed",
      actorUserId,
      subjectUserId: validatedTargetUserId,
      payload: {
        previousRole,
        nextRole
      }
    });
  }
};

export const removeHouseholdMember = async (householdId: string, targetUserId: string) => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedTargetUserId = z.string().uuid().parse(targetUserId);

  const { data: targetMember, error: targetMemberError } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedTargetUserId)
    .single();

  if (targetMemberError) throw targetMemberError;

  const targetRole = String(targetMember.role ?? "member");
  if (targetRole === "owner") {
    const { count, error: ownerCountError } = await supabase
      .from("household_members")
      .select("user_id", { count: "exact", head: true })
      .eq("household_id", validatedHouseholdId)
      .eq("role", "owner");

    if (ownerCountError) throw ownerCountError;
    assertCanRemoveOwner(count ?? 0);
  }

  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedTargetUserId);

  if (error) throw error;
};

export const getBucketItems = async (householdId: string): Promise<BucketItem[]> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const { data, error } = await supabase
    .from("bucket_items")
    .select("*")
    .eq("household_id", validatedHouseholdId)
    .order("done", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  const items = (data ?? []).map((entry) => normalizeBucketItem(entry as Record<string, unknown>));

  const { data: voteRows, error: votesError } = await supabase
    .from("bucket_item_date_votes")
    .select("*")
    .eq("household_id", validatedHouseholdId);

  if (votesError) throw votesError;
  const parsedVotes = (voteRows ?? []).map((entry) => bucketItemDateVoteSchema.parse(entry as Record<string, unknown>));
  const votesByItemId = new Map<string, Record<string, string[]>>();

  parsedVotes.forEach((vote) => {
    const byDate = votesByItemId.get(vote.bucket_item_id) ?? {};
    const current = byDate[vote.suggested_date] ?? [];
    if (!current.includes(vote.user_id)) {
      byDate[vote.suggested_date] = [...current, vote.user_id];
    }
    votesByItemId.set(vote.bucket_item_id, byDate);
  });

  return items.map((item) => ({
    ...item,
    votes_by_date: votesByItemId.get(item.id) ?? {}
  }));
};

export const addBucketItem = async (
  householdId: string,
  input: { title: string; descriptionMarkdown: string; suggestedDates: string[] },
  userId: string
): Promise<BucketItem> => {
  const parsedInput = z
    .object({
      householdId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      descriptionMarkdown: z.string().max(20_000),
      suggestedDates: z
        .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .max(15),
      userId: z.string().uuid()
    })
    .parse({
      householdId,
      title: input.title,
      descriptionMarkdown: input.descriptionMarkdown,
      suggestedDates: input.suggestedDates,
      userId
    });

  const { data, error } = await supabase
    .from("bucket_items")
    .insert({
      id: uuid(),
      household_id: parsedInput.householdId,
      title: parsedInput.title,
      description_markdown: parsedInput.descriptionMarkdown,
      suggested_dates: [...new Set(parsedInput.suggestedDates)].sort(),
      done: false,
      created_by: parsedInput.userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeBucketItem(data as Record<string, unknown>);
};

export const updateBucketItem = async (
  id: string,
  input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }
): Promise<void> => {
  const parsed = z
    .object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      descriptionMarkdown: z.string().max(20_000),
      suggestedDates: z
        .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .max(15)
    })
    .parse({
      id,
      title: input.title,
      descriptionMarkdown: input.descriptionMarkdown,
      suggestedDates: input.suggestedDates
    });

  const { error } = await supabase
    .from("bucket_items")
    .update({
      title: parsed.title,
      description_markdown: parsed.descriptionMarkdown,
      suggested_dates: [...new Set(parsed.suggestedDates)].sort()
    })
    .eq("id", parsed.id);

  if (error) throw error;
};

export const updateBucketItemStatus = async (id: string, done: boolean, userId: string): Promise<void> => {
  const validatedId = z.string().uuid().parse(id);
  const validatedUserId = z.string().uuid().parse(userId);
  const parsedDone = z.coerce.boolean().parse(done);

  const payload = parsedDone
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

  const { error } = await supabase.from("bucket_items").update(payload).eq("id", validatedId);
  if (error) throw error;
};

export const deleteBucketItem = async (id: string): Promise<void> => {
  const validatedId = z.string().uuid().parse(id);
  const { error } = await supabase.from("bucket_items").delete().eq("id", validatedId);
  if (error) throw error;
};

export const updateBucketDateVote = async (
  input: {
    bucketItemId: string;
    householdId: string;
    suggestedDate: string;
    userId: string;
    voted: boolean;
  }
): Promise<void> => {
  const parsedInput = z
    .object({
      bucketItemId: z.string().uuid(),
      householdId: z.string().uuid(),
      suggestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      userId: z.string().uuid(),
      voted: z.coerce.boolean()
    })
    .parse(input);

  if (parsedInput.voted) {
    const { error } = await supabase
      .from("bucket_item_date_votes")
      .upsert(
        {
          bucket_item_id: parsedInput.bucketItemId,
          household_id: parsedInput.householdId,
          suggested_date: parsedInput.suggestedDate,
          user_id: parsedInput.userId
        },
        { onConflict: "bucket_item_id,suggested_date,user_id" }
      );
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("bucket_item_date_votes")
    .delete()
    .eq("bucket_item_id", parsedInput.bucketItemId)
    .eq("suggested_date", parsedInput.suggestedDate)
    .eq("user_id", parsedInput.userId);
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
  recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null,
  userId: string
): Promise<ShoppingItem> => {
  const parsedInput = z.object({
    householdId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    recurrenceInterval: z
      .object({
        value: z.coerce.number().int().positive(),
        unit: shoppingRecurrenceUnitSchema
      })
      .nullable(),
    userId: z.string().uuid()
  }).parse({
    householdId,
    title,
    tags: tags.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    recurrenceInterval,
    userId
  });

  const { data, error } = await supabase
    .from("shopping_items")
    .insert({
      id: uuid(),
      household_id: parsedInput.householdId,
      title: parsedInput.title,
      tags: parsedInput.tags,
      recurrence_interval_value: parsedInput.recurrenceInterval?.value ?? null,
      recurrence_interval_unit: parsedInput.recurrenceInterval?.unit ?? null,
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
  let sourceItemForEvent: { household_id: string; title: string } | null = null;

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

    sourceItemForEvent = {
      household_id: sourceItem.household_id,
      title: sourceItem.title
    };
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

  if (done && sourceItemForEvent) {
    await insertHouseholdEvent({
      householdId: sourceItemForEvent.household_id,
      eventType: "shopping_completed",
      actorUserId: validatedUserId,
      payload: {
        title: sourceItemForEvent.title,
        shoppingItemId: validatedId
      },
      createdAt: payload.done_at ?? new Date().toISOString()
    });
  }
};

export const updateShoppingItem = async (
  id: string,
  input: {
    title: string;
    tags: string[];
    recurrenceInterval: { value: number; unit: ShoppingRecurrenceUnit } | null;
  }
): Promise<ShoppingItem> => {
  const parsedInput = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    recurrenceInterval: z
      .object({
        value: z.coerce.number().int().positive(),
        unit: shoppingRecurrenceUnitSchema
      })
      .nullable()
  }).parse({
    id,
    title: input.title,
    tags: input.tags.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    recurrenceInterval: input.recurrenceInterval
  });

  const { data, error } = await supabase
    .from("shopping_items")
    .update({
      title: parsedInput.title,
      tags: parsedInput.tags,
      recurrence_interval_value: parsedInput.recurrenceInterval?.value ?? null,
      recurrence_interval_unit: parsedInput.recurrenceInterval?.unit ?? null
    })
    .eq("id", parsedInput.id)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeShoppingItem(data as Record<string, unknown>);
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
    currentStateImageUrl: z.string().trim().max(5_000_000).nullable().optional(),
    targetStateImageUrl: z.string().trim().max(5_000_000).nullable().optional(),
    startDate: z.string().min(1),
    frequencyDays: z.coerce.number().int().positive(),
    effortPimpers: z.coerce.number().int().positive(),
    graceMinutes: z.coerce.number().int().nonnegative().default(1440),
    prioritizeLowPimpers: z.coerce.boolean(),
    assigneeFairnessMode: z.enum(["actual", "projection", "expected"]).default("expected"),
    rotationUserIds: z.array(z.string().uuid()).min(1)
  }).parse({
    householdId,
    userId,
    title: input.title,
    description: input.description,
    currentStateImageUrl: input.currentStateImageUrl ?? null,
    targetStateImageUrl: input.targetStateImageUrl ?? null,
    startDate: input.startDate,
    frequencyDays: input.frequencyDays,
    effortPimpers: input.effortPimpers,
    graceMinutes: input.graceMinutes,
    prioritizeLowPimpers: input.prioritizeLowPimpers,
    assigneeFairnessMode: input.assigneeFairnessMode,
    rotationUserIds: input.rotationUserIds.filter((entry, index, all) => all.indexOf(entry) === index)
  });

  const rotationUserIds = parsedInput.rotationUserIds;

  const taskId = uuid();
  const dueAt = getDueAtFromStartDate(parsedInput.startDate);
  const cronPattern = taskFrequencyDaysToCronPattern(parsedInput.frequencyDays);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      id: taskId,
      household_id: parsedInput.householdId,
      title: parsedInput.title,
      description: parsedInput.description,
      current_state_image_url: parsedInput.currentStateImageUrl,
      target_state_image_url: parsedInput.targetStateImageUrl,
      start_date: parsedInput.startDate,
      due_at: dueAt,
      cron_pattern: cronPattern,
      frequency_days: parsedInput.frequencyDays,
      effort_pimpers: parsedInput.effortPimpers,
      grace_minutes: parsedInput.graceMinutes,
      prioritize_low_pimpers: parsedInput.prioritizeLowPimpers,
      assignee_fairness_mode: parsedInput.assigneeFairnessMode,
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

export const updateTask = async (taskId: string, input: NewTaskInput): Promise<void> => {
  const parsedInput = z.object({
    taskId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    currentStateImageUrl: z.string().trim().max(5_000_000).nullable().optional(),
    targetStateImageUrl: z.string().trim().max(5_000_000).nullable().optional(),
    startDate: z.string().min(1),
    frequencyDays: z.coerce.number().int().positive(),
    effortPimpers: z.coerce.number().int().positive(),
    graceMinutes: z.coerce.number().int().nonnegative().default(1440),
    prioritizeLowPimpers: z.coerce.boolean(),
    assigneeFairnessMode: z.enum(["actual", "projection", "expected"]).default("expected"),
    rotationUserIds: z.array(z.string().uuid()).min(1)
  }).parse({
    taskId,
    title: input.title,
    description: input.description,
    currentStateImageUrl: input.currentStateImageUrl ?? null,
    targetStateImageUrl: input.targetStateImageUrl ?? null,
    startDate: input.startDate,
    frequencyDays: input.frequencyDays,
    effortPimpers: input.effortPimpers,
    graceMinutes: input.graceMinutes,
    prioritizeLowPimpers: input.prioritizeLowPimpers,
    assigneeFairnessMode: input.assigneeFairnessMode,
    rotationUserIds: input.rotationUserIds.filter((entry, index, all) => all.indexOf(entry) === index)
  });

  const dueAt = getDueAtFromStartDate(parsedInput.startDate);
  const cronPattern = taskFrequencyDaysToCronPattern(parsedInput.frequencyDays);
  const assigneeId = parsedInput.rotationUserIds[0];

  const { error: taskError } = await supabase
    .from("tasks")
    .update({
      title: parsedInput.title,
      description: parsedInput.description,
      current_state_image_url: parsedInput.currentStateImageUrl,
      target_state_image_url: parsedInput.targetStateImageUrl,
      start_date: parsedInput.startDate,
      due_at: dueAt,
      cron_pattern: cronPattern,
      frequency_days: parsedInput.frequencyDays,
      effort_pimpers: parsedInput.effortPimpers,
      grace_minutes: parsedInput.graceMinutes,
      prioritize_low_pimpers: parsedInput.prioritizeLowPimpers,
      assignee_fairness_mode: parsedInput.assigneeFairnessMode,
      assignee_id: assigneeId
    })
    .eq("id", parsedInput.taskId);

  if (taskError) throw taskError;

  const { error: deleteRotationError } = await supabase
    .from("task_rotation_members")
    .delete()
    .eq("task_id", parsedInput.taskId);
  if (deleteRotationError) throw deleteRotationError;

  const rotationRows = parsedInput.rotationUserIds.map((rotationUserId, index) => ({
    task_id: parsedInput.taskId,
    user_id: rotationUserId,
    position: index
  }));
  const { error: rotationError } = await supabase.from("task_rotation_members").insert(rotationRows);
  if (rotationError) throw rotationError;
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const validatedTaskId = z.string().uuid().parse(taskId);
  const { error } = await supabase.from("tasks").delete().eq("id", validatedTaskId);
  if (error) throw error;
};

export const completeTask = async (taskId: string, userId: string) => {
  const validatedTaskId = z.string().uuid().parse(taskId);
  const validatedUserId = z.string().uuid().parse(userId);
  const { data: taskRow, error: taskError } = await supabase
    .from("tasks")
    .select("household_id,title")
    .eq("id", validatedTaskId)
    .single();

  if (taskError) throw taskError;

  const { error } = await supabase.rpc("complete_task", {
    p_task_id: validatedTaskId,
    p_user_id: validatedUserId
  });

  if (error) throw error;

  await insertHouseholdEvent({
    householdId: String(taskRow.household_id),
    eventType: "task_completed",
    actorUserId: validatedUserId,
    payload: {
      title: String(taskRow.title ?? ""),
      taskId: validatedTaskId
    }
  });
};

export const skipTask = async (taskId: string, userId: string) => {
  const validatedTaskId = z.string().uuid().parse(taskId);
  const validatedUserId = z.string().uuid().parse(userId);
  const { data: taskRow, error: taskError } = await supabase
    .from("tasks")
    .select("household_id,title")
    .eq("id", validatedTaskId)
    .single();

  if (taskError) throw taskError;

  const { error } = await supabase.rpc("skip_task", {
    p_task_id: validatedTaskId,
    p_user_id: validatedUserId
  });

  if (error) throw error;

  await insertHouseholdEvent({
    householdId: String(taskRow.household_id),
    eventType: "task_skipped",
    actorUserId: validatedUserId,
    payload: {
      title: String(taskRow.title ?? ""),
      taskId: validatedTaskId
    }
  });
};

export const takeoverTask = async (taskId: string, userId: string): Promise<void> => {
  const validatedTaskId = z.string().uuid().parse(taskId);
  const validatedUserId = z.string().uuid().parse(userId);

  const { data, error } = await supabase
    .from("tasks")
    .select("assignee_id,done,is_active")
    .eq("id", validatedTaskId)
    .single();
  if (error) throw error;

  if (data?.done) {
    throw new Error("Task is already completed for this round");
  }
  if (data?.is_active === false) {
    throw new Error("Task is inactive");
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ assignee_id: validatedUserId })
    .eq("id", validatedTaskId);
  if (updateError) throw updateError;
};

export const updateTaskActiveState = async (taskId: string, isActive: boolean): Promise<void> => {
  const validatedTaskId = z.string().uuid().parse(taskId);
  const parsedIsActive = z.coerce.boolean().parse(isActive);
  const nowIso = new Date().toISOString();

  const updatePayload: {
    is_active: boolean;
    due_at?: string;
    done?: boolean;
    done_at?: null;
    done_by?: null;
  } = {
    is_active: parsedIsActive
  };

  if (parsedIsActive) {
    updatePayload.due_at = nowIso;
    updatePayload.done = false;
    updatePayload.done_at = null;
    updatePayload.done_by = null;
  }

  const { error } = await supabase
    .from("tasks")
    .update(updatePayload)
    .eq("id", validatedTaskId);
  if (error) throw error;
};

export const getTaskCompletions = async (householdId: string): Promise<TaskCompletion[]> => {
  const currentUserId = await requireAuthenticatedUserId();
  const { data, error } = await supabase
    .from("task_completions")
    .select("*")
    .eq("household_id", householdId)
    .order("completed_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  const completions = (data ?? []).map((entry) => normalizeTaskCompletion(entry as Record<string, unknown>));
  if (completions.length === 0) return completions;

  const completionIds = completions.map((entry) => entry.id);
  const { data: ratingsData, error: ratingsError } = await supabase
    .from("task_completion_ratings")
    .select("task_completion_id,household_id,user_id,rating")
    .eq("household_id", householdId)
    .in("task_completion_id", completionIds);

  if (ratingsError) throw ratingsError;

  const ratingsByCompletionId = new Map<
    string,
    {
      total: number;
      count: number;
      myRating: number | null;
    }
  >();

  for (const row of ratingsData ?? []) {
    const parsed = taskCompletionRatingSchema.parse(row);
    const existing = ratingsByCompletionId.get(parsed.task_completion_id) ?? {
      total: 0,
      count: 0,
      myRating: null
    };
    existing.total += parsed.rating;
    existing.count += 1;
    if (parsed.user_id === currentUserId) {
      existing.myRating = parsed.rating;
    }
    ratingsByCompletionId.set(parsed.task_completion_id, existing);
  }

  return completions.map((entry) => {
    const ratingStats = ratingsByCompletionId.get(entry.id);
    if (!ratingStats) {
      return {
        ...entry,
        rating_average: null,
        rating_count: 0,
        my_rating: null
      };
    }
    return {
      ...entry,
      rating_average: Number((ratingStats.total / ratingStats.count).toFixed(2)),
      rating_count: ratingStats.count,
      my_rating: ratingStats.myRating
    };
  });
};

export const rateTaskCompletion = async (taskCompletionId: string, rating: number): Promise<void> => {
  const parsed = z.object({
    taskCompletionId: z.string().uuid(),
    rating: z.coerce.number().int().min(1).max(5)
  }).parse({ taskCompletionId, rating });

  const { error } = await supabase.rpc("rate_task_completion", {
    p_task_completion_id: parsed.taskCompletionId,
    p_rating: parsed.rating
  });

  if (error) throw error;
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

export const getCashAuditRequests = async (householdId: string): Promise<CashAuditRequest[]> => {
  const { data, error } = await supabase
    .from("cash_audit_requests")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((entry) => normalizeCashAuditRequest(entry as Record<string, unknown>));
};

export const getHouseholdEvents = async (householdId: string): Promise<HouseholdEvent[]> => {
  const { data, error } = await supabase
    .from("household_events")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw error;
  return (data ?? []).map((entry) => normalizeHouseholdEvent(entry as Record<string, unknown>));
};

const DEFAULT_PUSH_TOPICS = [
  "task_due",
  "task_completed",
  "task_skipped",
  "task_taken_over",
  "finance_created",
  "shopping_added",
  "shopping_completed",
  "bucket_added",
  "cash_audit_requested"
];

export const getPushPreferences = async (householdId: string, userId: string): Promise<PushPreferences> => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);
  const { data, error } = await supabase
    .from("push_preferences")
    .select("*")
    .eq("household_id", validatedHouseholdId)
    .eq("user_id", validatedUserId)
    .single();
  if (error) {
    return {
      user_id: validatedUserId,
      household_id: validatedHouseholdId,
      enabled: true,
      quiet_hours: {},
      topics: DEFAULT_PUSH_TOPICS
    };
  }
  return {
    ...(data as PushPreferences),
    topics: Array.isArray((data as PushPreferences).topics) ? (data as PushPreferences).topics : DEFAULT_PUSH_TOPICS
  };
};

export const upsertPushPreferences = async (input: {
  householdId: string;
  userId: string;
  enabled: boolean;
  quietHours: Record<string, unknown>;
  topics: string[];
}): Promise<PushPreferences> => {
  const parsed = z
    .object({
      householdId: z.string().uuid(),
      userId: z.string().uuid(),
      enabled: z.coerce.boolean(),
      quietHours: z.record(z.string(), z.unknown()).default({}),
      topics: z.array(z.string()).default(DEFAULT_PUSH_TOPICS)
    })
    .parse(input);

  const { data, error } = await supabase
    .from("push_preferences")
    .upsert({
      household_id: parsed.householdId,
      user_id: parsed.userId,
      enabled: parsed.enabled,
      quiet_hours: parsed.quietHours,
      topics: parsed.topics
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PushPreferences;
};

export const getFinanceSubscriptions = async (householdId: string): Promise<FinanceSubscription[]> => {
  const { data, error } = await supabase
    .from("finance_subscriptions")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((entry) => normalizeFinanceSubscription(entry as Record<string, unknown>));
};

export const addFinanceEntry = async (
  householdId: string,
  input: {
    description: string;
    amount: number;
    category: string;
    receiptImageUrl?: string | null;
    paidByUserIds: string[];
    beneficiaryUserIds: string[];
    entryDate?: string | null;
  }
): Promise<FinanceEntry> => {
  const creatorId = await requireAuthenticatedUserId();
  const parsedInput = z.object({
    householdId: z.string().uuid(),
    description: z.string().trim().min(1).max(200),
    amount: z.coerce.number().finite().nonnegative(),
    category: z.string().trim().max(80),
    receiptImageUrl: z.string().trim().max(5_000_000).nullable().optional(),
    paidByUserIds: z.array(z.string().uuid()).min(1),
    beneficiaryUserIds: z.array(z.string().uuid()).min(1),
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  }).parse({
    householdId,
    description: input.description,
    amount: input.amount,
    category: input.category,
    receiptImageUrl: input.receiptImageUrl ?? null,
    paidByUserIds: input.paidByUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
    beneficiaryUserIds: input.beneficiaryUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
    entryDate: input.entryDate ?? null
  });

  const normalizedCategory = parsedInput.category || "general";
  const normalizedEntryDate = parsedInput.entryDate ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("finance_entries")
    .insert({
      id: uuid(),
      household_id: parsedInput.householdId,
      description: parsedInput.description,
      category: normalizedCategory,
      amount: parsedInput.amount,
      receipt_image_url: parsedInput.receiptImageUrl,
      paid_by: parsedInput.paidByUserIds[0],
      paid_by_user_ids: parsedInput.paidByUserIds,
      beneficiary_user_ids: parsedInput.beneficiaryUserIds,
      entry_date: normalizedEntryDate,
      created_by: creatorId,
      created_at: `${normalizedEntryDate}T12:00:00.000Z`
    })
    .select("*")
    .single();

  if (error) throw error;
  await insertHouseholdEvent({
    householdId: parsedInput.householdId,
    eventType: "finance_created",
    actorUserId: creatorId,
    payload: {
      description: parsedInput.description,
      amount: parsedInput.amount,
      financeEntryId: String((data as { id?: string }).id ?? "")
    },
    createdAt: (data as { created_at?: string }).created_at
  });
  return normalizeFinanceEntry(data as Record<string, unknown>);
};

export const updateFinanceEntry = async (
  id: string,
  input: {
    description: string;
    amount: number;
    category: string;
    receiptImageUrl?: string | null;
    paidByUserIds: string[];
    beneficiaryUserIds: string[];
    entryDate?: string | null;
  }
): Promise<FinanceEntry> => {
  const creatorId = await requireAuthenticatedUserId();
  const parsedInput = z
    .object({
      id: z.string().uuid(),
      description: z.string().trim().min(1).max(200),
      amount: z.coerce.number().finite().nonnegative(),
      category: z.string().trim().max(80),
      receiptImageUrl: z.string().trim().max(5_000_000).nullable().optional(),
      paidByUserIds: z.array(z.string().uuid()).min(1),
      beneficiaryUserIds: z.array(z.string().uuid()).min(1),
      entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
    })
    .parse({
      id,
      description: input.description,
      amount: input.amount,
      category: input.category,
      receiptImageUrl: input.receiptImageUrl ?? null,
      paidByUserIds: input.paidByUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
      beneficiaryUserIds: input.beneficiaryUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
      entryDate: input.entryDate ?? null
    });

  const normalizedCategory = parsedInput.category || "general";
  const normalizedEntryDate = parsedInput.entryDate ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("finance_entries")
    .update({
      description: parsedInput.description,
      category: normalizedCategory,
      amount: parsedInput.amount,
      receipt_image_url: parsedInput.receiptImageUrl,
      paid_by: parsedInput.paidByUserIds[0],
      paid_by_user_ids: parsedInput.paidByUserIds,
      beneficiary_user_ids: parsedInput.beneficiaryUserIds,
      entry_date: normalizedEntryDate,
      created_at: `${normalizedEntryDate}T12:00:00.000Z`
    })
    .eq("id", parsedInput.id)
    .eq("created_by", creatorId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeFinanceEntry(data as Record<string, unknown>);
};

export const deleteFinanceEntry = async (id: string): Promise<void> => {
  const validatedId = z.string().uuid().parse(id);
  const creatorId = await requireAuthenticatedUserId();
  const { error } = await supabase
    .from("finance_entries")
    .delete()
    .eq("id", validatedId)
    .eq("created_by", creatorId);
  if (error) throw error;
};

export const requestCashAudit = async (householdId: string, userId: string) => {
  const validatedHouseholdId = z.string().uuid().parse(householdId);
  const validatedUserId = z.string().uuid().parse(userId);
  const createdAt = new Date().toISOString();

  const { error } = await supabase.from("cash_audit_requests").insert({
    id: uuid(),
    household_id: validatedHouseholdId,
    requested_by: validatedUserId,
    status: "queued",
    created_at: createdAt
  });

  if (error) throw error;
  await insertHouseholdEvent({
    householdId: validatedHouseholdId,
    eventType: "cash_audit_requested",
    actorUserId: validatedUserId,
    payload: {},
    createdAt
  });
};

export const addFinanceSubscription = async (
  householdId: string,
  userId: string,
  input: NewFinanceSubscriptionInput
): Promise<FinanceSubscription> => {
  const parsedInput = z.object({
    householdId: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    amount: z.coerce.number().finite().nonnegative(),
    category: z.string().trim().max(80),
    paidByUserIds: z.array(z.string().uuid()).min(1),
    beneficiaryUserIds: z.array(z.string().uuid()).min(1),
    recurrence: financeSubscriptionRecurrenceSchema
  }).parse({
    householdId,
    userId,
    name: input.name,
    amount: input.amount,
    category: input.category,
    paidByUserIds: input.paidByUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
    beneficiaryUserIds: input.beneficiaryUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
    recurrence: input.recurrence
  });

  const { data, error } = await supabase
    .from("finance_subscriptions")
    .insert({
      id: uuid(),
      household_id: parsedInput.householdId,
      name: parsedInput.name,
      category: parsedInput.category || "general",
      amount: parsedInput.amount,
      paid_by_user_ids: parsedInput.paidByUserIds,
      beneficiary_user_ids: parsedInput.beneficiaryUserIds,
      cron_pattern: recurrenceToCronPattern(parsedInput.recurrence),
      created_by: parsedInput.userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeFinanceSubscription(data as Record<string, unknown>);
};

export const updateFinanceSubscription = async (
  id: string,
  input: NewFinanceSubscriptionInput
): Promise<FinanceSubscription> => {
  const parsedInput = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    amount: z.coerce.number().finite().nonnegative(),
    category: z.string().trim().max(80),
    paidByUserIds: z.array(z.string().uuid()).min(1),
    beneficiaryUserIds: z.array(z.string().uuid()).min(1),
    recurrence: financeSubscriptionRecurrenceSchema
  }).parse({
    id,
    name: input.name,
    amount: input.amount,
    category: input.category,
    paidByUserIds: input.paidByUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
    beneficiaryUserIds: input.beneficiaryUserIds.filter((entry, index, all) => all.indexOf(entry) === index),
    recurrence: input.recurrence
  });

  const { data, error } = await supabase
    .from("finance_subscriptions")
    .update({
      name: parsedInput.name,
      category: parsedInput.category || "general",
      amount: parsedInput.amount,
      paid_by_user_ids: parsedInput.paidByUserIds,
      beneficiary_user_ids: parsedInput.beneficiaryUserIds,
      cron_pattern: recurrenceToCronPattern(parsedInput.recurrence),
      updated_at: new Date().toISOString()
    })
    .eq("id", parsedInput.id)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeFinanceSubscription(data as Record<string, unknown>);
};

export const deleteFinanceSubscription = async (id: string): Promise<void> => {
  const validatedId = z.string().uuid().parse(id);
  const { error } = await supabase.from("finance_subscriptions").delete().eq("id", validatedId);
  if (error) throw error;
};
