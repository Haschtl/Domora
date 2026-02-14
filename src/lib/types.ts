export type AppTab = "home" | "shopping" | "tasks" | "finances" | "settings";
export type ShoppingRecurrenceUnit = "days" | "weeks" | "months";
export type FinanceSubscriptionRecurrence = "weekly" | "monthly" | "quarterly";

export interface Household {
  id: string;
  name: string;
  image_url: string | null;
  address: string;
  currency: string;
  apartment_size_sqm: number | null;
  cold_rent_monthly: number | null;
  utilities_monthly: number | null;
  utilities_on_room_sqm_percent: number;
  landing_page_markdown: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface UpdateHouseholdInput {
  name: string;
  imageUrl: string;
  address: string;
  currency: string;
  apartmentSizeSqm: number | null;
  coldRentMonthly: number | null;
  utilitiesMonthly: number | null;
  utilitiesOnRoomSqmPercent: number;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name?: string | null;
  avatar_url?: string | null;
  room_size_sqm: number | null;
  common_area_factor: number;
  created_at: string;
}

export interface HouseholdMemberPimpers {
  household_id: string;
  user_id: string;
  total_pimpers: number;
  updated_at: string;
}

export interface ShoppingItem {
  id: string;
  household_id: string;
  title: string;
  tags: string[];
  recurrence_interval_value: number | null;
  recurrence_interval_unit: ShoppingRecurrenceUnit | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_by: string;
  created_at: string;
}

export interface ShoppingItemCompletion {
  id: string;
  shopping_item_id: string;
  household_id: string;
  title_snapshot: string;
  tags_snapshot: string[];
  completed_by: string;
  completed_at: string;
}

export interface TaskItem {
  id: string;
  household_id: string;
  title: string;
  description: string;
  start_date: string;
  due_at: string;
  cron_pattern: string;
  frequency_days: number;
  effort_pimpers: number;
  is_active: boolean;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  assignee_id: string | null;
  created_by: string;
  created_at: string;
  rotation_user_ids: string[];
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  household_id: string;
  task_title_snapshot: string;
  user_id: string;
  pimpers_earned: number;
  completed_at: string;
}

export interface NewTaskInput {
  title: string;
  description: string;
  startDate: string;
  frequencyDays: number;
  effortPimpers: number;
  rotationUserIds: string[];
}

export interface FinanceEntry {
  id: string;
  household_id: string;
  description: string;
  category: string;
  amount: number;
  paid_by: string;
  paid_by_user_ids: string[];
  beneficiary_user_ids: string[];
  entry_date: string;
  created_by: string;
  created_at: string;
}

export interface CashAuditRequest {
  id: string;
  household_id: string;
  requested_by: string;
  status: "queued" | "sent" | "failed";
  created_at: string;
}

export interface FinanceSubscription {
  id: string;
  household_id: string;
  name: string;
  category: string;
  amount: number;
  paid_by_user_ids: string[];
  beneficiary_user_ids: string[];
  cron_pattern: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NewFinanceSubscriptionInput {
  name: string;
  category: string;
  amount: number;
  paidByUserIds: string[];
  beneficiaryUserIds: string[];
  recurrence: FinanceSubscriptionRecurrence;
}
