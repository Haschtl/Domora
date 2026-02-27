import type { HouseholdMemberVacation } from "./types";

const toDateOnly = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const isDateWithinRange = (value: string | Date, start: string | Date, end: string | Date) => {
  const date = toDateOnly(value);
  const startDate = toDateOnly(start);
  const endDate = toDateOnly(end);
  if (!date || !startDate || !endDate) return false;
  const dateMs = date.getTime();
  return dateMs >= startDate.getTime() && dateMs <= endDate.getTime();
};

export const isMemberOnVacationAt = (
  memberId: string | null | undefined,
  vacations: HouseholdMemberVacation[],
  date: string | Date
) => {
  if (!memberId) return false;
  return vacations.some((vacation) => vacation.user_id === memberId && isDateWithinRange(date, vacation.start_date, vacation.end_date));
};

export const isMemberOnVacation = (
  memberId: string | null | undefined,
  vacations: HouseholdMemberVacation[],
  date: string | Date,
  manualVacationMode: boolean | null | undefined = false
) => {
  if (manualVacationMode) return true;
  return isMemberOnVacationAt(memberId, vacations, date);
};

export const getVacationStatus = (
  vacation: HouseholdMemberVacation,
  date: string | Date = new Date()
): "upcoming" | "active" | "past" => {
  const today = toDateOnly(date);
  const start = toDateOnly(vacation.start_date);
  const end = toDateOnly(vacation.end_date);
  if (!today || !start || !end) return "upcoming";
  if (today.getTime() < start.getTime()) return "upcoming";
  if (today.getTime() > end.getTime()) return "past";
  return "active";
};

export const getVacationRangeLabel = (vacation: HouseholdMemberVacation) =>
  `${vacation.start_date} – ${vacation.end_date}`;
