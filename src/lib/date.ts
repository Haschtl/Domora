import { addMinutes, format, isBefore, isValid, parseISO } from "date-fns";
import { de, enGB } from "date-fns/locale";

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

export const isDueNow = (iso: string) => {
  const dueAt = toDate(iso);
  if (!dueAt) return false;
  return isBefore(dueAt, new Date()) || dueAt.getTime() === Date.now();
};
