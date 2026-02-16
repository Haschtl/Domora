import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  isBefore,
  isValid,
  parseISO,
  startOfMonth,
  subMonths
} from "date-fns";
import { de, enGB } from "date-fns/locale";
import type { ShoppingRecurrenceUnit } from "./types";

const resolveDateFnsLocale = (language: string) => (language.startsWith("de") ? de : enGB);

const toDate = (value: string | Date): Date | null => {
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? date : null;
};

export const formatDateTime = (value: string | Date, language: string, fallback = "") => {
  const date = toDate(value);
  if (!date) return fallback;
  return format(date, "PPp", { locale: resolveDateFnsLocale(language) });
};

export const formatDateOnly = (value: string | Date, language: string, fallback = "") => {
  const date = toDate(value);
  if (!date) return fallback;
  return format(date, "PP", { locale: resolveDateFnsLocale(language) });
};

export const formatShortDay = (value: string | Date, language: string, fallback = "") => {
  const date = toDate(value);
  if (!date) return fallback;
  return format(date, "MMM d", { locale: resolveDateFnsLocale(language) });
};

export const addMinutesToIso = (iso: string, minutes: number): Date | null => {
  const date = toDate(iso);
  if (!date) return null;
  return addMinutes(date, minutes);
};

export const addRecurringIntervalToIso = (iso: string, value: number, unit: ShoppingRecurrenceUnit): Date | null => {
  const date = toDate(iso);
  if (!date) return null;
  if (!Number.isFinite(value) || value <= 0) return null;

  switch (unit) {
    case "days":
      return addDays(date, value);
    case "weeks":
      return addWeeks(date, value);
    case "months":
      return addMonths(date, value);
    default:
      return null;
  }
};

export const isDueNow = (iso: string) => {
  const dueAt = toDate(iso);
  if (!dueAt) return false;
  return isBefore(dueAt, new Date()) || dueAt.getTime() === Date.now();
};

export const getLastMonthRange = (reference = new Date()) => {
  const lastMonth = subMonths(reference, 1);
  return {
    start: startOfMonth(lastMonth),
    end: endOfMonth(lastMonth)
  };
};
