import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";

type Theme = "light" | "dark";
type AppState = {
  zoom?: { value: number };
  scrollX?: number;
  scrollY?: number;
  viewBackgroundColor?: string;
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  collaborators?: unknown;
};
type ExcalidrawInitialDataState = {
  elements?: unknown[];
  files?: Record<string, unknown>;
  appState?: Partial<AppState>;
};

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
      appState?: Partial<AppState>;
      files?: Record<string, unknown>;
    };
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const MAX_COORD = 50_000;
const MAX_SIZE = 50_000;

const clampNumber = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : 0;

const sanitizePoints = (points: unknown) => {
  if (!Array.isArray(points)) return points;
  return points.map((point) => {
    if (!Array.isArray(point) || point.length < 2) return point;
    const x = typeof point[0] === "number" ? clampNumber(point[0], -MAX_COORD, MAX_COORD) : 0;
    const y = typeof point[1] === "number" ? clampNumber(point[1], -MAX_COORD, MAX_COORD) : 0;
    return [x, y, ...point.slice(2)];
  });
};

const sanitizeElements = (elements?: readonly unknown[]) => {
  if (!Array.isArray(elements)) return [];
  const sanitized: unknown[] = [];
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    const entry = { ...(element as Record<string, unknown>) };
    if (typeof entry.x === "number") entry.x = clampNumber(entry.x, -MAX_COORD, MAX_COORD);
    if (typeof entry.y === "number") entry.y = clampNumber(entry.y, -MAX_COORD, MAX_COORD);
    if (typeof entry.width === "number") entry.width = clampNumber(entry.width, 0, MAX_SIZE);
    if (typeof entry.height === "number") entry.height = clampNumber(entry.height, 0, MAX_SIZE);
    if ("points" in entry) entry.points = sanitizePoints(entry.points);
    if ("lastCommittedPoint" in entry) {
      entry.lastCommittedPoint = sanitizePoints(entry.lastCommittedPoint);
    }
    sanitized.push(entry);
  }
  return sanitized;
};

const normalizeAppState = (appState?: Partial<AppState>) => {
  if (!appState || typeof appState !== "object") return {};
  const { ...rest } = appState as Record<string, unknown>;
  const sanitized: Partial<AppState> = { ...(rest as Partial<AppState>) };
  if (sanitized.zoom && typeof sanitized.zoom.value === "number") {
    const clamped = Math.min(Math.max(sanitized.zoom.value, 0.1), 2);
    sanitized.zoom = { ...sanitized.zoom, value: Number.isFinite(clamped) ? clamped : 1 };
  } else {
    sanitized.zoom = { value: 1 };
  }
  if (typeof sanitized.scrollX === "number") {
    sanitized.scrollX =
      Number.isFinite(sanitized.scrollX) && Math.abs(sanitized.scrollX) <= 1_000_000
        ? sanitized.scrollX
        : 0;
  }
  if (typeof sanitized.scrollY === "number") {
    sanitized.scrollY =
      Number.isFinite(sanitized.scrollY) && Math.abs(sanitized.scrollY) <= 1_000_000
        ? sanitized.scrollY
        : 0;
  }
  return sanitized;
};

const buildSceneSignature = (elements: readonly unknown[], files: Record<string, unknown>) => {
  const elementParts = elements.map((entry) => {
    if (!entry || typeof entry !== "object") return "x";
    const element = entry as Record<string, unknown>;
    const id = typeof element.id === "string" ? element.id : "x";
    const version = typeof element.version === "number" ? element.version : 0;
    const updated = typeof element.updated === "number" ? element.updated : 0;
    return `${id}:${version}:${updated}`;
  });
  const fileKeys = Object.keys(files ?? {}).sort();
  return `${elementParts.join("|")}::${fileKeys.join(",")}`;
};

const clampSize = (value: number, fallback: number, max: number) => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
};

export const ExcalidrawBoard = ({
  sceneJson,
  onSceneChange,
  readOnly = false,
  className,
  height = 520
}: ExcalidrawBoardProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>(getThemePreference() as Theme);
  const lastSceneSignatureRef = useRef<string | null>(null);

  const themeColors = {
    primary: readCssColor("--brand-500", "#1f8a7f"),
    accent: readCssColor("--accent-500", "#14b8a6"),
    background: readCssColor("--brand-50", "#f0fdf4")
  };

  const initialData = useMemo<ExcalidrawInitialDataState>(() => {
    const parsed = safeParseScene(sceneJson);
    const baseAppState = normalizeAppState(parsed?.appState);
    const initialElements = sanitizeElements(parsed?.elements);
    const initialFiles = parsed?.files ?? {};
    return {
      elements: initialElements,
      files: initialFiles,
      appState: {
        ...baseAppState,
        collaborators: new Map(),
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
    const parsed = safeParseScene(sceneJson);
    const initialElements = sanitizeElements(parsed?.elements);
    const initialFiles = parsed?.files ?? {};
    lastSceneSignatureRef.current = buildSceneSignature(initialElements, initialFiles);
  }, [sceneJson]);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getThemePreference()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(window.innerHeight);
    };
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);

  const heightCap = viewportHeight ? Math.floor(viewportHeight * 0.7) : 900;
  const safeHeight = clampSize(height, 420, Math.min(900, heightCap));

  return (
    <div
      ref={containerRef}
      className={`excalidraw-embed ${className ?? ""}`.trim()}
      style={{
        height: safeHeight,
        maxHeight: safeHeight,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        // padding: "0 6px",
        margin: "0 auto",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "100%", height: "100%", margin: "0 auto", maxWidth: "100%" }}>
        <Excalidraw
        // @ts-expect-error whooo
          initialData={initialData as unknown}
          viewModeEnabled={readOnly}
          theme={theme}
          onChange={(elements, appState, files) => {
            if (!onSceneChange) return;
            const sanitizedElements = sanitizeElements(elements);
            const sanitizedFiles = files ?? {};
            const signature = buildSceneSignature(
              sanitizedElements,
              sanitizedFiles,
            );
            if (lastSceneSignatureRef.current === signature) return;
            lastSceneSignatureRef.current = signature;
            const sanitizedAppState = normalizeAppState(appState);
            const payload = JSON.stringify({
              elements: sanitizedElements,
              appState: {
                ...sanitizedAppState,
                theme,
                viewBackgroundColor:
                  appState.viewBackgroundColor ?? themeColors.background,
                currentItemStrokeColor:
                  appState.currentItemStrokeColor ?? themeColors.primary,
                currentItemBackgroundColor:
                  appState.currentItemBackgroundColor ?? themeColors.accent,
              },
              files: sanitizedFiles,
            });
            onSceneChange(payload);
          }}
        />
      </div>
    </div>
  );
};
