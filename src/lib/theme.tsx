import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { ThemeContext, type ResolvedTheme, type ThemePreference } from "./theme-context";

const STORAGE_KEY = "domora-theme";

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const resolveTheme = (theme: ThemePreference): ResolvedTheme => {
  if (theme === "system") return getSystemTheme();
  return theme;
};

const getStoredTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "system";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
};

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [theme, setThemeState] = useState<ThemePreference>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (nextTheme: ThemePreference) => {
      const nextResolved = resolveTheme(nextTheme);
      setResolvedTheme(nextResolved);

      document.documentElement.classList.toggle("dark", nextResolved === "dark");
      document.documentElement.style.colorScheme = nextResolved;
    };

    const onSystemChange = () => {
      if (theme === "system") apply("system");
    };

    apply(theme);

    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, [theme]);

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme
    }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
