import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Chart as ChartJS } from "react-chartjs-2";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Flame, Snowflake, Sun, Wind } from "lucide-react";
import { WeatherSvg } from "weather-icons-animated";
import { formatDateOnly } from "../../../lib/date";
import {
  HouseholdWeatherDailyPreview,
  HouseholdWeatherPlot,
} from "../../../features/components/widgets";
import {
  getAnimatedWeatherState,
  getDailyWeatherWarnings,
  getWeatherConditionLabelKey,
  addDaysToDateKey,
  getDateKeyFromIsoDateTime,
  getMoonIllumination,
  getMoonPhaseEmoji,
  getMoonPhaseFraction,
  getMoonPhaseLabel,
  getMoonPhasePointStyle,
  getPrecipitationAxisMax,
  getPrecipitationBarBorderColor,
  getPrecipitationBarColor,
  getUvAxisMax,
  getWeatherPrimaryAxisRange,
  getWeatherXAxisDensity,
  resolveChartTickIndex,
} from "./weather";
import type {
  HouseholdWeatherDay,
  HouseholdWeatherHourlyPoint,
} from "./weather";
import { useTranslation } from "react-i18next";

type WeatherContextValue = {
  mapHasPin: boolean;
  isLoading: boolean;
  isError: boolean;
  days: HouseholdWeatherDay[];
  hourly: HouseholdWeatherHourlyPoint[];
  byDay: Map<string, HouseholdWeatherDay>;
  language: string;
  state: "needsAddress" | "loading" | "error" | "empty" | "ready";
};

const WeatherContext = createContext<WeatherContextValue | null>(null);

const parseWeatherResponse = (payload: {
  daily?: {
    time?: unknown[];
    weather_code?: unknown[];
    temperature_2m_max?: unknown[];
    temperature_2m_min?: unknown[];
    precipitation_sum?: unknown[];
    precipitation_probability_max?: unknown[];
    uv_index_max?: unknown[];
    wind_speed_10m_max?: unknown[];
    wind_gusts_10m_max?: unknown[];
    wind_direction_10m_dominant?: unknown[];
    sunrise?: unknown[];
    sunset?: unknown[];
  };
  hourly?: {
    time?: unknown[];
    temperature_2m?: unknown[];
    apparent_temperature?: unknown[];
    precipitation?: unknown[];
    snowfall?: unknown[];
    precipitation_probability?: unknown[];
    cloud_cover?: unknown[];
    uv_index?: unknown[];
    wind_speed_10m?: unknown[];
  };
}) => {
  const daily = payload.daily ?? {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  const days: HouseholdWeatherDay[] = times
    .slice(0, 7)
    .map((entry, index) => {
      const date = typeof entry === "string" ? entry : "";
      const readNumber = (values: unknown[] | undefined): number | null => {
        const raw = values?.[index];
        const parsed = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      };
      return {
        date,
        weatherCode: readNumber(
          Array.isArray(daily.weather_code) ? daily.weather_code : undefined,
        ),
        tempMaxC: readNumber(
          Array.isArray(daily.temperature_2m_max)
            ? daily.temperature_2m_max
            : undefined,
        ),
        tempMinC: readNumber(
          Array.isArray(daily.temperature_2m_min)
            ? daily.temperature_2m_min
            : undefined,
        ),
        precipitationMm: readNumber(
          Array.isArray(daily.precipitation_sum)
            ? daily.precipitation_sum
            : undefined,
        ),
        precipitationProbabilityPercent: readNumber(
          Array.isArray(daily.precipitation_probability_max)
            ? daily.precipitation_probability_max
            : undefined,
        ),
        uvIndexMax: readNumber(
          Array.isArray(daily.uv_index_max) ? daily.uv_index_max : undefined,
        ),
        windSpeedKmh: readNumber(
          Array.isArray(daily.wind_speed_10m_max)
            ? daily.wind_speed_10m_max
            : undefined,
        ),
        windGustKmh: readNumber(
          Array.isArray(daily.wind_gusts_10m_max)
            ? daily.wind_gusts_10m_max
            : undefined,
        ),
        windDirectionDeg: readNumber(
          Array.isArray(daily.wind_direction_10m_dominant)
            ? daily.wind_direction_10m_dominant
            : undefined,
        ),
        sunrise: (() => {
          const raw = Array.isArray(daily.sunrise)
            ? daily.sunrise[index]
            : null;
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })(),
        sunset: (() => {
          const raw = Array.isArray(daily.sunset) ? daily.sunset[index] : null;
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })(),
      };
    })
    .filter((entry) => entry.date.length > 0);

  const hourly = payload.hourly ?? {};
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  const hourlyReadNumber = (
    values: unknown[] | undefined,
    index: number,
  ): number | null => {
    const raw = values?.[index];
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const next7DaysHourly: HouseholdWeatherHourlyPoint[] = hourlyTimes
    .slice(0, 24 * 7)
    .map((entry, index) => ({
      time: typeof entry === "string" ? entry : "",
      tempC: hourlyReadNumber(
        Array.isArray(hourly.temperature_2m)
          ? hourly.temperature_2m
          : undefined,
        index,
      ),
      apparentTempC: hourlyReadNumber(
        Array.isArray(hourly.apparent_temperature)
          ? hourly.apparent_temperature
          : undefined,
        index,
      ),
      precipitationMm: hourlyReadNumber(
        Array.isArray(hourly.precipitation) ? hourly.precipitation : undefined,
        index,
      ),
      snowfallCm: hourlyReadNumber(
        Array.isArray(hourly.snowfall) ? hourly.snowfall : undefined,
        index,
      ),
      precipitationProbabilityPercent: hourlyReadNumber(
        Array.isArray(hourly.precipitation_probability)
          ? hourly.precipitation_probability
          : undefined,
        index,
      ),
      cloudCoverPercent: hourlyReadNumber(
        Array.isArray(hourly.cloud_cover) ? hourly.cloud_cover : undefined,
        index,
      ),
      uvIndex: hourlyReadNumber(
        Array.isArray(hourly.uv_index) ? hourly.uv_index : undefined,
        index,
      ),
      windSpeedKmh: hourlyReadNumber(
        Array.isArray(hourly.wind_speed_10m)
          ? hourly.wind_speed_10m
          : undefined,
        index,
      ),
    }))
    .filter((entry) => entry.time.length > 0);

  return { days, hourly: next7DaysHourly };
};

export const useHouseholdWeatherData = ({
  householdId,
  address,
}: {
  householdId: string;
  address: string;
}) => {
  const normalizedAddress = address.trim();
  const geocodeQuery = useQuery<{ lat: number; lon: number } | null>({
    queryKey: ["weather-geocode", householdId, normalizedAddress],
    enabled: normalizedAddress.length > 3,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        name: normalizedAddress,
        count: "1",
        format: "json",
      });
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("weather_geocode_failed");
      const payload = (await response.json()) as {
        results?: Array<{ latitude?: unknown; longitude?: unknown }>;
      };
      const first = payload.results?.[0];
      const lat = Number(first?.latitude);
      const lon = Number(first?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    },
  });

  const weatherQuery = useQuery<{
    days: HouseholdWeatherDay[];
    hourly: HouseholdWeatherHourlyPoint[];
  }>({
    queryKey: [
      "household-weather",
      householdId,
      geocodeQuery.data?.lat ?? null,
      geocodeQuery.data?.lon ?? null,
    ],
    enabled: Boolean(geocodeQuery.data),
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const latitude = geocodeQuery.data!.lat;
      const longitude = geocodeQuery.data!.lon;
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_sum",
          "precipitation_probability_max",
          "uv_index_max",
          "wind_speed_10m_max",
          "wind_gusts_10m_max",
          "wind_direction_10m_dominant",
          "sunrise",
          "sunset",
        ].join(","),
        hourly: [
          "temperature_2m",
          "apparent_temperature",
          "precipitation",
          "snowfall",
          "precipitation_probability",
          "cloud_cover",
          "uv_index",
          "wind_speed_10m",
        ].join(","),
        timezone: "auto",
        forecast_days: "7",
      });
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("weather_fetch_failed");
      const payload = (await response.json()) as Parameters<
        typeof parseWeatherResponse
      >[0];
      return parseWeatherResponse(payload);
    },
  });

  const hasPin = Boolean(geocodeQuery.data);
  return {
    hasPin,
    isLoading: geocodeQuery.isLoading || (hasPin && weatherQuery.isLoading),
    isError: geocodeQuery.isError || weatherQuery.isError,
    days: weatherQuery.data?.days ?? [],
    hourly: weatherQuery.data?.hourly ?? [],
  };
};

