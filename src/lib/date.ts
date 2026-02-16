import { addDays, addMinutes, addMonths, addWeeks, endOfMonth, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { de, enGB } from "date-fns/locale";
import type { ShoppingRecurrenceUnit } from "./types";

const resolveDateFnsLocale = (language: string) => (language.startsWith("de") ? de : enGB);
const MIN_EFFECTIVE_INTERVAL_DAYS = 1;
const MAX_EFFECTIVE_INTERVAL_DAYS = 3650;

type EffectiveIntervalMode = "min" | "max" | "mean";

const clampNumber = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;

const normalizeFrequencyDays = (frequencyDays: number | null | undefined) =>
  Math.max(1, Number(frequencyDays ?? 0) || 1);

const normalizeGraceDays = (graceMinutes: number | null | undefined) =>
  Math.max(0, Number(graceMinutes ?? 0)) / (60 * 24);

const getGraceWeight = (mode: EffectiveIntervalMode) => {
  if (mode === "min") return 0;
  if (mode === "max") return 1;
  return 0.5;
};

export const getEffectiveIntervalDays = (
  frequencyDays: number | null | undefined,
  graceMinutes: number | null | undefined,
  mode: EffectiveIntervalMode = "mean"
) => {
  const baseDays = normalizeFrequencyDays(frequencyDays);
  const graceDays = normalizeGraceDays(graceMinutes);
  const intervalDays = baseDays + graceDays * getGraceWeight(mode);
  return clampNumber(intervalDays, MIN_EFFECTIVE_INTERVAL_DAYS, MAX_EFFECTIVE_INTERVAL_DAYS);
};

const getEffectiveGraceMinutes = (
  graceMinutes: number | null | undefined,
  mode: EffectiveIntervalMode = "mean"
) => {
  const graceDays = normalizeGraceDays(graceMinutes);
  return graceDays * getGraceWeight(mode) * 24 * 60;
};

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

export const isDueNow = (iso: string, graceMinutes = 0) => {
  const dueAt = toDate(iso);
  if (!dueAt) return false;
  const effectiveGraceMinutes = getEffectiveGraceMinutes(graceMinutes, "max");
  const graceMs = Math.max(0, effectiveGraceMinutes) * 60 * 1000;
  return Date.now() >= dueAt.getTime() && Date.now() <= dueAt.getTime() + graceMs
    ? true
    : Date.now() >= dueAt.getTime();
};

export const getLastMonthRange = (reference = new Date()) => {
  const lastMonth = subMonths(reference, 1);
  return {
    start: startOfMonth(lastMonth),
    end: endOfMonth(lastMonth)
  };
};
