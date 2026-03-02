import type { WeatherState } from "weather-icons-animated";

export type HouseholdWeatherDay = {
  date: string;
  weatherCode: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPercent: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDeg: number | null;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
};

export type HouseholdWeatherHourlyPoint = {
  time: string;
  tempC: number | null;
  apparentTempC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  precipitationProbabilityPercent: number | null;
  cloudCoverPercent: number | null;
  uvIndex: number | null;
  windSpeedKmh: number | null;
};

const moonEmojiCanvasCache = new Map<string, HTMLCanvasElement>();

export const getAnimatedWeatherState = (day: HouseholdWeatherDay): WeatherState => {
  const code = day.weatherCode;
  const wind = day.windSpeedKmh ?? 0;
  if (wind >= 45 && (code === 0 || code === 1 || code === 2 || code === 3)) {
    return "windy-variant";
  }
  if (wind >= 30 && (code === 0 || code === 1 || code === 2 || code === 3)) {
    return "windy";
  }
  if (code === null) return "partlycloudy";
  if (code === 0) return "sunny";
  if (code === 1 || code === 2) return "partlycloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rainy";
  if (code === 82) return "pouring";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snowy";
  if (code >= 95 && code <= 99) return code === 96 || code === 99 ? "lightning-rainy" : "lightning";
  return "partlycloudy";
};

export const getWeatherConditionLabelKey = (day: HouseholdWeatherDay) => {
  const code = day.weatherCode;
  if (code === null) return "home.householdWeatherConditionUnknown";
  if (code === 0) return "home.householdWeatherConditionClear";
  if (code === 1 || code === 2) return "home.householdWeatherConditionPartlyCloudy";
  if (code === 3) return "home.householdWeatherConditionCloudy";
  if (code === 45 || code === 48) return "home.householdWeatherConditionFog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "home.householdWeatherConditionRain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "home.householdWeatherConditionSnow";
  if (code >= 95 && code <= 99) return "home.householdWeatherConditionThunder";
  return "home.householdWeatherConditionUnknown";
};

export const getDailyWeatherWarnings = (day: HouseholdWeatherDay) => {
  const code = day.weatherCode ?? -1;
  const hasSnowOrFreezingCode =
    (code >= 71 && code <= 77) || code === 85 || code === 86 || code === 66 || code === 67;
  const hasIcyCondition =
    hasSnowOrFreezingCode || ((day.tempMinC ?? Number.POSITIVE_INFINITY) <= 0 && (day.precipitationMm ?? 0) > 0);
  const hasHeatCondition = (day.tempMaxC ?? Number.NEGATIVE_INFINITY) >= 30;
  const hasStormCondition =
    (day.windGustKmh ?? Number.NEGATIVE_INFINITY) >= 60 ||
    (day.windSpeedKmh ?? Number.NEGATIVE_INFINITY) >= 45 ||
    (code >= 95 && code <= 99);
  const hasHighUvCondition = (day.uvIndexMax ?? Number.NEGATIVE_INFINITY) >= 6;

  return {
    icy: hasIcyCondition,
    heat: hasHeatCondition,
    storm: hasStormCondition,
    uv: hasHighUvCondition
  };
};

export const getDateKeyFromIsoDateTime = (value: string) => value.slice(0, 10);

