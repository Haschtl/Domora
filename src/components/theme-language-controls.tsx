import { LaptopMinimal, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { persistLanguagePreference } from "../i18n";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { useTheme, type ThemePreference } from "../lib/use-theme";
import type { SupportedLanguage } from "../lib/translations";

const themeItems: { id: ThemePreference; icon: typeof Sun }[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: LaptopMinimal }
];

const languages: SupportedLanguage[] = ["de", "en"];

interface ThemeLanguageControlsProps {
  surface?: "default" | "brand";
}

export const ThemeLanguageControls = ({ surface = "brand" }: ThemeLanguageControlsProps) => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const currentLanguage: SupportedLanguage = i18n.resolvedLanguage?.startsWith("en") ? "en" : "de";
  const useBrandSurface = surface === "brand";

  const panelClass = useBrandSurface
    ? "rounded-xl border border-white/30 bg-white/15 p-1"
    : "rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800";

  const labelClass = useBrandSurface
    ? "px-2 text-[11px] font-semibold uppercase tracking-wide text-white/80"
    : "px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

  const buttonBaseClass = useBrandSurface
    ? "h-8 px-2 text-white hover:bg-white/20"
    : "h-8 px-2 text-slate-700 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-700";

  const activeButtonClass = useBrandSurface
    ? "bg-white/25 text-white"
    : "bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100";

  const inactiveButtonClass = useBrandSurface ? "opacity-80" : "opacity-90";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`flex items-center gap-1 ${panelClass}`}>
        <span className={labelClass}>{t("theme.label")}</span>
        {themeItems.map((item) => {
          const Icon = item.icon;
          const active = theme === item.id;

          return (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                buttonBaseClass,
                active ? activeButtonClass : inactiveButtonClass
              )}
              onClick={() => setTheme(item.id)}
              title={t(`theme.${item.id}`)}
              aria-label={t(`theme.${item.id}`)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>

      <div className={`flex items-center gap-1 ${panelClass}`}>
        <span className={labelClass}>{t("language.label")}</span>
        {languages.map((language) => (
          <Button
            key={language}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              buttonBaseClass,
              currentLanguage === language ? activeButtonClass : inactiveButtonClass
            )}
            onClick={() => {
              persistLanguagePreference(language);
              void i18n.changeLanguage(language);
            }}
            aria-label={t(`language.${language}`)}
          >
            {t(`language.${language}`)}
          </Button>
        ))}
      </div>
    </div>
  );
};
