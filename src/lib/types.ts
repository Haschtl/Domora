export type AppTab = "home" | "shopping" | "tasks" | "finances" | "settings";
export type ShoppingRecurrenceUnit = "days" | "weeks" | "months";
export type FinanceSubscriptionRecurrence = "weekly" | "monthly" | "quarterly";
export interface HouseholdTranslationOverride {
  find: string;
  replace: string;
}

export type HouseholdMapMarkerIcon =
  | "home"
  | "shopping"
  | "restaurant"
  | "fuel"
  | "hospital"
  | "park"
  | "work"
  | "star";

export interface HouseholdMapMarkerPoint {
  id: string;
  type: "point";
  icon: HouseholdMapMarkerIcon;
  title: string;
  description: string;
  image_b64: string | null;
  poi_ref: string | null;
  created_by: string | null;
  created_at: string;
  last_edited_by: string | null;
  last_edited_at: string;
  lat: number;
  lon: number;
}

export interface HouseholdMapMarkerVector {
  id: string;
  type: "vector";
  icon: HouseholdMapMarkerIcon;
  title: string;
  description: string;
  image_b64: string | null;
  poi_ref: string | null;
  created_by: string | null;
  created_at: string;
  last_edited_by: string | null;
  last_edited_at: string;
  points: Array<{
    lat: number;
    lon: number;
  }>;
}

export interface HouseholdMapMarkerCircle {
  id: string;
  type: "circle";
  icon: HouseholdMapMarkerIcon;
  title: string;
  description: string;
  image_b64: string | null;
  poi_ref: string | null;
  created_by: string | null;
  created_at: string;
  last_edited_by: string | null;
  last_edited_at: string;
  center: {
    lat: number;
    lon: number;
  };
  radius_meters: number;
}

export interface HouseholdMapMarkerRectangle {
  id: string;
  type: "rectangle";
  icon: HouseholdMapMarkerIcon;
  title: string;
  description: string;
  image_b64: string | null;
  poi_ref: string | null;
  created_by: string | null;
  created_at: string;
  last_edited_by: string | null;
  last_edited_at: string;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
}

export type HouseholdMapMarker =
  | HouseholdMapMarkerPoint
  | HouseholdMapMarkerVector
  | HouseholdMapMarkerCircle
  | HouseholdMapMarkerRectangle;

export type PoiCategory = "restaurant" | "shop" | "supermarket" | "fuel";

export interface NearbyPoi {
  id: string;
  source: "overpass";
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  lat: number;
  lon: number;
  name: string | null;
  category: PoiCategory;
  tags: Record<string, string>;
}

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
  task_laziness_enabled: boolean;
  vacation_tasks_exclude_enabled: boolean;
  vacation_finances_exclude_enabled: boolean;
  task_skip_enabled: boolean;
  feature_bucket_enabled: boolean;
  feature_shopping_enabled: boolean;
  feature_tasks_enabled: boolean;
  feature_one_off_tasks_enabled: boolean;
  feature_finances_enabled: boolean;
  one_off_claim_timeout_hours: number;
  one_off_claim_max_pimpers: number;
  theme_primary_color: string;
  theme_accent_color: string;
  theme_font_family: string;
  theme_radius_scale: number;
  translation_overrides: HouseholdTranslationOverride[];
  household_map_markers: HouseholdMapMarker[];
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
  taskLazinessEnabled: boolean;
  vacationTasksExcludeEnabled: boolean;
  vacationFinancesExcludeEnabled: boolean;
  taskSkipEnabled: boolean;
  featureBucketEnabled: boolean;
  featureShoppingEnabled: boolean;
  featureTasksEnabled: boolean;
  featureOneOffTasksEnabled: boolean;
  featureFinancesEnabled: boolean;
  oneOffClaimTimeoutHours: number;
  oneOffClaimMaxPimpers: number;
  themePrimaryColor: string;
  themeAccentColor: string;
  themeFontFamily: string;
  themeRadiusScale: number;
  translationOverrides: HouseholdTranslationOverride[];
  householdMapMarkers: HouseholdMapMarker[];
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name?: string | null;
  avatar_url?: string | null;
  user_color?: string | null;
  paypal_name?: string | null;
  revolut_name?: string | null;
  wero_name?: string | null;
  room_size_sqm: number | null;
  common_area_factor: number;
  task_laziness_factor: number;
  vacation_mode: boolean;
  created_at: string;
}