export const addDaysToDateKey = (dateKey: string, days: number) => {
  const source = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(source.getTime())) return dateKey;
  source.setDate(source.getDate() + days);
  const year = source.getFullYear();
  const month = `${source.getMonth() + 1}`.padStart(2, "0");
  const day = `${source.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getMoonPhaseFraction = (date: Date) => {
  const synodicMonthDays = 29.530588853;
  const referenceNewMoonUtcMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSinceReference = (date.getTime() - referenceNewMoonUtcMs) / (1000 * 60 * 60 * 24);
  const cycle = daysSinceReference / synodicMonthDays;
  const normalized = cycle - Math.floor(cycle);
  return normalized < 0 ? normalized + 1 : normalized;
};

export const getMoonIllumination = (phase: number) => 0.5 * (1 - Math.cos(2 * Math.PI * phase));

export const getMoonPhaseEmoji = (phase: number) => {
  if (phase < 0.0625 || phase >= 0.9375) return "🌑";
  if (phase < 0.1875) return "🌒";
  if (phase < 0.3125) return "🌓";
  if (phase < 0.4375) return "🌔";
  if (phase < 0.5625) return "🌕";
  if (phase < 0.6875) return "🌖";
  if (phase < 0.8125) return "🌗";
  return "🌘";
};

export const getMoonPhaseLabel = (phase: number) => {
  if (phase < 0.0625 || phase >= 0.9375) return "Neumond";
  if (phase < 0.1875) return "Zunehmende Sichel";
  if (phase < 0.3125) return "Erstes Viertel";
  if (phase < 0.4375) return "Zunehmender Mond";
  if (phase < 0.5625) return "Vollmond";
  if (phase < 0.6875) return "Abnehmender Mond";
  if (phase < 0.8125) return "Letztes Viertel";
  return "Abnehmende Sichel";
};

export const getMoonPhasePointStyle = (emoji: string) => {
  const cached = moonEmojiCanvasCache.get(emoji);
  if (cached) return cached;
  if (typeof document === "undefined") return emoji;
  const canvas = document.createElement("canvas");
  canvas.width = 20;
  canvas.height = 20;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 10, 10);
  }
  moonEmojiCanvasCache.set(emoji, canvas);
  return canvas;
};

export const resolveChartTickIndex = (tickValue: unknown, fallbackIndex: number) => {
  if (typeof tickValue === "number" && Number.isFinite(tickValue)) {
    return Math.round(tickValue);
  }
  const parsed = Number(tickValue);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed);
  }
  return fallbackIndex;
};

export const getWeatherXAxisDensity = (visibleHours: number) => {
  if (visibleHours <= 30) return { labelEvery: 1, minorGridEvery: 1, majorGridEvery: 6 };
  if (visibleHours <= 60) return { labelEvery: 2, minorGridEvery: 2, majorGridEvery: 6 };
  if (visibleHours <= 96) return { labelEvery: 4, minorGridEvery: 4, majorGridEvery: 12 };
  if (visibleHours <= 144) return { labelEvery: 6, minorGridEvery: 6, majorGridEvery: 24 };
  return { labelEvery: 12, minorGridEvery: 12, majorGridEvery: 24 };
};

export const getPrecipitationBarColor = (precipProbabilityPercent: number | null) => {
  const probability = Math.min(100, Math.max(0, precipProbabilityPercent ?? 0));
  const t = probability / 100;
  const lightness = 78 - t * 34;
  const saturation = 68 + t * 20;
  const alpha = 0.28 + t * 0.56;
  return `hsla(210, ${saturation}%, ${lightness}%, ${alpha})`;
};

export const getPrecipitationBarBorderColor = (precipProbabilityPercent: number | null) => {
  const probability = Math.min(100, Math.max(0, precipProbabilityPercent ?? 0));
  const t = probability / 100;
  const lightness = 58 - t * 20;
  const saturation = 70 + t * 18;
  const alpha = 0.45 + t * 0.45;
  return `hsla(214, ${saturation}%, ${lightness}%, ${alpha})`;
};

export const getPrecipitationAxisMax = (values: Array<number | null>) => {
  const maxValue = values.reduce<number>((max, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);

  const baselineMax = 12;
  const target = Math.max(maxValue, baselineMax);

  if (target <= 12) return 12;
  if (target <= 25) return Math.ceil(target / 2) * 2;
  if (target <= 50) return Math.ceil(target / 5) * 5;
  if (target <= 100) return Math.ceil(target / 10) * 10;
  return Math.ceil(target / 25) * 25;
};

export const getUvAxisMax = (values: Array<number | null>) => {
  const maxValue = values.reduce<number>((max, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);
  const baselineMax = 8;
  const target = Math.max(maxValue, baselineMax);
  if (target <= 8) return 8;
  if (target <= 12) return 12;
  return Math.ceil(target);
};

export const getWeatherPrimaryAxisRange = (points: HouseholdWeatherHourlyPoint[]) => {
  const allValues: number[] = [];
  points.forEach((point) => {
    if (typeof point.tempC === "number" && Number.isFinite(point.tempC)) allValues.push(point.tempC);
    if (typeof point.apparentTempC === "number" && Number.isFinite(point.apparentTempC)) allValues.push(point.apparentTempC);
    if (typeof point.windSpeedKmh === "number" && Number.isFinite(point.windSpeedKmh)) allValues.push(point.windSpeedKmh);
  });

  if (allValues.length === 0) {
    return { min: -5, max: 35 };
  }

  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const basePadding = 2;
  const min = Math.floor(minValue - basePadding);
  const max = Math.ceil(maxValue + basePadding);
  if (max <= min) return { min, max: min + 6 };
  return { min, max };
};
