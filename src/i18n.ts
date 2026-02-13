import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLanguage, resources, supportedLanguages, type SupportedLanguage } from "./lib/translations";

const STORAGE_KEY = "domora-language";

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

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLanguage(),
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false
  },
  showSupportNotice:false,
  returnNull: false
});

export const getDateLocale = (language: string) => (language.startsWith("de") ? "de-DE" : "en-GB");

export default i18n;
