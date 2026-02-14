import { z } from "zod";
import { supabase } from "../supabase";
import type {
  CashAuditRequest,
  FinanceEntry,
  HouseholdEvent,
  Household,
  HouseholdMember,
  ShoppingItem,
  ShoppingItemCompletion,
  TaskCompletion,
  TaskItem
} from "../types";

export { supabase, z };

export const buildInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const optionalNumberSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  },
  z.number().finite().nullable()
);

export const positiveOptionalNumberSchema = optionalNumberSchema.refine(
  (value) => value === null || value > 0,
  "Expected a positive number or null"
);

export const nonNegativeOptionalNumberSchema = optionalNumberSchema.refine(
  (value) => value === null || value >= 0,
  "Expected a non-negative number or null"
);
export const percentageNumberSchema = z.coerce.number().finite().min(0).max(100);

export const shoppingRecurrenceUnitSchema = z.enum(["days", "weeks", "months"]);

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

export const userProfileSchema = z.object({
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
  prioritize_low_pimpers: z.coerce.boolean().default(true),
  assignee_fairness_mode: z.enum(["actual", "projection"]).default("actual"),
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
  completed_at: z.string().min(1)
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
    "admin_hint"
  ]),
  actor_user_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  subject_user_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().min(1)
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

export const normalizeHousehold = (row: Record<string, unknown>): Household => ({
  ...householdSchema.parse(row)
});

export const normalizeHouseholdMember = (row: Record<string, unknown>): HouseholdMember => ({
  ...householdMemberSchema.parse(row)
});

export const normalizeShoppingItem = (row: Record<string, unknown>): ShoppingItem => ({
  ...shoppingItemSchema.parse(row)
});

export const normalizeTask = (row: Record<string, unknown>, rotationUserIds: string[]): TaskItem => {
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

export const normalizeShoppingCompletion = (row: Record<string, unknown>): ShoppingItemCompletion => ({
  ...shoppingCompletionSchema.parse(row)
});

export const normalizeTaskCompletion = (row: Record<string, unknown>): TaskCompletion => ({
  ...taskCompletionSchema.parse(row)
});

export const normalizeHouseholdEvent = (row: Record<string, unknown>): HouseholdEvent => ({
  ...householdEventSchema.parse(row)
});

export const normalizeFinanceEntry = (row: Record<string, unknown>): FinanceEntry => ({
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

export const normalizeCashAuditRequest = (row: Record<string, unknown>): CashAuditRequest => ({
  ...cashAuditRequestSchema.parse(row)
});

export const getDueAtFromStartDate = (startDate: string) => {
  const asDate = new Date(`${startDate}T09:00:00`);
  if (Number.isNaN(asDate.getTime())) {
    return new Date().toISOString();
  }
  return asDate.toISOString();
};