const useWeather = () => {
  const value = useContext(WeatherContext);
  if (!value) {
    throw new Error("Weather components must be used inside WeatherProvider");
  }
  return value;
};

export const WeatherProvider = ({
  householdId,
  address,
  language,
  children,
}: {
  householdId: string;
  address: string;
  language: string;
  computed?: Partial<
    Omit<
      WeatherContextValue,
      "mapHasPin" | "isLoading" | "isError" | "days" | "hourly" | "language"
    >
  >;
  children: ReactNode;
}) => {
  const householdWeather = useHouseholdWeatherData({ householdId, address });
  const householdWeatherDays = householdWeather.days;

  const householdWeatherByDay = useMemo(() => {
    const byDay = new Map<string, HouseholdWeatherDay>();
    householdWeatherDays.forEach((day) => {
      byDay.set(day.date, day);
    });
    return byDay;
  }, [householdWeatherDays]);

  const fallbackByDay = useMemo(() => {
    const byDay = new Map<string, HouseholdWeatherDay>();
    householdWeather.days.forEach((day) => byDay.set(day.date, day));
    return byDay;
  }, [householdWeather.days]);

  const state = useMemo(() => {
    if (!householdWeather.hasPin) return "needsAddress";
    if (householdWeather.isLoading) return "loading";
    if (householdWeather.isError) return "error";
    if (householdWeather.hourly.length === 0) return "empty";
    return "ready";
  }, [
    householdWeather.hasPin,
    householdWeather.hourly.length,
    householdWeather.isError,
    householdWeather.isLoading,
  ]);

  const value = useMemo<WeatherContextValue>(
    () => ({
      mapHasPin: householdWeather.hasPin,
      isLoading: householdWeather.isLoading,
      isError: householdWeather.isError,
      state,
      days: householdWeather.days,
      hourly: householdWeather.hourly,
      byDay: householdWeatherByDay ?? fallbackByDay,
      language,
    }),
    [
      fallbackByDay,
      householdWeatherByDay,
      language,
      state,
      householdWeather.days,
      householdWeather.hasPin,
      householdWeather.hourly,
      householdWeather.isError,
      householdWeather.isLoading,
    ],
  );
  return (
    <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
  );
};

export const WeatherTodayIcon = ({
  onOpenFullscreen,
  title,
}: {
  onOpenFullscreen?: () => void;
  title?: string;
}) => {
  const { t } = useTranslation();
  const weather = useWeather();
  const today = weather.days[0];
  if (!today) return null;
  const max = today.tempMaxC === null ? "—" : Math.round(today.tempMaxC);
  const min = today.tempMinC === null ? "—" : Math.round(today.tempMinC);
  const content = (
    <>
      <WeatherSvg
        state={getAnimatedWeatherState(today)}
        width={34}
        height={34}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/80">
          {t("home.householdWeatherRelativeToday")}
        </p>
        <p className="truncate text-sm font-semibold text-white">{`${max}° / ${min}°`}</p>
      </div>
    </>
  );
  if (!onOpenFullscreen) {
    return <div className="inline-flex items-center gap-2">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpenFullscreen}
      className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-slate-900/45 px-2.5 py-1.5 text-left text-white backdrop-blur transition hover:bg-slate-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      aria-label={title ?? t("home.householdWeatherTitle")}
      title={title ?? t("home.householdWeatherTitle")}
    >
      {content}
    </button>
  );
};

