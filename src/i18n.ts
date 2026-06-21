import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { atzenizeText } from "./lib/atzen";
import { bavarianizeText } from "./lib/bavarian";
import { defaultLanguage, resources, supportedLanguages, type SupportedLanguage } from "./lib/translations";
import type { HouseholdTranslationOverride } from "./lib/types";

const STORAGE_KEY = "domora-language";
let householdTranslationOverrides: HouseholdTranslationOverride[] = [];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isBavarianLanguage = (language: string | null | undefined) => language?.toLowerCase().startsWith("bar") ?? false;
const isAtzenLanguage = (language: string | null | undefined) => language?.toLowerCase().startsWith("ffm") ?? false;
const baseTranslation = resources.de.translation as Record<string, unknown>;
const normalizeTranslationKey = (key: unknown) => {
  if (typeof key === "string") return key;
  if (Array.isArray(key)) return key.find((entry) => typeof entry === "string");
  return undefined;
};

const getTranslationEntry = (source: Record<string, unknown>, key: string) => {
  const segments = key.split(".");
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const hasManualLocaleOverride = (language: string | null | undefined, key: string) => {
  const resolved = language?.toLowerCase();
  if (!resolved || !key) return false;

  const locale = supportedLanguages.find((entry) => resolved.startsWith(entry));
  if (!locale || locale === "de" || locale === "en") return false;

  const localeTranslation = resources[locale].translation as Record<string, unknown>;
  const localeEntry = getTranslationEntry(localeTranslation, key);
  const baseEntry = getTranslationEntry(baseTranslation, key);

  if (localeEntry === undefined || baseEntry === undefined) return false;
  if (typeof localeEntry !== "string" || typeof baseEntry !== "string") return false;

  return localeEntry !== baseEntry;
};

const applyHouseholdTranslationOverrides = (value: string) => {
  if (householdTranslationOverrides.length === 0) return value;
  let next = value;
  for (const override of householdTranslationOverrides) {
    if (!override.find) continue;
    next = next.replace(new RegExp(escapeRegExp(override.find), "g"), override.replace);
  }
  return next;
};

const toLanguage = (value: string | null | undefined): SupportedLanguage | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  const match = supportedLanguages.find((entry) => lower.startsWith(entry));
  return match ?? null;
};

const detectLanguageFromNavigator = (): SupportedLanguage | null => {
  if (typeof window === "undefined") return null;

  const preferred = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  for (const candidate of preferred) {
    const detected = toLanguage(candidate);
    if (detected) return detected;
  }

  return null;
};

const resolveInitialLanguage = (): SupportedLanguage => {
  if (typeof window === "undefined") return defaultLanguage;

  const stored = toLanguage(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;

  const htmlLang = toLanguage(document.documentElement.lang);
  if (htmlLang) return htmlLang;

  return detectLanguageFromNavigator() ?? defaultLanguage;
};

export const persistLanguagePreference = (language: SupportedLanguage) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, language);
};

export const setHouseholdTranslationOverrides = (overrides: HouseholdTranslationOverride[]) => {
  householdTranslationOverrides = overrides;
};

void i18n
  .use({
    type: "postProcessor",
    name: "atzenize",
    process(value: unknown, _key: unknown, options?: { lng?: string }) {
      if (typeof value !== "string") return value;
      const language = options?.lng ?? i18n.resolvedLanguage ?? i18n.language;
      if (!isAtzenLanguage(language)) return value;
      const key = normalizeTranslationKey(_key);
      if (key && hasManualLocaleOverride(language, key)) return value;
      return atzenizeText(value);
    }
  })
  .use({
    type: "postProcessor",
    name: "bavarianize",
    process(value: unknown, _key: unknown, options?: { lng?: string }) {
      if (typeof value !== "string") return value;
      const language = options?.lng ?? i18n.resolvedLanguage ?? i18n.language;
      if (!isBavarianLanguage(language)) return value;
      const key = normalizeTranslationKey(_key);
      if (key && hasManualLocaleOverride(language, key)) return value;
      return bavarianizeText(value);
    }
  })
  .use({
    type: "postProcessor",
    name: "householdReplace",
    process(value: unknown) {
      return typeof value === "string" ? applyHouseholdTranslationOverrides(value) : value;
    }
  })
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: defaultLanguage,
    interpolation: {
      escapeValue: false
    },
    returnNull: false,
    postProcess: ["atzenize", "bavarianize", "householdReplace"]
  });

export const getDateLocale = (language: string) =>
  language.startsWith("uk")
    ? "uk-UA"
    : language.startsWith("de") || language.startsWith("bar") || language.startsWith("ffm")
      ? "de-DE"
      : "en-GB";

export default i18n;
