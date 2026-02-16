import { useEffect, useMemo, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw";
import { Excalidraw } from "@excalidraw/excalidraw";

interface ExcalidrawBoardProps {
  sceneJson: string;
  onSceneChange?: (sceneJson: string) => void;
  readOnly?: boolean;
  className?: string;
  height?: number;
}

const getThemePreference = () =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

const readCssColor = (variable: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
};

const safeParseScene = (sceneJson: string) => {
  if (!sceneJson) return null;
  try {
    const parsed = JSON.parse(sceneJson) as {
      elements?: unknown[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    };
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const normalizeAppState = (appState?: Record<string, unknown>) => {
  if (!appState) return {};
  const { width, height, ...rest } = appState;
  return rest;
};

export const ExcalidrawBoard = ({
  sceneJson,
  onSceneChange,
  readOnly = false,
  className,
  height = 520
}: ExcalidrawBoardProps) => {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [theme, setTheme] = useState(getThemePreference);

  const themeColors = {
    primary: readCssColor("--brand-500", "#1f8a7f"),
    accent: readCssColor("--accent-500", "#14b8a6"),
    background: readCssColor("--brand-50", "#f0fdf4")
  };

  const initialData = useMemo(() => {
    const parsed = safeParseScene(sceneJson);
    const baseAppState = normalizeAppState(parsed?.appState);
    return {
      elements: parsed?.elements ?? [],
      files: parsed?.files ?? {},
      appState: {
        ...baseAppState,
        theme,
        viewBackgroundColor: (parsed?.appState?.viewBackgroundColor as string) ?? themeColors.background,
        currentItemStrokeColor:
          (parsed?.appState?.currentItemStrokeColor as string) ?? themeColors.primary,
        currentItemBackgroundColor:
          (parsed?.appState?.currentItemBackgroundColor as string) ?? themeColors.accent
      }
    };
  }, [sceneJson, theme, themeColors]);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getThemePreference()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={className}
      style={{ height, maxHeight: height, width: "100%", maxWidth: "100%", overflow: "hidden" }}
    >
      <Excalidraw
        ref={excalidrawRef}
        initialData={initialData}
        viewModeEnabled={readOnly}
        theme={theme}
        onChange={(elements, appState, files) => {
          if (!onSceneChange) return;
          const sanitizedAppState = normalizeAppState(appState as Record<string, unknown>);
          const payload = JSON.stringify({
            elements,
            appState: {
              ...sanitizedAppState,
              theme,
              viewBackgroundColor: appState.viewBackgroundColor ?? themeColors.background,
              currentItemStrokeColor: appState.currentItemStrokeColor ?? themeColors.primary,
              currentItemBackgroundColor: appState.currentItemBackgroundColor ?? themeColors.accent
            },
            files
          });
          onSceneChange(payload);
        }}
      />
    </div>
  );
};