export const WeatherDailyForecast = ({
  dayLimit,
  getWindDirectionLabel,
}: {
  dayLimit?: number;
  getWindDirectionLabel: (degrees: number | null) => string;
}) => {
  const {t, i18n:{language}}=useTranslation()
  const weather = useWeather();
  const days =
    typeof dayLimit === "number"
      ? weather.days.slice(0, Math.max(0, dayLimit))
      : weather.days;
  if (days.length === 0) return null;

  if (weather.state === "needsAddress") {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("home.householdWeatherNeedsAddress")}
      </p>
    );
  }
  if (weather.state === "loading") {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("home.householdWeatherLoading")}
      </p>
    );
  }
  if (weather.state === "error") {
    return (
      <p className="text-xs text-rose-600 dark:text-rose-400">
        {t("home.householdWeatherError")}
      </p>
    );
  }
  if (weather.state === "empty") {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("home.householdWeatherEmpty")}
      </p>
    );
  }
  return (
    <HouseholdWeatherDailyPreview>
      {days.map((day, index) => {
        const warnings = getDailyWeatherWarnings(day);
        return (
          <div
            key={`weather-day-${day.date}`}
            className="w-[168px] shrink-0 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white/95 to-slate-50/90 p-1 shadow-sm dark:border-slate-700/90 dark:from-slate-900/85 dark:to-slate-900/65"
          >
            <div className="relative flex items-center justify-center rounded-xl bg-white/70 py-1 pt-4 dark:bg-slate-800/65">
              <p className="absolute top-2 left-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {index === 0
                  ? t("home.householdWeatherRelativeToday")
                  : index === 1
                    ? t("home.householdWeatherRelativeTomorrow")
                    : index === 2
                      ? t("home.householdWeatherRelativeDayAfterTomorrow")
                      : formatDateOnly(day.date, language, day.date)}
              </p>
              {warnings.icy ||
              warnings.heat ||
              warnings.storm ||
              warnings.uv ? (
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                  {warnings.icy ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/90 bg-cyan-50/95 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200"
                      title={t("home.householdWeatherWarningIcy")}
                      aria-label={t("home.householdWeatherWarningIcy")}
                    >
                      <Snowflake className="h-3 w-3" />
                    </span>
                  ) : null}
                  {warnings.heat ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-orange-200/90 bg-orange-50/95 text-orange-700 dark:border-orange-800 dark:bg-orange-900/40 dark:text-orange-200"
                      title={t("home.householdWeatherWarningHeat")}
                      aria-label={t("home.householdWeatherWarningHeat")}
                    >
                      <Flame className="h-3 w-3" />
                    </span>
                  ) : null}
                  {warnings.storm ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-indigo-200/90 bg-indigo-50/95 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                      title={t("home.householdWeatherWarningStorm")}
                      aria-label={t("home.householdWeatherWarningStorm")}
                    >
                      <Wind className="h-3 w-3" />
                    </span>
                  ) : null}
                  {warnings.uv ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/90 bg-amber-50/95 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      title={t("home.householdWeatherWarningUv")}
                      aria-label={t("home.householdWeatherWarningUv")}
                    >
                      <Sun className="h-3 w-3" />
                    </span>
                  ) : null}
                </div>
              ) : null}
              <WeatherSvg
                state={getAnimatedWeatherState(day)}
                width={52}
                height={52}
              />
              <span className="absolute bottom-1.5 right-2 rounded-full border border-slate-200/90 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                {t(getWeatherConditionLabelKey(day))}
              </span>
            </div>
            <p className="p-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t("home.householdWeatherTemp", {
                max: day.tempMaxC === null ? "—" : Math.round(day.tempMaxC),
                min: day.tempMinC === null ? "—" : Math.round(day.tempMinC),
              })}
            </p>
            <p className="mt-1 px-2 text-[11px] text-slate-600 dark:text-slate-300">
              {t("home.householdWeatherPrecip", {
                mm:
                  day.precipitationMm === null
                    ? "—"
                    : Number(day.precipitationMm.toFixed(1)),
                prob:
                  day.precipitationProbabilityPercent === null
                    ? "—"
                    : Math.round(day.precipitationProbabilityPercent),
              })}
            </p>
            <p className="mt-1 px-2 text-[11px] text-slate-600 dark:text-slate-300">
              {t("home.householdWeatherWind", {
                min:
                  day.windSpeedKmh === null && day.windGustKmh === null
                    ? "—"
                    : Math.min(
                          day.windSpeedKmh ?? Number.POSITIVE_INFINITY,
                          day.windGustKmh ?? Number.POSITIVE_INFINITY,
                        ) === Number.POSITIVE_INFINITY
                      ? "—"
                      : Math.round(
                          Math.min(
                            day.windSpeedKmh ?? Number.POSITIVE_INFINITY,
                            day.windGustKmh ?? Number.POSITIVE_INFINITY,
                          ),
                        ),
                max:
                  day.windSpeedKmh === null && day.windGustKmh === null
                    ? "—"
                    : Math.max(day.windSpeedKmh ?? 0, day.windGustKmh ?? 0),
                dir: getWindDirectionLabel(day.windDirectionDeg),
              })}
            </p>
          </div>
        );
      })}
    </HouseholdWeatherDailyPreview>
  );
};