export interface HouseholdMemberVacation {
  id: string;
  household_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface HouseholdMemberPimpers {
  household_id: string;
  user_id: string;
  total_pimpers: number;
  updated_at: string;
}

export interface PushPreferences {
  user_id: string;
  household_id: string;
  enabled: boolean;
  quiet_hours: {
    start?: string;
    end?: string;
    timezone?: string;
    offsetMinutes?: number;
  };
  topics: string[];
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

export interface BucketItem {
  id: string;
  household_id: string;
  title: string;
  description_markdown: string;
  suggested_dates: string[];
  votes_by_date: Record<string, string[]>;
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
  current_state_image_url: string | null;
  target_state_image_url: string | null;
  start_date: string;
  due_at: string;
  cron_pattern: string;
  frequency_days: number;
  effort_pimpers: number;
  delay_penalty_per_day: number;
  prioritize_low_pimpers: boolean;
  assignee_fairness_mode: "actual" | "projection" | "expected";
  grace_minutes: number;
  is_active: boolean;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  assignee_id: string | null;
  ignore_delay_penalty_once: boolean;
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
  due_at_snapshot: string | null;
  delay_minutes: number;
  completed_at: string;
  rating_average: number | null;
  rating_count: number;
  my_rating: number | null;
}

export type OneOffTaskClaimStatus = "open" | "approved" | "rejected" | "expired" | "withdrawn";
export type OneOffTaskClaimVoteType = "approve" | "reject" | "counter";

export interface OneOffTaskClaimVote {
  claim_id: string;
  household_id: string;
  user_id: string;
  vote_type: OneOffTaskClaimVoteType;
  counter_pimpers: number | null;
  created_at: string;
  updated_at: string;
}

export interface OneOffTaskClaim {
  id: string;
  household_id: string;
  title: string;
  description: string;
  requested_pimpers: number;
  status: OneOffTaskClaimStatus;
  resolved_pimpers: number | null;
  expires_at: string;
  resolved_at: string | null;
  renewed_from: string | null;
  created_by: string;
  created_at: string;
  votes: OneOffTaskClaimVote[];
}

export type HouseholdEventType =
  | "task_completed"
  | "pimpers_reset"
  | "task_skipped"
  | "task_rated"
  | "shopping_completed"
  | "finance_created"
  | "role_changed"
  | "member_joined"
  | "member_left"
  | "rent_updated"
  | "contract_created"
  | "contract_updated"
  | "contract_deleted"
  | "cash_audit_requested"
  | "vacation_mode_enabled"
  | "vacation_mode_disabled"
  | "admin_hint";

export interface HouseholdEvent {
  id: string;
  household_id: string;
  event_type: HouseholdEventType;
  actor_user_id: string | null;
  subject_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface HouseholdWhiteboard {
  household_id: string;
  scene_json: string;
  updated_by: string | null;
  updated_at: string;
}

export interface NewTaskInput {
  title: string;
  description: string;
  currentStateImageUrl?: string | null;
  targetStateImageUrl?: string | null;
  startDate: string;
  frequencyDays: number;
  cronPattern?: string | null;
  effortPimpers: number;
  delayPenaltyPerDay: number;
  prioritizeLowPimpers: boolean;
  assigneeFairnessMode: "actual" | "projection" | "expected";
  graceMinutes: number;
  rotationUserIds: string[];
}

export interface FinanceEntry {
  id: string;
  household_id: string;
  description: string;
  category: string;
  amount: number;
  receipt_image_url: string | null;
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
