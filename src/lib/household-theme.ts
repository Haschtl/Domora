type ThemePalette = Record<number, string>;

const DEFAULT_PRIMARY = "#1f8a7f";
const DEFAULT_ACCENT = "#14b8a6";
const DEFAULT_FONT = '"Space Grotesk", "Segoe UI", sans-serif';
const DEFAULT_RADIUS_SCALE = 1;

const SHADE_MAP: Array<{ shade: number; lightness: number }> = [
  { shade: 50, lightness: 96 },
  { shade: 100, lightness: 90 },
  { shade: 200, lightness: 82 },
  { shade: 300, lightness: 72 },
  { shade: 400, lightness: 62 },
  { shade: 500, lightness: 52 },
  { shade: 600, lightness: 44 },
  { shade: 700, lightness: 36 },
  { shade: 800, lightness: 28 },
  { shade: 900, lightness: 22 }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) return { r: 0, g: 0, b: 0 };
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;

const rgbToHsl = (r: number, g: number, b: number) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
};

const hslToRgb = (h: number, s: number, l: number) => {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r:number;
  let g: number;
  let b: number;
  if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
};

const buildPalette = (baseHex: string): ThemePalette => {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s } = rgbToHsl(r, g, b);
  const palette: ThemePalette = {};
  SHADE_MAP.forEach(({ shade, lightness }) => {
    const { r: nr, g: ng, b: nb } = hslToRgb(h, s, lightness);
    palette[shade] = rgbToHex(nr, ng, nb);
  });
  return palette;
};

export type HouseholdThemeConfig = {
  primaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  radiusScale?: number | null;
};

export const normalizeHouseholdTheme = (input: HouseholdThemeConfig) => ({
  primaryColor:
    input.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(input.primaryColor) ? input.primaryColor : DEFAULT_PRIMARY,
  accentColor:
    input.accentColor && /^#[0-9A-Fa-f]{6}$/.test(input.accentColor) ? input.accentColor : DEFAULT_ACCENT,
  fontFamily: input.fontFamily ?? DEFAULT_FONT,
  radiusScale: clamp(Number(input.radiusScale ?? DEFAULT_RADIUS_SCALE), 0.5, 1.5)
});

export const applyHouseholdTheme = (theme: HouseholdThemeConfig) => {
  if (typeof document === "undefined") return;
  const normalized = normalizeHouseholdTheme(theme);
  const root = document.documentElement;

  const primaryPalette = buildPalette(normalized.primaryColor);
  const accentPalette = buildPalette(normalized.accentColor);

  Object.entries(primaryPalette).forEach(([shade, value]) => {
    root.style.setProperty(`--brand-${shade}`, value);
    const { r, g, b } = hexToRgb(value);
    root.style.setProperty(`--brand-${shade}-rgb`, `${r} ${g} ${b}`);
  });
  Object.entries(accentPalette).forEach(([shade, value]) => {
    root.style.setProperty(`--accent-${shade}`, value);
    const { r, g, b } = hexToRgb(value);
    root.style.setProperty(`--accent-${shade}-rgb`, `${r} ${g} ${b}`);
  });

  root.style.setProperty("--app-bg-light-1", primaryPalette[50]);
  root.style.setProperty("--app-bg-light-2", primaryPalette[100]);
  root.style.setProperty("--app-bg-light-3", primaryPalette[200]);
  root.style.setProperty("--app-bg-light-glow-1", `rgb(${hexToRgb(primaryPalette[500]).r} ${hexToRgb(primaryPalette[500]).g} ${hexToRgb(primaryPalette[500]).b} / 0.18)`);
  root.style.setProperty("--app-bg-light-glow-2", `rgb(${hexToRgb(primaryPalette[600]).r} ${hexToRgb(primaryPalette[600]).g} ${hexToRgb(primaryPalette[600]).b} / 0.16)`);
  root.style.setProperty("--app-bg-dark-1", "#060b10");
  root.style.setProperty("--app-bg-dark-2", "#0a151c");
  root.style.setProperty("--app-bg-dark-3", "#0f1f27");
  root.style.setProperty("--app-bg-dark-glow-1", `rgb(${hexToRgb(accentPalette[500]).r} ${hexToRgb(accentPalette[500]).g} ${hexToRgb(accentPalette[500]).b} / 0.16)`);
  root.style.setProperty("--app-bg-dark-glow-2", `rgb(${hexToRgb(accentPalette[700]).r} ${hexToRgb(accentPalette[700]).g} ${hexToRgb(accentPalette[700]).b} / 0.18)`);
  root.style.setProperty("--toastify-color-light", primaryPalette[50]);
  root.style.setProperty("--toastify-text-color-light", "#0f172a");
  root.style.setProperty("--toastify-color-dark", "#0f172a");
  root.style.setProperty("--toastify-text-color-dark", "#e2e8f0");
  root.style.setProperty("--toastify-domora-bg", `rgb(${hexToRgb(primaryPalette[50]).r} ${hexToRgb(primaryPalette[50]).g} ${hexToRgb(primaryPalette[50]).b} / 0.96)`);
  root.style.setProperty("--toastify-domora-border", `rgb(${hexToRgb(primaryPalette[300]).r} ${hexToRgb(primaryPalette[300]).g} ${hexToRgb(primaryPalette[300]).b} / 0.7)`);
  root.style.setProperty("--toastify-domora-bg-dark", "rgb(15 23 42 / 0.95)");
  root.style.setProperty("--toastify-domora-border-dark", `rgb(${hexToRgb(accentPalette[700]).r} ${hexToRgb(accentPalette[700]).g} ${hexToRgb(accentPalette[700]).b} / 0.7)`);

  root.style.setProperty("--theme-font", normalized.fontFamily);

  const radiusScale = normalized.radiusScale;
  root.style.setProperty("--radius-sm", `${0.25 * radiusScale}rem`);
  root.style.setProperty("--radius-md", `${0.375 * radiusScale}rem`);
  root.style.setProperty("--radius-lg", `${0.5 * radiusScale}rem`);
  root.style.setProperty("--radius-xl", `${0.75 * radiusScale}rem`);
  root.style.setProperty("--radius-2xl", `${1 * radiusScale}rem`);
  root.style.setProperty("--radius-full", "9999px");
  root.style.setProperty("--toastify-toast-bd-radius", `${0.75 * radiusScale}rem`);
};