export const WeatherForecastGraph = ({ isMobile }: { isMobile?: boolean }) => {
  const {
    t,
    i18n: { language },
  } = useTranslation();
  const weather = useWeather();

  const weatherChartRef = useRef<typeof ChartJS<"bar"> | null>(null);
  const weatherChartContainerRef = useRef<HTMLDivElement | null>(null);
  const lastWeatherChartTapRef = useRef<{
    at: number;
    x: number;
    y: number;
  } | null>(null);

  const householdWeatherHourly = weather.hourly;
  const hasPrecipitationInForecast = useMemo(
    () =>
      householdWeatherHourly.some((entry) => (entry.precipitationMm ?? 0) > 0),
    [householdWeatherHourly],
  );
  const hasSnowfallInForecast = useMemo(
    () => householdWeatherHourly.some((entry) => (entry.snowfallCm ?? 0) > 0),
    [householdWeatherHourly],
  );
  const [weatherLegendVersion, setWeatherLegendVersion] = useState(0);


  const legendItems = useMemo(() => {
    const activeDatasets =
      (weatherChartRef.current?.data.datasets as
        | Array<{ label?: string; hidden?: boolean }>
        | undefined) ??
      (chartData.datasets as Array<{
        label?: string;
        hidden?: boolean;
      }>);
    const chart = weatherChartRef.current;
    return activeDatasets
      .map((dataset, index) => ({
        index,
        label: dataset.label ?? `${t("common.loading")} ${index + 1}`,
        visible: chart
          ? chart.isDatasetVisible(index)
          : !(dataset.hidden ?? false),
      }))
      .filter((item) => item.label.trim().length > 0);
  }, [chartData.datasets, t, weatherLegendVersion]);


  const toggleWeatherLegendDataset = useCallback((datasetIndex: number) => {
    const chart = weatherChartRef.current;
    if (!chart) return;
    const nextVisible = !chart.isDatasetVisible(datasetIndex);
    chart.setDatasetVisibility(datasetIndex, nextVisible);
    chart.update();
    setWeatherLegendVersion((version) => version + 1);
  }, []);

  const zoomOutWeatherChart = useCallback(() => {
    const chart = weatherChartRef.current as
      | (typeof ChartJS<"bar"> & {
          resetZoom?: () => void;
          zoom?: (amount: number) => void;
        })
      | null;
    if (!chart) return;
    if (typeof chart.resetZoom === "function") {
      chart.resetZoom();
      return;
    }
    if (typeof chart.zoom === "function") {
      chart.zoom(0.8);
    }
  }, []);
  const onWeatherChartTouchEndCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.changedTouches.length !== 1) {
        lastWeatherChartTapRef.current = null;
        return;
      }
      const touch = event.changedTouches[0];
      const now = Date.now();
      const lastTap = lastWeatherChartTapRef.current;
      if (
        lastTap &&
        now - lastTap.at <= 360 &&
        Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) <= 32
      ) {
        event.preventDefault();
        zoomOutWeatherChart();
        lastWeatherChartTapRef.current = null;
        return;
      }
      lastWeatherChartTapRef.current = {
        at: now,
        x: touch.clientX,
        y: touch.clientY,
      };
    },
    [zoomOutWeatherChart],
  );
  useEffect(() => {
    const hideWeatherTooltip = () => {
      const chart = weatherChartRef.current as
        | (typeof ChartJS<"bar"> & {
            tooltip?: {
              setActiveElements?: (
                elements: unknown[],
                position: { x: number; y: number },
              ) => void;
            };
            setActiveElements?: (elements: unknown[]) => void;
          })
        | null;
      if (!chart) return;
      chart.tooltip?.setActiveElements?.([], { x: 0, y: 0 });
      chart.setActiveElements?.([]);
      chart.update();
    };

    const handlePointerOutside = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      const container = weatherChartContainerRef.current;
      if (!container) return;
      if (container.contains(targetNode)) return;
      hideWeatherTooltip();
    };

    document.addEventListener("mousedown", handlePointerOutside, true);
    document.addEventListener("touchstart", handlePointerOutside, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerOutside, true);
      document.removeEventListener("touchstart", handlePointerOutside, true);
    };
  }, []);

  const chartOptions = useMemo(() => {
    const precipitationAxisMax = getPrecipitationAxisMax(
      householdWeatherHourly.map((entry) => entry.precipitationMm),
    );
    const snowfallAxisMax = getPrecipitationAxisMax(
      householdWeatherHourly.map((entry) => entry.snowfallCm),
    );
    const uvAxisMax = getUvAxisMax(
      householdWeatherHourly.map((entry) => entry.uvIndex),
    );
    const primaryAxisRange = getWeatherPrimaryAxisRange(householdWeatherHourly);
    const initialVisibleHours = 48;
    const initialXMin = 0;
    const initialXMax = Math.max(
      0,
      Math.min(householdWeatherHourly.length - 1, initialVisibleHours - 1),
    );
    const options: Record<string, unknown> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: !isMobile,
          labels: {
            boxWidth: 12,
            boxHeight: 8,
            color: "rgb(100 116 139)",
          },
        },
        tooltip: {
          callbacks: {
            title: (items: Array<{ dataIndex: number }>) => {
              const index = items[0]?.dataIndex ?? 0;
              const row = householdWeatherHourly[index];
              if (!row) return "";
              const parsedDate = new Date(row.time);
              if (Number.isNaN(parsedDate.getTime())) return row.time;
              return parsedDate.toLocaleString(language, {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
            },
            label: (context: {
              dataset: { label?: string; yAxisID?: string };
              parsed: { y?: number };
              dataIndex: number;
            }) => {
              const datasetLabel = context.dataset.label ?? "";
              const numericValue = context.parsed.y;
              if (context.dataset.yAxisID === "ySky") {
                if (datasetLabel === "Sonnenverlauf") {
                  return `${datasetLabel}: ${Math.round((numericValue ?? 0) * 100)} %`;
                }
                const hourly = householdWeatherHourly[context.dataIndex];
                const phase = hourly
                  ? getMoonPhaseFraction(new Date(hourly.time))
                  : 0;
                return `${datasetLabel}: ${getMoonPhaseEmoji(phase)} ${getMoonPhaseLabel(phase)} (${Math.round(
                  getMoonIllumination(phase) * 100,
                )} %)`;
              }
              if (context.dataset.yAxisID === "yCloud") {
                const cover =
                  householdWeatherHourly[context.dataIndex]
                    ?.cloudCoverPercent ?? 0;
                return `${datasetLabel}: ${Math.round(cover)} %`;
              }
              if (datasetLabel === t("home.householdWeatherChartPrecip")) {
                const probability =
                  householdWeatherHourly[context.dataIndex]
                    ?.precipitationProbabilityPercent ?? 0;
                return `${datasetLabel}: ${numericValue ?? 0} mm (${Math.round(probability)} %)`;
              }
              if (datasetLabel === t("home.householdWeatherChartSnowfall")) {
                const probability =
                  householdWeatherHourly[context.dataIndex]
                    ?.precipitationProbabilityPercent ?? 0;
                return `${datasetLabel}: ${numericValue ?? 0} cm (${Math.round(probability)} %)`;
              }
              if (datasetLabel === t("home.householdWeatherChartWind")) {
                return `${datasetLabel}: ${numericValue ?? 0} km/h`;
              }
              if (datasetLabel === t("home.householdWeatherChartUvIndex")) {
                return `${datasetLabel}: ${numericValue ?? 0}`;
              }
              return `${datasetLabel}: ${numericValue ?? 0} °C`;
            },
          },
        },
      },
      scales: {
        x: {
          min: initialXMin,
          max: initialXMax,
          ticks: {
            autoSkip: false,
            maxTicksLimit: isMobile ? 6 : 14,
            maxRotation: 0,
            color: "rgb(100 116 139)",
            padding: isMobile ? 6 : 4,
            font: isMobile ? { size: 10 } : undefined,
            callback: function (
              this: { min?: number; max?: number },
              value: string | number,
              index: number,
            ) {
              const visibleMin = Number.isFinite(this.min)
                ? Number(this.min)
                : 0;
              const visibleMax = Number.isFinite(this.max)
                ? Number(this.max)
                : Math.max(0, householdWeatherHourly.length - 1);
              const visibleHours = Math.max(
                1,
                Math.round(visibleMax - visibleMin + 1),
              );
              const density = getWeatherXAxisDensity(visibleHours);
              const labelEvery = isMobile
                ? Math.max(
                    density.labelEvery * 4,
                    visibleHours <= 30 ? 6 : visibleHours <= 96 ? 8 : 12,
                  )
                : density.labelEvery;
              const parsedIndex = resolveChartTickIndex(value, index);
              const clampedIndex = Math.max(
                0,
                Math.min(householdWeatherHourly.length - 1, parsedIndex),
              );
              const row = householdWeatherHourly[clampedIndex];
              if (!row) return "";
              const date = new Date(row.time);
              if (Number.isNaN(date.getTime())) return "";

              const firstVisibleIndex = Math.max(
                0,
                Math.min(
                  householdWeatherHourly.length - 1,
                  Math.round(visibleMin),
                ),
              );
              const lastVisibleIndex = Math.max(
                0,
                Math.min(
                  householdWeatherHourly.length - 1,
                  Math.round(visibleMax),
                ),
              );
              const relativeIndex = Math.max(
                0,
                clampedIndex - firstVisibleIndex,
              );
              const isEdgeTick =
                clampedIndex === firstVisibleIndex ||
                clampedIndex === lastVisibleIndex;

              if (!isEdgeTick && relativeIndex % labelEvery !== 0) {
                return "";
              }

              if (visibleHours <= 30) {
                return isMobile
                  ? date.toLocaleTimeString(language, { hour: "2-digit" })
                  : date.toLocaleTimeString(language, {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
              }

              if (visibleHours <= 96) {
                if (date.getHours() === 0) {
                  return date.toLocaleDateString(language, {
                    day: "2-digit",
                    month: "2-digit",
                  });
                }
                return date.toLocaleTimeString(language, { hour: "2-digit" });
              }

              if (date.getHours() === 0) {
                return date.toLocaleDateString(language, {
                  day: "2-digit",
                  month: "2-digit",
                });
              }
              if (date.getHours() % 12 === 0) {
                return date.toLocaleTimeString(language, { hour: "2-digit" });
              }
              return "";
            },
          },
          grid: {
            color: (ctx: {
              chart: {
                scales?: Record<string, { min?: number; max?: number }>;
              };
              tick?: { value?: number | string };
              index: number;
            }) => {
              const xScale = ctx.chart.scales?.x;
              const visibleMin = Number.isFinite(xScale?.min)
                ? Number(xScale?.min)
                : 0;
              const visibleMax = Number.isFinite(xScale?.max)
                ? Number(xScale?.max)
                : Math.max(0, householdWeatherHourly.length - 1);
              const visibleHours = Math.max(
                1,
                Math.round(visibleMax - visibleMin + 1),
              );
              const density = getWeatherXAxisDensity(visibleHours);
              const tickIndex = resolveChartTickIndex(
                ctx.tick?.value,
                ctx.index,
              );
              const normalized = Math.max(0, tickIndex);
              const row =
                householdWeatherHourly[
                  Math.min(householdWeatherHourly.length - 1, normalized)
                ];
              if (row) {
                const isMidnightByRawTime = /T00:00(?::00)?$/.test(row.time);
                const date = new Date(row.time);
                const isMidnightByParsedTime =
                  !Number.isNaN(date.getTime()) && date.getHours() === 0;
                if (isMidnightByRawTime || isMidnightByParsedTime) {
                  return "rgba(100, 116, 139, 0.5)";
                }
              }

              if (normalized % density.majorGridEvery === 0) {
                return "rgba(148, 163, 184, 0.24)";
              }
              if (normalized % density.minorGridEvery === 0) {
                return "rgba(148, 163, 184, 0.12)";
              }
              return "rgba(148, 163, 184, 0.04)";
            },
            lineWidth: (ctx: {
              chart: {
                scales?: Record<string, { min?: number; max?: number }>;
              };
              tick?: { value?: number | string };
              index: number;
            }) => {
              const xScale = ctx.chart.scales?.x;
              const visibleMin = Number.isFinite(xScale?.min)
                ? Number(xScale?.min)
                : 0;
              const visibleMax = Number.isFinite(xScale?.max)
                ? Number(xScale?.max)
                : Math.max(0, householdWeatherHourly.length - 1);
              const visibleHours = Math.max(
                1,
                Math.round(visibleMax - visibleMin + 1),
              );
              const density = getWeatherXAxisDensity(visibleHours);
              const tickIndex = resolveChartTickIndex(
                ctx.tick?.value,
                ctx.index,
              );
              const normalized = Math.max(0, tickIndex);
              const row =
                householdWeatherHourly[
                  Math.min(householdWeatherHourly.length - 1, normalized)
                ];
              if (row) {
                const isMidnightByRawTime = /T00:00(?::00)?$/.test(row.time);
                const date = new Date(row.time);
                const isMidnightByParsedTime =
                  !Number.isNaN(date.getTime()) && date.getHours() === 0;
                if (isMidnightByRawTime || isMidnightByParsedTime) return 1.8;
              }
              if (normalized % density.majorGridEvery === 0) return 1.1;
              if (normalized % density.minorGridEvery === 0) return 0.7;
              return 0.35;
            },
          },
        },
        y: {
          position: "left" as const,
          min: primaryAxisRange.min,
          max: primaryAxisRange.max,
          ticks: {
            display: !isMobile,
            color: "rgb(100 116 139)",
            callback: (value: number | string) => `${value}°C / kmh`,
          },
          grid: {
            color: "rgba(148, 163, 184, 0.2)",
          },
        },
        yPrecip: {
          display: false,
          position: "right" as const,
          min: 0,
          max: precipitationAxisMax,
          ticks: {
            display: false,
            color: "rgb(100 116 139)",
            callback: (value: number | string) => `${value} mm`,
          },
          grid: {
            display: false,
            drawOnChartArea: false,
          },
        },
        ySnow: {
          display: false,
          position: "right" as const,
          min: 0,
          max: snowfallAxisMax,
          ticks: {
            display: false,
          },
          grid: {
            display: false,
            drawOnChartArea: false,
          },
        },
        yCloud: {
          display: false,
          position: "right" as const,
          min: 0,
          max: 100,
          grid: {
            display: false,
            drawOnChartArea: false,
          },
          ticks: {
            display: false,
          },
        },
        yUv: {
          display: false,
          position: "right" as const,
          min: 0,
          max: uvAxisMax,
          grid: {
            display: false,
            drawOnChartArea: false,
          },
          ticks: {
            display: false,
          },
        },
        ySky: {
          position: "right" as const,
          min: 0,
          max: 1,
          display: false,
          grid: {
            display: false,
            drawOnChartArea: false,
          },
          ticks: {
            display: false,
          },
        },
      },
    };
    const plugins = options.plugins as Record<string, unknown>;
    plugins.zoom = {
      pan: {
        enabled: true,
        mode: "x",
        scaleMode: "x",
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true,
        },
        drag: {
          enabled: true,
          backgroundColor: "rgba(59, 130, 246, 0.12)",
        },
        mode: "x",
        scaleMode: "x",
      },
      limits: {
        x: { min: 0, max: Math.max(0, householdWeatherHourly.length - 1) },
        y: { min: primaryAxisRange.min, max: primaryAxisRange.max },
        yPrecip: { min: 0, max: precipitationAxisMax },
        ySnow: { min: 0, max: snowfallAxisMax },
        yCloud: { min: 0, max: 100 },
        yUv: { min: 0, max: uvAxisMax },
        ySky: { min: 0, max: 1 },
      },
    };

    return options;
  }, [householdWeatherHourly, isMobile, language, t]);

  const chartData = useMemo(() => {
    const dailyAstronomy = new Map<
      string,
      {
        sunrise: Date | null;
        sunset: Date | null;
        moonPhase: number;
        moonIllumination: number;
      }
    >();

    weather.days.forEach((day) => {
      const dayDate = new Date(`${day.date}T12:00:00`);
      const moonPhase = Number.isNaN(dayDate.getTime())
        ? 0
        : getMoonPhaseFraction(dayDate);
      dailyAstronomy.set(day.date, {
        sunrise: day.sunrise ? new Date(day.sunrise) : null,
        sunset: day.sunset ? new Date(day.sunset) : null,
        moonPhase,
        moonIllumination: getMoonIllumination(moonPhase),
      });
    });

    const labels = householdWeatherHourly.map((entry, index) => {
      const date = new Date(entry.time);
      if (Number.isNaN(date.getTime())) return `${index + 1}`;
      const day = date.toLocaleDateString(language, {
        day: "2-digit",
        month: "2-digit",
      });
      const hour = date.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${day} ${hour}`;
    });

    if (weather.state === "needsAddress") {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("home.householdWeatherNeedsAddress")}
        </p>
      );
    }
    if (weather.state === "loading") {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("home.householdWeatherLoading")}
        </p>
      );
    }
    if (weather.state === "error") {
      return (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          {t("home.householdWeatherError")}
        </p>
      );
    }
    if (weather.state === "empty") {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("home.householdWeatherEmpty")}
        </p>
      );
    }

    const sunTrack: Array<number | null> = [];
    const moonTrack: Array<number | null> = [];
    const moonPhaseTrack: number[] = [];
    const moonPointRadius: number[] = new Array(
      householdWeatherHourly.length,
    ).fill(0);
    const moonPointStyle: Array<string | HTMLCanvasElement> = new Array(
      householdWeatherHourly.length,
    ).fill("circle");
    const moonPointHoverRadius: number[] = new Array(
      householdWeatherHourly.length,
    ).fill(0);
    const moonPeakByDay = new Map<
      string,
      { index: number; distance: number }
    >();

    householdWeatherHourly.forEach((entry, index) => {
      const current = new Date(entry.time);
      if (Number.isNaN(current.getTime())) {
        sunTrack.push(null);
        moonTrack.push(null);
        moonPhaseTrack.push(0);
        return;
      }

      const dateKey = getDateKeyFromIsoDateTime(entry.time);
      const dayAstronomy = dailyAstronomy.get(dateKey);
      const sunrise = dayAstronomy?.sunrise;
      const sunset = dayAstronomy?.sunset;
      const hourMs = 60 * 60 * 1000;

      let sunValue: number | null = null;
      if (sunrise && sunset && current >= sunrise && current <= sunset) {
        const msSinceSunrise = current.getTime() - sunrise.getTime();
        const msUntilSunset = sunset.getTime() - current.getTime();
        if (msSinceSunrise < hourMs || msUntilSunset < hourMs) {
          // Force clear endpoints at sunrise/sunset on hourly data.
          sunValue = 0;
        } else {
          const dayDurationMs = sunset.getTime() - sunrise.getTime();
          if (dayDurationMs > 0) {
            const progress =
              (current.getTime() - sunrise.getTime()) / dayDurationMs;
            sunValue = Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
          }
        }
      }
      sunTrack.push(sunValue);

      const prevKey = addDaysToDateKey(dateKey, -1);
      const nextKey = addDaysToDateKey(dateKey, 1);
      const prevAstronomy = dailyAstronomy.get(prevKey);
      const nextAstronomy = dailyAstronomy.get(nextKey);

      let nightStart: Date | null = null;
      let nightEnd: Date | null = null;
      let moonPhase = dayAstronomy?.moonPhase ?? getMoonPhaseFraction(current);
      let moonIllumination =
        dayAstronomy?.moonIllumination ?? getMoonIllumination(moonPhase);

      if (sunrise && current < sunrise && prevAstronomy?.sunset) {
        nightStart = prevAstronomy.sunset;
        nightEnd = sunrise;
        moonPhase = prevAstronomy.moonPhase;
        moonIllumination = prevAstronomy.moonIllumination;
      } else if (sunset && current >= sunset && nextAstronomy?.sunrise) {
        nightStart = sunset;
        nightEnd = nextAstronomy.sunrise;
      }

      if (!nightStart || !nightEnd) {
        moonTrack.push(null);
        moonPhaseTrack.push(moonPhase);
        return;
      }

      const nightDurationMs = nightEnd.getTime() - nightStart.getTime();
      if (nightDurationMs <= 0) {
        moonTrack.push(null);
        moonPhaseTrack.push(moonPhase);
        return;
      }

      const progress =
        (current.getTime() - nightStart.getTime()) / nightDurationMs;
      const clamped = Math.min(1, Math.max(0, progress));
      const msSinceNightStart = current.getTime() - nightStart.getTime();
      const msUntilNightEnd = nightEnd.getTime() - current.getTime();
      const moonHeight =
        msSinceNightStart < hourMs || msUntilNightEnd < hourMs
          ? 0
          : Math.sin(Math.PI * clamped) * (0.55 + moonIllumination * 0.45);
      moonTrack.push(moonHeight);
      moonPhaseTrack.push(moonPhase);

      const peakDistance = Math.abs(clamped - 0.5);
      const existingPeak = moonPeakByDay.get(dateKey);
      if (!existingPeak || peakDistance < existingPeak.distance) {
        moonPeakByDay.set(dateKey, { index, distance: peakDistance });
      }
    });

    moonPeakByDay.forEach(({ index }) => {
      const phase = moonPhaseTrack[index] ?? 0;
      const emoji = getMoonPhaseEmoji(phase);
      moonPointRadius[index] = 5;
      moonPointHoverRadius[index] = 7;
      moonPointStyle[index] = getMoonPhasePointStyle(emoji);
    });

    return {
      labels,
      datasets: [
        {
          type: "line" as const,
          label: t("home.householdWeatherChartTemp"),
          data: householdWeatherHourly.map((entry) => entry.tempC),
          yAxisID: "y",
          borderColor: "rgba(234, 88, 12, 0.95)",
          backgroundColor: "rgba(234, 88, 12, 0.22)",
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
          tension: 0.3,
        },
        {
          type: "line" as const,
          label: t("home.householdWeatherChartApparentTemp"),
          data: householdWeatherHourly.map((entry) => entry.apparentTempC),
          yAxisID: "y",
          hidden: true,
          borderColor: "rgba(251, 146, 60, 0.82)",
          backgroundColor: "rgba(251, 146, 60, 0.2)",
          pointRadius: 0,
          pointHoverRadius: 2,
          borderWidth: 1.8,
          borderDash: [5, 4],
          tension: 0.3,
        },
        {
          type: "bar" as const,
          label: t("home.householdWeatherChartCloudCover"),
          hidden: true,
          data: householdWeatherHourly.map((entry) => {
            if (
              typeof entry.cloudCoverPercent !== "number" ||
              !Number.isFinite(entry.cloudCoverPercent)
            )
              return null;
            return 100 - Math.min(100, Math.max(0, entry.cloudCoverPercent));
          }),
          yAxisID: "yCloud",
          base: 100,
          backgroundColor: householdWeatherHourly.map((entry) => {
            const cover = Math.min(
              100,
              Math.max(0, entry.cloudCoverPercent ?? 0),
            );
            const alpha = 0.08 + (cover / 100) * 0.26;
            return `rgba(148, 163, 184, ${alpha})`;
          }),
          borderWidth: 0,
          barPercentage: 1,
          categoryPercentage: 1,
        },
        ...(hasPrecipitationInForecast
          ? [
              {
                type: "bar" as const,
                label: t("home.householdWeatherChartPrecip"),
                data: householdWeatherHourly.map(
                  (entry) => entry.precipitationMm,
                ),
                yAxisID: "yPrecip",
                backgroundColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarColor(
                    entry.precipitationProbabilityPercent,
                  ),
                ),
                borderColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarBorderColor(
                    entry.precipitationProbabilityPercent,
                  ),
                ),
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1,
              },
            ]
          : []),
        ...(hasSnowfallInForecast
          ? [
              {
                type: "bar" as const,
                label: t("home.householdWeatherChartSnowfall"),
                data: householdWeatherHourly.map((entry) => entry.snowfallCm),
                yAxisID: "ySnow",
                backgroundColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarColor(
                    entry.precipitationProbabilityPercent,
                  ),
                ),
                borderColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarBorderColor(
                    entry.precipitationProbabilityPercent,
                  ),
                ),
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1,
              },
            ]
          : []),
        {
          type: "line" as const,
          label: t("home.householdWeatherChartWind"),
          data: householdWeatherHourly.map((entry) => entry.windSpeedKmh),
          yAxisID: "y",
          borderColor: "rgba(16, 185, 129, 0.92)",
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          type: "line" as const,
          label: t("home.householdWeatherChartUvIndex"),
          data: householdWeatherHourly.map((entry) => entry.uvIndex),
          yAxisID: "yUv",
          hidden: true,
          borderColor: "rgba(236, 72, 153, 0.88)",
          backgroundColor: "rgba(236, 72, 153, 0.18)",
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
          tension: 0.3,
        },
        {
          type: "line" as const,
          label: "Sonnenverlauf",
          data: sunTrack,
          yAxisID: "ySky",
          hidden: true,
          borderColor: "rgba(250, 204, 21, 0.9)",
          backgroundColor: "rgba(250, 204, 21, 0.18)",
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          fill: "origin" as const,
          tension: 0.35,
        },
        {
          type: "line" as const,
          label: "Mondstand",
          data: moonTrack,
          yAxisID: "ySky",
          hidden: true,
          borderColor: "rgba(167, 139, 250, 0.88)",
          backgroundColor: "rgba(167, 139, 250, 0.15)",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: moonPointRadius,
          pointHoverRadius: moonPointHoverRadius,
          pointStyle: moonPointStyle,
        },
      ],
    };
  }, [
    hasPrecipitationInForecast,
    hasSnowfallInForecast,
    householdWeatherHourly,weather.state,weather.days,
    language,
    t,
  ]);
  return (
    <HouseholdWeatherPlot
      hint={t("home.householdWeatherChartHint")}
      isMobile={isMobile}
      legendButtonLabel={t("home.householdWeatherLegendButton")}
      legendItems={legendItems}
      onToggleLegendItem={toggleWeatherLegendDataset}
    >
      <div
        ref={weatherChartContainerRef}
        className="h-64 overflow-hidden rounded-lg border border-slate-200/90 bg-white/80 dark:border-slate-700/90 dark:bg-slate-900/70"
        onDoubleClick={zoomOutWeatherChart}
        onTouchEndCapture={onWeatherChartTouchEndCapture}
      >
        <ChartJS
          ref={weatherChartRef as never}
          type="bar"
          data={chartData as never}
          options={chartOptions as never}
        />
      </div>
    </HouseholdWeatherPlot>
  );
};

export const WeatherPanelContent = ({
  dayLimit,
  getWindDirectionLabel,
  isMobile
}: {
  dayLimit?: number;
  getWindDirectionLabel: (degrees: number | null) => string;
  isMobile?: boolean;
}) => {
  const {t}=useTranslation()
  const weather = useWeather();
  if (!weather.mapHasPin) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("home.householdWeatherNeedsAddress")}
      </p>
    );
  }
  if (weather.isLoading) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("home.householdWeatherLoading")}
      </p>
    );
  }
  if (weather.isError) {
    return (
      <p className="text-xs text-rose-600 dark:text-rose-400">
        {t("home.householdWeatherError")}
      </p>
    );
  }
  if (weather.hourly.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("home.householdWeatherEmpty")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <WeatherDailyForecast
        dayLimit={dayLimit}
        getWindDirectionLabel={getWindDirectionLabel}
      />
      <WeatherForecastGraph isMobile={isMobile} />
    </div>
  );
};




export const StaticWeatherCalendarIcon = ({date}:{date:string}) => {
  const weather = useWeather();
  const day = weather.byDay.get(date) ?? null;

  const code = day?.weatherCode;
  const wind = day?.windSpeedKmh ?? 0;
  const iconClassName = "h-3.5 w-3.5";
  if (wind >= 45 && (code === 0 || code === 1 || code === 2 || code === 3)) {
    return (
      <Wind className={`${iconClassName} text-teal-600 dark:text-teal-300`} />
    );
  }
  if (code == null) return null;
  if (code === 0)
    return (
      <Sun className={`${iconClassName} text-amber-500 dark:text-amber-300`} />
    );
  if (code === 1 || code === 2)
    return (
      <CloudSun
        className={`${iconClassName} text-amber-500 dark:text-amber-300`}
      />
    );
  if (code === 3)
    return (
      <Cloud
        className={`${iconClassName} text-slate-500 dark:text-slate-300`}
      />
    );
  if (code === 45 || code === 48)
    return (
      <CloudFog
        className={`${iconClassName} text-slate-500 dark:text-slate-300`}
      />
    );
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return (
      <CloudRain
        className={`${iconClassName} text-sky-600 dark:text-sky-300`}
      />
    );
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return (
      <CloudSnow
        className={`${iconClassName} text-cyan-600 dark:text-cyan-300`}
      />
    );
  }
  if (code >= 95 && code <= 99) {
    return (
      <CloudLightning
        className={`${iconClassName} text-violet-600 dark:text-violet-300`}
      />
    );
  }
  return null;
};