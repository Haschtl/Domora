import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type TouchEvent as ReactTouchEvent
} from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import "hammerjs";
import "@geoman-io/leaflet-geoman-free";
import "leaflet.locatecontrol";
import "iso8601-js-period";
import "leaflet-timedimension/dist/leaflet.timedimension.min.js";
import "leaflet-timedimension/dist/leaflet.timedimension.control.min.css";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import {
  CalendarCheck2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  GripVertical,
  CircleDot,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudLightning,
  Flame,
  House,
  Loader2,
  Map as MapIcon,
  Mountain,
  LocateFixed,
  Maximize2,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Route,
  Ruler,
  Satellite,
  Search,
  SlidersHorizontal,
  Sun,
  ShoppingCart,
  Snowflake,
  Trash2,
  Wallet,
  Wind,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import {
  type JsxComponentDescriptor,
  type JsxEditorProps,
  type MDXEditorMethods,
  useLexicalNodeRemove
} from "@mdxeditor/editor";
import { Circle, MapContainer, Marker, Polyline, Popup, Rectangle, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents } from "react-leaflet";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import { formatDateOnly, formatDateTime, formatShortDay, getLastMonthRange } from "../../lib/date";
import { suggestCategoryLabel } from "../../lib/category-heuristics";
import {
  getHouseholdLiveLocations,
  getHouseholdReachability,
  getHouseholdRoute,
  getNearbyPois,
  type ReachabilityGeoJson,
  type ReachabilityTravelMode,
  type RouteGeoJson,
  startHouseholdLiveLocationShare,
  stopHouseholdLiveLocationShare,
  updateHouseholdLiveLocationShare
} from "../../lib/api";
import { createMemberLabelGetter } from "../../lib/member-label";
import { createDiceBearAvatarDataUri, getMemberAvatarSeed } from "../../lib/avatar";
import { calculateBalancesByMember } from "../../lib/finance-math";
import { getMemberOfMonth } from "../../lib/task-leaderboard";
import { isMemberOnVacation } from "../../lib/vacation-utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { MemberAvatar } from "../../components/member-avatar";
const ExcalidrawBoardLazy = lazy(() =>
  import("../../components/excalidraw-board").then((module) => ({ default: module.ExcalidrawBoard }))
);
import { ErrorBoundary } from "../../components/error-boundary";
import type {
  BucketItem,
  CashAuditRequest,
  FinanceEntry,
  HouseholdEvent,
  HouseholdLiveLocation,
  Household,
  HouseholdMember,
  HouseholdMemberVacation,
  NearbyPoi,
  PoiCategory,
  HouseholdMapMarker,
  HouseholdMapMarkerIcon,
  UpdateHouseholdInput,
  TaskCompletion,
  TaskItem
} from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { MultiDateCalendarSelect } from "../../components/ui/multi-date-calendar-select";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Chart } from "react-chartjs-2";
import { WeatherSvg, type WeatherState } from "weather-icons-animated";
import { buildMonthGrid, dayKey, startOfMonth } from "../../features/tasks-calendar";
import {
  HouseholdCalendarWidget,
  HouseholdMapWidget,
  HouseholdWeatherDailyPreview,
  HouseholdWeatherPlot,
  HouseholdWhiteboardWidget
} from "../../features/components/home-widgets";
import { queryKeys } from "../../lib/query-keys";
import { supabase } from "../../lib/supabase";
import {   
  LANDING_WIDGET_KEYS,
  type LandingWidgetKey,
  canEditLandingByRole,
  getEffectiveLandingMarkdown,
  getSavedLandingMarkdown
 } from "../../features/home-landing.utils";

const MXEditorLazy = lazy(() =>
  import("../../components/mx-editor").then((module) => ({ default: module.MXEditor }))
);


interface HomePageProps {
  section?: "summary" | "bucket" | "feed";
  household: Household;
  households: Household[];
  currentMember: HouseholdMember | null;
  userId: string;
  members: HouseholdMember[];
  bucketItems: BucketItem[];
  tasks: TaskItem[];
  taskCompletions: TaskCompletion[];
  financeEntries: FinanceEntry[];
  cashAuditRequests: CashAuditRequest[];
  memberVacations: HouseholdMemberVacation[];
  householdEvents: HouseholdEvent[];
  eventsHasMore?: boolean;
  eventsLoadingMore?: boolean;
  onLoadMoreEvents?: () => void;
  whiteboardSceneJson: string;
  userLabel: string | undefined | null;
  busy: boolean;
  mobileTabBarVisible?: boolean;
  onSelectHousehold: (householdId: string) => void;
  onSaveLandingMarkdown: (markdown: string) => Promise<void>;
  onSaveWhiteboard: (sceneJson: string) => Promise<void>;
  onUpdateHousehold: (input: UpdateHouseholdInput) => Promise<void>;
  onAddBucketItem: (input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => Promise<void>;
  onToggleBucketItem: (item: BucketItem) => Promise<void>;
  onUpdateBucketItem: (item: BucketItem, input: { title: string; descriptionMarkdown: string; suggestedDates: string[] }) => Promise<void>;
  onDeleteBucketItem: (item: BucketItem) => Promise<void>;
  onToggleBucketDateVote: (item: BucketItem, suggestedDate: string, voted: boolean) => Promise<void>;
  onCompleteTask: (task: TaskItem) => Promise<void>;
}

type LandingContentSegment = { type: "markdown"; content: string } | { type: "widget"; key: LandingWidgetKey };
type HomeCalendarBucketVote = {
  item: BucketItem;
  date: string;
  voters: string[];
};
type HomeCalendarShoppingEntry = {
  id: string;
  title: string;
  userId: string | null;
  at: string;
};
type HomeCalendarVacationEntry = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  note: string | null;
  manual?: boolean;
};
type HomeCalendarVacationSpan = HomeCalendarVacationEntry & {
  kind: "single" | "start" | "middle" | "end";
};
type HomeCalendarDueTask = {
  task: TaskItem;
  status: "overdue" | "due" | "upcoming";
};
type HomeCalendarEntry = {
  cleaningDueTasks: HomeCalendarDueTask[];
  taskCompletions: TaskCompletion[];
  financeEntries: FinanceEntry[];
  bucketVotes: HomeCalendarBucketVote[];
  shoppingEntries: HomeCalendarShoppingEntry[];
  cashAudits: CashAuditRequest[];
  vacations: HomeCalendarVacationEntry[];
};
type MapStyleId = "street" | "nature" | "satellite" | "light" | "dark";
type MapStyleOption = {
  id: MapStyleId;
  labelKey: string;
  tileUrl: string;
  attribution: string;
  subdomains?: string;
  maxZoom?: number;
};
type MapWeatherLayerToggles = {
  radar: boolean;
  warnings: boolean;
  lightning: boolean;
};
type ManualMarkerFilterMode = "all" | "mine" | "member" | "none";
type MapMeasureMode = "distance" | "area";
type MapMeasureResult = {
  mode: MapMeasureMode;
  distanceMeters?: number;
  areaSqm?: number;
  anchor?: [number, number];
};
type MapReachabilityMode = ReachabilityTravelMode;
type MapSearchViewportBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
type MapSearchResult = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  bounds: MapSearchViewportBounds | null;
};
type MapSearchZoomRequest = {
  token: number;
  lat: number;
  lon: number;
  bounds: MapSearchViewportBounds | null;
};
type HouseholdWeatherDay = {
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
type HouseholdWeatherHourlyPoint = {
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

const LANDING_WIDGET_COMPONENTS: Array<{ key: LandingWidgetKey; tag: string }> = [
  { key: "tasks-overview", tag: "LandingWidgetTasksOverview" },
  { key: "tasks-for-you", tag: "LandingWidgetTasksForYou" },
  { key: "your-balance", tag: "LandingWidgetYourBalance" },
  { key: "household-balance", tag: "LandingWidgetHouseholdBalance" },
  { key: "recent-activity", tag: "LandingWidgetRecentActivity" },
  { key: "bucket-short-list", tag: "LandingWidgetBucketShortList" },
  { key: "member-of-month", tag: "LandingWidgetMemberOfMonth" },
  { key: "fairness-score", tag: "LandingWidgetFairnessScore" },
  { key: "reliability-score", tag: "LandingWidgetReliabilityScore" },
  { key: "expenses-by-month", tag: "LandingWidgetExpensesByMonth" },
  { key: "fairness-by-member", tag: "LandingWidgetFairnessByMember" },
  { key: "reliability-by-member", tag: "LandingWidgetReliabilityByMember" },
  { key: "household-calendar", tag: "LandingWidgetHouseholdCalendar" },
  { key: "household-weather-daily", tag: "LandingWidgetHouseholdWeatherDaily" },
  { key: "household-weather-plot", tag: "LandingWidgetHouseholdWeatherPlot" },
  { key: "household-weather", tag: "LandingWidgetHouseholdWeather" },
  { key: "household-whiteboard", tag: "LandingWidgetHouseholdWhiteboard" },
  { key: "household-map", tag: "LandingWidgetHouseholdMap" }
];

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ChartTooltip,
  Legend,
  Filler,
  zoomPlugin
);

const MAX_WHITEBOARD_BYTES = 10 * 1024 * 1024;
const MAX_CALENDAR_TOOLTIP_ITEMS = 4;
const DEFAULT_MAP_CENTER: [number, number] = [51.1657, 10.4515];
const MAP_ZOOM_WITH_ADDRESS = 16;
const MAP_ZOOM_WITH_ADDRESS_FALLBACK = 14;
const MAP_ZOOM_DEFAULT = 5;
const MIN_ADDRESS_LENGTH_FOR_GEOCODE = 5;
const ADDRESS_GEOCODE_DEBOUNCE_MS = 650;
const POI_RADIUS_METERS = 1500;
const POI_CATEGORY_OPTIONS: Array<{ id: PoiCategory; labelKey: string; emoji: string }> = [
  { id: "restaurant", labelKey: "home.householdMapPoiRestaurants", emoji: "🍽️" },
  { id: "shop", labelKey: "home.householdMapPoiShops", emoji: "🛍️" },
  { id: "supermarket", labelKey: "home.householdMapPoiSupermarkets", emoji: "🛒" },
  { id: "fuel", labelKey: "home.householdMapPoiFuel", emoji: "⛽" }
];
const MANUAL_MARKER_ICON_OPTIONS: Array<{ id: HouseholdMapMarkerIcon; labelKey: string }> = [
  { id: "home", labelKey: "home.householdMapMarkerIconHome" },
  { id: "shopping", labelKey: "home.householdMapMarkerIconShopping" },
  { id: "restaurant", labelKey: "home.householdMapMarkerIconRestaurant" },
  { id: "fuel", labelKey: "home.householdMapMarkerIconFuel" },
  { id: "hospital", labelKey: "home.householdMapMarkerIconHospital" },
  { id: "park", labelKey: "home.householdMapMarkerIconPark" },
  { id: "work", labelKey: "home.householdMapMarkerIconWork" },
  { id: "star", labelKey: "home.householdMapMarkerIconStar" },
  { id: "school", labelKey: "home.householdMapMarkerIconSchool" },
  { id: "cafe", labelKey: "home.householdMapMarkerIconCafe" },
  { id: "bar", labelKey: "home.householdMapMarkerIconBar" },
  { id: "pharmacy", labelKey: "home.householdMapMarkerIconPharmacy" },
  { id: "gym", labelKey: "home.householdMapMarkerIconGym" },
  { id: "parking", labelKey: "home.householdMapMarkerIconParking" },
  { id: "transit", labelKey: "home.householdMapMarkerIconTransit" }
];
const LIVE_LOCATION_DURATION_OPTIONS = [5, 15, 30, 60] as const;
const REACHABILITY_MINUTES_DEFAULT = 20;
const ROUTE_MAX_MINUTES_DEFAULT = 45;
const REACHABILITY_OPTIONS: Array<{ id: MapReachabilityMode; labelKey: string }> = [
  { id: "walk", labelKey: "home.householdMapReachabilityModeWalk" },
  { id: "bike", labelKey: "home.householdMapReachabilityModeBike" },
  { id: "car", labelKey: "home.householdMapReachabilityModeCar" },
  { id: "transit", labelKey: "home.householdMapReachabilityModeTransit" }
];
const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    id: "street",
    labelKey: "home.householdMapStyleStreet",
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: "abc",
    maxZoom: 19
  },
  {
    id: "nature",
    labelKey: "home.householdMapStyleNature",
    tileUrl: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    subdomains: "abc",
    maxZoom: 17
  },
  {
    id: "satellite",
    labelKey: "home.householdMapStyleSatellite",
    tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a>',
    maxZoom: 18
  },
  {
    id: "light",
    labelKey: "home.householdMapStyleLight",
    tileUrl: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20
  },
  {
    id: "dark",
    labelKey: "home.householdMapStyleDark",
    tileUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20
  }
];
const widgetTokenFromKey = (key: LandingWidgetKey) => `{{widget:${key}}}`;

let leafletMarkerConfigured = false;
const ensureLeafletMarkerIcon = () => {
  if (leafletMarkerConfigured) return;
  leafletMarkerConfigured = true;
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2xUrl,
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl
  });
};

type DomoraLeafletLayer = L.Layer & {
  _domoraMeta?: HouseholdMapMarker;
  _domoraMeasure?: boolean;
};

type LocateControlHandle = L.Control & {
  start: () => void;
  stop: () => void;
};

type MapWithPm = L.Map & {
  pm?: {
    addControls: (options: Record<string, unknown>) => void;
    removeControls: () => void;
    setGlobalOptions: (options: Record<string, unknown>) => void;
    enableDraw: (shape: "Line" | "Polygon", options?: Record<string, unknown>) => void;
    disableDraw: () => void;
  };
};

const toLinearLatLngs = (latLngs: L.LatLng[] | L.LatLng[][]) =>
  Array.isArray(latLngs[0]) ? (latLngs as L.LatLng[][]).flat() : (latLngs as L.LatLng[]);

const calculatePolylineDistanceMeters = (map: L.Map, points: L.LatLng[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (!prev || !next) continue;
    total += map.distance(prev, next);
  }
  return total;
};

const calculatePolygonAreaSqm = (points: L.LatLng[]) => {
  const earthRadius = 6378137;
  if (points.length < 3) return 0;
  let area = 0;
  const radians = Math.PI / 180;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (!p1 || !p2) continue;
    area += (p2.lng - p1.lng) * radians * (2 + Math.sin(p1.lat * radians) + Math.sin(p2.lat * radians));
  }
  return Math.abs((area * earthRadius * earthRadius) / 2);
};

const toFixedCoordinate = (value: number) => Number(value.toFixed(6));
const toFixedRadius = (value: number) => Number(value.toFixed(2));
const createMarkerId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `marker:${crypto.randomUUID()}`;
  }
  return `marker:${Date.now()}:${Math.floor(Math.random() * 100_000)}`;
};

const serializeHouseholdLayer = (
  layer: DomoraLeafletLayer,
  userId: string,
  defaultTitle: string
): HouseholdMapMarker | null => {
  const nowIso = new Date().toISOString();
  const existing = layer._domoraMeta;
  const base = {
    id: existing?.id ?? createMarkerId(),
    icon: existing?.icon ?? ("star" as HouseholdMapMarkerIcon),
    title: existing?.title?.trim() || defaultTitle,
    description: existing?.description ?? "",
    image_b64: existing?.image_b64 ?? null,
    poi_ref: existing?.poi_ref ?? null,
    created_by: existing?.created_by ?? userId,
    created_at: existing?.created_at ?? nowIso,
    last_edited_by: userId,
    last_edited_at: nowIso
  };

  if (layer instanceof L.Marker) {
    const latLng = layer.getLatLng();
    return {
      ...base,
      type: "point",
      lat: toFixedCoordinate(latLng.lat),
      lon: toFixedCoordinate(latLng.lng)
    };
  }

  if (layer instanceof L.Circle) {
    const center = layer.getLatLng();
    return {
      ...base,
      type: "circle",
      center: {
        lat: toFixedCoordinate(center.lat),
        lon: toFixedCoordinate(center.lng)
      },
      radius_meters: toFixedRadius(layer.getRadius())
    };
  }

  if (layer instanceof L.Rectangle) {
    const bounds = layer.getBounds();
    return {
      ...base,
      type: "rectangle",
      bounds: {
        south: toFixedCoordinate(bounds.getSouth()),
        west: toFixedCoordinate(bounds.getWest()),
        north: toFixedCoordinate(bounds.getNorth()),
        east: toFixedCoordinate(bounds.getEast())
      }
    };
  }

  if (layer instanceof L.Polyline) {
    const latLngs = layer.getLatLngs();
    const linearLatLngs = toLinearLatLngs(latLngs as L.LatLng[] | L.LatLng[][]);
    const points = linearLatLngs
      .map((entry) => {
        const latLng = entry as L.LatLng;
        return {
          lat: toFixedCoordinate(latLng.lat),
          lon: toFixedCoordinate(latLng.lng)
        };
      })
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

    if (points.length < 2) return null;
    return {
      ...base,
      type: "vector",
      points
    };
  }

  return null;
};

const GeomanEditorBridge = ({
  enabled,
  suppressCreate,
  userId,
  defaultTitle,
  onMarkersChange
}: {
  enabled: boolean;
  suppressCreate: boolean;
  userId: string;
  defaultTitle: string;
  onMarkersChange: (markers: HouseholdMapMarker[]) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const mapWithPm = map as MapWithPm;
    if (!mapWithPm.pm) return;

    mapWithPm.pm.setGlobalOptions({
      continueDrawing: false,
      snapDistance: 20,
      pinning: true
    });
    mapWithPm.pm.addControls({
      position: "topleft",
      oneBlock: false,
      drawMarker: true,
      drawPolyline: true,
      drawCircle: true,
      drawRectangle: true,
      drawPolygon: false,
      drawCircleMarker: false,
      drawText: false,
      drawCut: false,
      editMode: true,
      dragMode: true,
      removalMode: true,
      rotateMode: false
    });

    const emitMarkers = () => {
      const nextMarkers: HouseholdMapMarker[] = [];
      map.eachLayer((layer) => {
        const domoraLayer = layer as DomoraLeafletLayer;
        if (!domoraLayer._domoraMeta) return;
        const serialized = serializeHouseholdLayer(domoraLayer, userId, defaultTitle);
        if (serialized) nextMarkers.push(serialized);
      });
      onMarkersChange(nextMarkers);
    };

    const handleCreate = (event: { layer?: L.Layer }) => {
      if (suppressCreate) return;
      const createdLayer = event.layer as DomoraLeafletLayer | undefined;
      if (!createdLayer) return;
      if (createdLayer._domoraMeasure) return;
      if (!createdLayer._domoraMeta) {
        const nowIso = new Date().toISOString();
        createdLayer._domoraMeta = {
          id: createMarkerId(),
          type: "point",
          icon: "star",
          title: defaultTitle,
          description: "",
          image_b64: null,
          poi_ref: null,
          created_by: userId,
          created_at: nowIso,
          last_edited_by: userId,
          last_edited_at: nowIso,
          lat: 0,
          lon: 0
        };
      }
      if (createdLayer instanceof L.Marker) {
        const markerLayer = createdLayer as DomoraLeafletLayer & L.Marker;
        markerLayer.setIcon(getManualMarkerIcon(markerLayer._domoraMeta?.icon ?? "star"));
      }
      emitMarkers();
    };

    map.on("pm:create", handleCreate as L.LeafletEventHandlerFn);
    map.on("pm:edit", emitMarkers as L.LeafletEventHandlerFn);
    map.on("pm:dragend", emitMarkers as L.LeafletEventHandlerFn);
    map.on("pm:remove", emitMarkers as L.LeafletEventHandlerFn);
    map.on("pm:cut", emitMarkers as L.LeafletEventHandlerFn);

    return () => {
      map.off("pm:create", handleCreate as L.LeafletEventHandlerFn);
      map.off("pm:edit", emitMarkers as L.LeafletEventHandlerFn);
      map.off("pm:dragend", emitMarkers as L.LeafletEventHandlerFn);
      map.off("pm:remove", emitMarkers as L.LeafletEventHandlerFn);
      map.off("pm:cut", emitMarkers as L.LeafletEventHandlerFn);
      mapWithPm.pm?.removeControls();
    };
  }, [defaultTitle, enabled, map, onMarkersChange, suppressCreate, userId]);

  return null;
};

const LocateControlBridge = ({
  enabled,
  onReady,
  onLocationFound,
  onLocationError
}: {
  enabled: boolean;
  onReady: (control: LocateControlHandle | null) => void;
  onLocationFound: (lat: number, lon: number) => void;
  onLocationError: () => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!enabled) {
      onReady(null);
      return;
    }

    const factory = (L.control as unknown as {
      locate?: (options?: Record<string, unknown>) => LocateControlHandle;
    }).locate;
    if (!factory) {
      onReady(null);
      return;
    }

    const control = factory({
      position: "topleft",
      flyTo: true,
      showCompass: true,
      setView: "untilPanOrZoom",
      keepCurrentZoomLevel: false,
      initialZoomLevel: MAP_ZOOM_WITH_ADDRESS,
      cacheLocation: true,
      clickBehavior: {
        inView: "stop",
        inViewNotFollowing: "inView",
        outOfView: "setView",
      },
      strings: {
        title: "Standort ermitteln",
      },
      locateOptions: {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    });

    control.addTo(map);
    onReady(control);

    const handleLocationFound = (event: { latitude?: number; longitude?: number; latlng?: L.LatLng }) => {
      const lat = event.latlng?.lat ?? event.latitude;
      const lon = event.latlng?.lng ?? event.longitude;
      const resolvedLat = typeof lat === "number" ? lat : Number.NaN;
      const resolvedLon = typeof lon === "number" ? lon : Number.NaN;
      if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLon)) {
        onLocationError();
        return;
      }
      onLocationFound(resolvedLat, resolvedLon);
    };

    const handleLocationError = () => {
      onLocationError();
    };

    map.on("locationfound", handleLocationFound as L.LeafletEventHandlerFn);
    map.on("locationerror", handleLocationError as L.LeafletEventHandlerFn);

    return () => {
      map.off("locationfound", handleLocationFound as L.LeafletEventHandlerFn);
      map.off("locationerror", handleLocationError as L.LeafletEventHandlerFn);
      onReady(null);
      control.remove();
    };
  }, [enabled, map, onLocationError, onLocationFound, onReady]);

  return null;
};

const GeomanMeasureBridge = ({
  enabled,
  mode,
  clearToken,
  onModeChange,
  onMeasured
}: {
  enabled: boolean;
  mode: MapMeasureMode | null;
  clearToken: number;
  onModeChange: (nextMode: MapMeasureMode | null) => void;
  onMeasured: (result: MapMeasureResult) => void;
}) => {
  const map = useMap();
  const latestModeRef = useRef<MapMeasureMode | null>(mode);
  const lastLayerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    latestModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!enabled) return;
    if (!lastLayerRef.current) return;
    map.removeLayer(lastLayerRef.current);
    lastLayerRef.current = null;
  }, [clearToken, enabled, map]);

  useEffect(() => {
    const mapWithPm = map as MapWithPm;
    if (!enabled || !mapWithPm.pm || !mode) {
      mapWithPm.pm?.disableDraw();
      return;
    }

    mapWithPm.pm.enableDraw(mode === "distance" ? "Line" : "Polygon", {
      continueDrawing: false,
      finishOn: "dblclick",
      templineStyle: { color: "#0f766e", dashArray: [5, 5] },
      hintlineStyle: { color: "#14b8a6", dashArray: [5, 5] },
      pathOptions: { color: "#0f766e", weight: 4, fillOpacity: 0.18 }
    });

    return () => {
      mapWithPm.pm?.disableDraw();
    };
  }, [enabled, map, mode]);

  useEffect(() => {
    if (!enabled) return;

    const handleCreate = (event: { layer?: L.Layer }) => {
      const currentMode = latestModeRef.current;
      if (!currentMode) return;
      const createdLayer = event.layer as DomoraLeafletLayer | undefined;
      if (!createdLayer) return;
      createdLayer._domoraMeasure = true;

      if (lastLayerRef.current) {
        map.removeLayer(lastLayerRef.current);
      }
      lastLayerRef.current = createdLayer;

      if (currentMode === "distance" && createdLayer instanceof L.Polyline) {
        const points = toLinearLatLngs(createdLayer.getLatLngs() as L.LatLng[] | L.LatLng[][]);
        const lastPoint = points.length > 0 ? points[points.length - 1] : undefined;
        onMeasured({
          mode: "distance",
          distanceMeters: calculatePolylineDistanceMeters(map, points),
          anchor: lastPoint ? [lastPoint.lat, lastPoint.lng] : undefined
        });
      }

      if (currentMode === "area" && createdLayer instanceof L.Polygon) {
        const polygonLatLngs = createdLayer.getLatLngs();
        const firstRing = Array.isArray(polygonLatLngs[0]) ? (polygonLatLngs[0] as L.LatLng[]) : [];
        let anchorLatLng: L.LatLng | undefined;
        if (firstRing.length > 0) {
          const last = firstRing.length > 0 ? firstRing[firstRing.length - 1] : undefined;
          const first = firstRing[0];
          if (last && first && firstRing.length > 1 && last.lat === first.lat && last.lng === first.lng) {
            anchorLatLng = firstRing[firstRing.length - 2] ?? last;
          } else {
            anchorLatLng = last;
          }
        }
        onMeasured({
          mode: "area",
          areaSqm: calculatePolygonAreaSqm(firstRing),
          anchor: anchorLatLng ? [anchorLatLng.lat, anchorLatLng.lng] : undefined
        });
      }

      onModeChange(null);
    };

    map.on("pm:create", handleCreate as L.LeafletEventHandlerFn);
    return () => {
      map.off("pm:create", handleCreate as L.LeafletEventHandlerFn);
      if (!enabled && lastLayerRef.current) {
        map.removeLayer(lastLayerRef.current);
        lastLayerRef.current = null;
      }
    };
  }, [enabled, map, onMeasured, onModeChange]);

  return null;
};

const AddressMapView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: false });
  }, [center, map]);
  return null;
};

const RecenterMapOnRequest = ({
  center,
  zoom,
  requestToken
}: {
  center: [number, number];
  zoom: number;
  requestToken: number;
}) => {
  const map = useMap();
  useEffect(() => {
    if (requestToken <= 0) return;
    map.setView(center, zoom, { animate: true });
  }, [center, map, requestToken, zoom]);
  return null;
};

const FullscreenMapViewportBridge = ({
  enabled,
  onBoundsChange
}: {
  enabled: boolean;
  onBoundsChange: (bounds: MapSearchViewportBounds) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const emit = () => {
      const bounds = map.getBounds();
      onBoundsChange({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      });
    };

    emit();
    map.on("moveend", emit);
    map.on("zoomend", emit);

    return () => {
      map.off("moveend", emit);
      map.off("zoomend", emit);
    };
  }, [enabled, map, onBoundsChange]);

  return null;
};

const MapSearchZoomBridge = ({
  request
}: {
  request: MapSearchZoomRequest | null;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!request) return;
    if (request.bounds) {
      map.fitBounds(
        [
          [request.bounds.south, request.bounds.west],
          [request.bounds.north, request.bounds.east]
        ],
        { animate: true, padding: [40, 40] }
      );
      return;
    }
    map.setView([request.lat, request.lon], Math.max(map.getZoom(), 17), { animate: true });
  }, [map, request]);

  return null;
};

const ReachabilityLayerBridge = ({
  geojson,
  color
}: {
  geojson: ReachabilityGeoJson | null;
  color: string;
}) => {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!geojson) return;
    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: () => ({
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.22
      }),
      interactive: false
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (!layerRef.current) return;
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [color, geojson, map]);

  return null;
};

const ReachabilityFitBoundsBridge = ({
  geojson,
  requestToken
}: {
  geojson: ReachabilityGeoJson | null;
  requestToken: number;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!geojson) return;
    if (requestToken <= 0) return;
    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { animate: true, padding: [40, 40] });
    }
  }, [geojson, map, requestToken]);

  return null;
};

const RouteLayerBridge = ({
  geojson,
  color
}: {
  geojson: RouteGeoJson | null;
  color: string;
}) => {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const infoMarkerRef = useRef<L.Marker | null>(null);

  const getRouteDisplayInfo = (value: RouteGeoJson) => {
    let travelTimeSeconds: number | null = null;
    let lengthMeters: number | null = null;
    let anchor: [number, number] | null = null;
    let fallbackCoords: Array<[number, number]> = [];

    for (const feature of value.features) {
      if (feature.geometry.type === "LineString") {
        const coords = feature.geometry.coordinates as number[][];
        const normalized = coords
          .map((pair) => [Number(pair[0]), Number(pair[1])] as [number, number])
          .filter(([lon, lat]) => Number.isFinite(lat) && Number.isFinite(lon));
        if (normalized.length >= 2) {
          fallbackCoords = normalized;
          if (!anchor) {
            const midIndex = Math.floor(normalized.length / 2);
            const mid = normalized[midIndex]!;
            anchor = [mid[1], mid[0]];
          }
        }
      }
      const properties = feature.properties as { travelTime?: unknown; length?: unknown } | undefined;
      if (travelTimeSeconds === null && properties && Number.isFinite(Number(properties.travelTime))) {
        travelTimeSeconds = Number(properties.travelTime);
      }
      if (lengthMeters === null && properties && Number.isFinite(Number(properties.length))) {
        lengthMeters = Number(properties.length);
      }
    }

    if (lengthMeters === null && fallbackCoords.length >= 2) {
      let sum = 0;
      for (let index = 1; index < fallbackCoords.length; index += 1) {
        const prev = fallbackCoords[index - 1]!;
        const next = fallbackCoords[index]!;
        sum += L.latLng(prev[1], prev[0]).distanceTo(L.latLng(next[1], next[0]));
      }
      lengthMeters = sum;
    }

    if (!anchor) return null;

    const durationLabel =
      travelTimeSeconds !== null
        ? travelTimeSeconds >= 3600
          ? `${(travelTimeSeconds / 3600).toFixed(1)} h`
          : `${Math.max(1, Math.round(travelTimeSeconds / 60))} min`
        : null;
    const distanceLabel =
      lengthMeters !== null
        ? lengthMeters >= 1000
          ? `${(lengthMeters / 1000).toFixed(1)} km`
          : `${Math.round(lengthMeters)} m`
        : null;
    const label = [durationLabel, distanceLabel].filter((entry): entry is string => Boolean(entry)).join(" · ");
    if (!label) return null;

    return { anchor, label };
  };

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (infoMarkerRef.current) {
      map.removeLayer(infoMarkerRef.current);
      infoMarkerRef.current = null;
    }
    if (!geojson) return;
    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: () => ({
        color,
        weight: 4,
        opacity: 0.95
      }),
      interactive: false
    });
    layer.addTo(map);
    layerRef.current = layer;

    const routeInfo = getRouteDisplayInfo(geojson);
    if (routeInfo) {
      const marker = L.marker(routeInfo.anchor, {
        interactive: false,
        icon: L.divIcon({
          className: "domora-route-inline-info-icon",
          html: `<div class="domora-route-inline-info">${routeInfo.label}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      });
      marker.addTo(map);
      infoMarkerRef.current = marker;
    }

    return () => {
      if (!layerRef.current) return;
      map.removeLayer(layerRef.current);
      layerRef.current = null;
      if (infoMarkerRef.current) {
        map.removeLayer(infoMarkerRef.current);
        infoMarkerRef.current = null;
      }
    };
  }, [color, geojson, map]);

  return null;
};

const RouteFitBoundsBridge = ({
  geojson,
  requestToken
}: {
  geojson: RouteGeoJson | null;
  requestToken: number;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!geojson) return;
    if (requestToken <= 0) return;
    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { animate: true, padding: [40, 40] });
    }
  }, [geojson, map, requestToken]);

  return null;
};

const RouteTargetPickBridge = ({
  enabled,
  onPick
}: {
  enabled: boolean;
  onPick: (lat: number, lon: number) => void;
}) => {
  const map = useMapEvents({
    click: (event) => {
      if (!enabled) return;
      onPick(event.latlng.lat, event.latlng.lng);
    }
  });

  useEffect(() => {
    const container = map.getContainer();
    if (enabled) {
      container.style.cursor = "crosshair";
    } else if (container.style.cursor === "crosshair") {
      container.style.cursor = "";
    }
    return () => {
      if (container.style.cursor === "crosshair") {
        container.style.cursor = "";
      }
    };
  }, [enabled, map]);

  return null;
};

const MapOverlayDismissBridge = ({
  enabled,
  onDismiss
}: {
  enabled: boolean;
  onDismiss: () => void;
}) => {
  useMapEvents({
    click: () => {
      if (!enabled) return;
      onDismiss();
    }
  });

  return null;
};

const DwdTimeDimensionBridge = ({
  enabled,
  layers
}: {
  enabled: boolean;
  layers: MapWeatherLayerToggles;
}) => {
  const map = useMap();
  const controlRef = useRef<L.Control | null>(null);
  const timeDimensionRef = useRef<unknown>(null);
  const radarLayerRef = useRef<L.Layer | null>(null);
  const lightningLayerRef = useRef<L.Layer | null>(null);
  const warningLayerRef = useRef<L.Layer | null>(null);
  const speedButtonHandlerRef = useRef<((event: Event) => void) | null>(null);
  const speedSyncHandlerRef = useRef<(() => void) | null>(null);

  const cleanupCustomTimeControls = () => {
    const control = controlRef.current as (L.Control & { _container?: HTMLElement; _player?: L.Evented }) | null;
    const container = control?._container;
    if (container) {
      const speedButton = container.querySelector(".domora-timecontrol-speedcycle");
      if (speedButton && speedButtonHandlerRef.current) {
        speedButton.removeEventListener("click", speedButtonHandlerRef.current);
      }
      container.classList.remove("domora-timecontrol-custom");
    }
    if (control?._player && speedSyncHandlerRef.current) {
      control._player.off("speedchange", speedSyncHandlerRef.current as L.LeafletEventHandlerFn);
    }
    speedButtonHandlerRef.current = null;
    speedSyncHandlerRef.current = null;
  };

  const applyCustomTimeControls = () => {
    const control = controlRef.current as (L.Control & {
      _container?: HTMLElement;
      _player?: L.Evented & { getTransitionTime?: () => number; setTransitionTime?: (transitionTime: number) => void };
      _getDisplayDateFormat?: (date: Date) => string;
      _update?: () => void;
    }) | null;
    const container = control?._container;
    if (!container) return;

    cleanupCustomTimeControls();

    if (control?._getDisplayDateFormat) {
      control._getDisplayDateFormat = (date: Date) =>
        new Intl.DateTimeFormat("de-DE", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }).format(date);
      control._update?.();
    }

    const playButton = container.querySelector("a.timecontrol-play");
    const dateLabel = container.querySelector("a.timecontrol-date");
    const dateSlider = container.querySelector(".timecontrol-dateslider");
    const loopButton = container.querySelector("a.timecontrol-loop");
    const backwardButton = container.querySelector("a.timecontrol-backward");
    const forwardButton = container.querySelector("a.timecontrol-forward");
    const speedSlider = container.querySelector(".timecontrol-speed");

    if (backwardButton instanceof HTMLElement) {
      backwardButton.style.display = "none";
    }
    if (forwardButton instanceof HTMLElement) {
      forwardButton.style.display = "none";
    }
    if (speedSlider instanceof HTMLElement) {
      speedSlider.style.display = "none";
    }

    const left = (container.querySelector(".domora-time-left") as HTMLElement | null)
      ?? L.DomUtil.create("div", "domora-time-left");
    const center = (container.querySelector(".domora-time-center") as HTMLElement | null)
      ?? L.DomUtil.create("div", "domora-time-center");
    const right = (container.querySelector(".domora-time-right") as HTMLElement | null)
      ?? L.DomUtil.create("div", "domora-time-right");

    if (left.parentElement !== container) container.appendChild(left);
    if (center.parentElement !== container) container.appendChild(center);
    if (right.parentElement !== container) container.appendChild(right);

    if (playButton) left.appendChild(playButton);
    if (dateLabel) center.appendChild(dateLabel);
    if (dateSlider) center.appendChild(dateSlider);

    const speedButton =
      right.querySelector(".domora-timecontrol-speedcycle")
      ?? (() => {
        const button = L.DomUtil.create("a", "leaflet-control-timecontrol domora-timecontrol-speedcycle", right) as HTMLAnchorElement;
        button.href = "#";
        button.setAttribute("role", "button");
        button.title = "Playback speed";
        return button;
      })();

    const supportedSpeeds = [0.1, 0.5, 1, 2, 5, 10];
    const player = control?._player;

    const setSpeedLabel = () => {
      const transitionTime = player?.getTransitionTime?.() ?? 1000;
      const currentSpeed = Math.max(0.05, 1000 / Math.max(transitionTime, 1));
      const nearest = supportedSpeeds.reduce((best, candidate) =>
        Math.abs(candidate - currentSpeed) < Math.abs(best - currentSpeed) ? candidate : best
      );
      speedButton.textContent = `x${nearest}`;
    };

    const onSpeedButtonClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const transitionTime = player?.getTransitionTime?.() ?? 1000;
      const currentSpeed = Math.max(0.05, 1000 / Math.max(transitionTime, 1));
      const nearestIndex = supportedSpeeds.reduce(
        (bestIndex, candidate, index) =>
          Math.abs(candidate - currentSpeed) < Math.abs(supportedSpeeds[bestIndex] - currentSpeed)
            ? index
            : bestIndex,
        0
      );
      const nextSpeed = supportedSpeeds[(nearestIndex + 1) % supportedSpeeds.length] ?? 1;
      player?.setTransitionTime?.(Math.round(1000 / nextSpeed));
      setSpeedLabel();
    };

    speedButton.addEventListener("click", onSpeedButtonClick);
    speedButtonHandlerRef.current = onSpeedButtonClick;

    const syncSpeedLabel = () => setSpeedLabel();
    player?.on("speedchange", syncSpeedLabel as L.LeafletEventHandlerFn);
    speedSyncHandlerRef.current = syncSpeedLabel;
    setSpeedLabel();

    if (loopButton) right.appendChild(loopButton);

    container.classList.add("domora-timecontrol-custom");
  };

  useEffect(() => {
    const hasTimeControlledLayer = layers.radar || layers.lightning;

    const clearLayers = () => {
      if (radarLayerRef.current) {
        map.removeLayer(radarLayerRef.current);
        radarLayerRef.current = null;
      }
      if (lightningLayerRef.current) {
        map.removeLayer(lightningLayerRef.current);
        lightningLayerRef.current = null;
      }
      if (warningLayerRef.current) {
        map.removeLayer(warningLayerRef.current);
        warningLayerRef.current = null;
      }
      if (controlRef.current) {
        cleanupCustomTimeControls();
        controlRef.current.remove();
        controlRef.current = null;
      }
    };

    if (!enabled) {
      clearLayers();
      return () => undefined;
    }

    const leafletWithTd = L as typeof L & {
      TimeDimension?: new (options?: Record<string, unknown>) => unknown;
      Control?: typeof L.Control & {
        TimeDimension?: new (options?: Record<string, unknown>) => L.Control;
      };
      timeDimension?: {
        layer?: {
          wms?: (layer: L.TileLayer.WMS, options?: Record<string, unknown>) => L.Layer;
        };
      };
    };

    if (!leafletWithTd.TimeDimension || !leafletWithTd.timeDimension?.layer?.wms) {
      return () => undefined;
    }

    if (!timeDimensionRef.current) {
      timeDimensionRef.current = new leafletWithTd.TimeDimension({
        currentTime: Date.now(),
        period: "PT5M"
      });
    }

    if (leafletWithTd.Control?.TimeDimension && hasTimeControlledLayer && !controlRef.current) {
      const control = new leafletWithTd.Control.TimeDimension({
        position: "bottomleft",
        timeDimension: timeDimensionRef.current,
        autoPlay: false,
        backwardButton: false,
        forwardButton: false,
        loopButton: true,
        speedSlider: false,
        timeSliderDragUpdate: true,
        playerOptions: {
          transitionTime: 400,
          loop: false,
          startOver: true
        }
      });
      control.addTo(map);
      controlRef.current = control;
      applyCustomTimeControls();
    }
    if (!hasTimeControlledLayer && controlRef.current) {
      cleanupCustomTimeControls();
      controlRef.current.remove();
      controlRef.current = null;
    }

    const dwdWmsUrl = "https://maps.dwd.de/geoserver/ows";

    if (layers.radar && !radarLayerRef.current) {
      const radarWms = L.tileLayer.wms(dwdWmsUrl, {
        layers: "dwd:Radar_wn-product_1x1km_ger",
        styles: "radar_wn-product_1x1km_ger",
        format: "image/png",
        transparent: true,
        opacity: 0.92,
        pane: "overlayPane",
        version: "1.3.0",
        attribution: "Deutscher Wetterdienst (DWD)"
      });
      const radarTd = leafletWithTd.timeDimension.layer.wms(radarWms, {
        timeDimension: timeDimensionRef.current,
        updateTimeDimension: true,
        setDefaultTime: true,
        cacheBackward: 3,
        cacheForward: 24
      });
      radarTd.addTo(map);
      radarLayerRef.current = radarTd;
    }
    if (!layers.radar && radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
      radarLayerRef.current = null;
    }

    if (layers.lightning && !lightningLayerRef.current) {
      const lightningWms = L.tileLayer.wms(dwdWmsUrl, {
        layers: "dwd:Blitzdichte",
        styles: "blitzdichte",
        format: "image/png",
        transparent: true,
        opacity: 0.9,
        pane: "overlayPane",
        version: "1.3.0",
        attribution: "Deutscher Wetterdienst (DWD)"
      });
      const lightningTd = leafletWithTd.timeDimension.layer.wms(lightningWms, {
        timeDimension: timeDimensionRef.current,
        updateTimeDimension: true,
        setDefaultTime: true,
        cacheBackward: 2,
        cacheForward: 12
      });
      lightningTd.addTo(map);
      lightningLayerRef.current = lightningTd;
    }
    if (!layers.lightning && lightningLayerRef.current) {
      map.removeLayer(lightningLayerRef.current);
      lightningLayerRef.current = null;
    }

    if (layers.warnings && !warningLayerRef.current) {
      const warnings = L.tileLayer.wms(dwdWmsUrl, {
        layers: "dwd:Warngebiete_Gemeinden",
        styles: "warngebiete_gemeinden_env",
        format: "image/png",
        transparent: true,
        opacity: 0.72,
        pane: "overlayPane",
        version: "1.3.0",
        attribution: "Deutscher Wetterdienst (DWD)"
      });
      warnings.addTo(map);
      warningLayerRef.current = warnings;
    }
    if (!layers.warnings && warningLayerRef.current) {
      map.removeLayer(warningLayerRef.current);
      warningLayerRef.current = null;
    }

    return () => {
      if (radarLayerRef.current) {
        map.removeLayer(radarLayerRef.current);
        radarLayerRef.current = null;
      }
      if (lightningLayerRef.current) {
        map.removeLayer(lightningLayerRef.current);
        lightningLayerRef.current = null;
      }
      if (warningLayerRef.current) {
        map.removeLayer(warningLayerRef.current);
        warningLayerRef.current = null;
      }
      if (controlRef.current) {
        cleanupCustomTimeControls();
        controlRef.current.remove();
        controlRef.current = null;
      }
    };
  }, [enabled, layers.lightning, layers.radar, layers.warnings, map]);

  return null;
};

const getMarkerEmoji = (icon: HouseholdMapMarkerIcon) => {
  switch (icon) {
    case "home":
      return "🏠";
    case "shopping":
      return "🛒";
    case "restaurant":
      return "🍽️";
    case "fuel":
      return "⛽";
    case "hospital":
      return "🏥";
    case "park":
      return "🌳";
    case "work":
      return "💼";
    case "star":
      return "⭐";
    case "school":
      return "🏫";
    case "cafe":
      return "☕";
    case "bar":
      return "🍸";
    case "pharmacy":
      return "💊";
    case "gym":
      return "🏋️";
    case "parking":
      return "🅿️";
    case "transit":
      return "🚉";
    default:
      return "📍";
  }
};

const markerDivIconCache = new Map<string, L.DivIcon>();
const getManualMarkerIcon = (icon: HouseholdMapMarkerIcon) => {
  const cached = markerDivIconCache.get(icon);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-marker-icon",
    html: `<div style="position:relative;width:34px;height:44px;display:flex;align-items:flex-start;justify-content:center"><div style="background:#0f766e;border:2px solid #fff;color:#fff;width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.35)">${getMarkerEmoji(icon)}</div><div style="position:absolute;top:27px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:13px solid #0f766e;filter:drop-shadow(0 2px 4px rgba(0,0,0,.28))"></div></div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40]
  });
  markerDivIconCache.set(icon, divIcon);
  return divIcon;
};

const escapeHtmlAttr = (value: string) => value.replace(/"/g, "&quot;");
const liveLocationUserIconCache = new Map<string, L.DivIcon>();
const getLiveLocationUserIcon = (avatarUrl: string) => {
  const cacheKey = avatarUrl;
  const cached = liveLocationUserIconCache.get(cacheKey);
  if (cached) return cached;
  const safeAvatar = escapeHtmlAttr(avatarUrl);
  const divIcon = L.divIcon({
    className: "domora-map-live-user-icon",
    html: `<div style="position:relative;width:34px;height:34px;border-radius:999px;overflow:hidden;border:2px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,.38);background:#0f172a"><img src="${safeAvatar}" alt="" style="width:100%;height:100%;object-fit:cover" /><span style="position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:999px;background:#22c55e;border:2px solid #fff"></span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32]
  });
  liveLocationUserIconCache.set(cacheKey, divIcon);
  return divIcon;
};

const getHouseholdMarkerCenter = (marker: HouseholdMapMarker): [number, number] | null => {
  switch (marker.type) {
    case "point":
      return [marker.lat, marker.lon];
    case "vector":
      return marker.points.length > 0 ? [marker.points[0]!.lat, marker.points[0]!.lon] : null;
    case "circle":
      return [marker.center.lat, marker.center.lon];
    case "rectangle":
      return [
        (marker.bounds.south + marker.bounds.north) / 2,
        (marker.bounds.west + marker.bounds.east) / 2
      ];
    default:
      return null;
  }
};

const poiDivIconCache = new Map<string, L.DivIcon>();
const getPoiEmoji = (category: PoiCategory) => {
  switch (category) {
    case "restaurant":
      return "🍽️";
    case "shop":
      return "🛍️";
    case "supermarket":
      return "🛒";
    case "fuel":
      return "⛽";
    default:
      return "📍";
  }
};

const getMarkerIconFromPoiCategory = (category: PoiCategory): HouseholdMapMarkerIcon => {
  switch (category) {
    case "restaurant":
      return "restaurant";
    case "fuel":
      return "fuel";
    case "shop":
    case "supermarket":
      return "shopping";
    default:
      return "star";
  }
};

const getPoiMarkerIcon = (category: PoiCategory) => {
  const cached = poiDivIconCache.get(category);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-poi-icon",
    html: `<div style="background:#1e293b;border:2px solid #fff;color:#fff;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 7px rgba(0,0,0,.28)">${getPoiEmoji(category)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -23]
  });
  poiDivIconCache.set(category, divIcon);
  return divIcon;
};

const searchDivIconCache = new Map<string, L.DivIcon>();
const getSearchResultMarkerIcon = () => {
  const cacheKey = "default";
  const cached = searchDivIconCache.get(cacheKey);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-search-icon",
    html: '<div style="background:#1d4ed8;border:2px solid #fff;color:#fff;width:22px;height:22px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,.28)">🔎</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20]
  });
  searchDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};

const routePointDivIconCache = new Map<string, L.DivIcon>();
const getRoutePointMarkerIcon = (color: string) => {
  const cacheKey = color;
  const cached = routePointDivIconCache.get(cacheKey);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-route-point-icon",
    html: `<div style="position:relative;width:28px;height:36px;display:flex;align-items:flex-start;justify-content:center"><div style="background:${color};border:2px solid #fff;width:24px;height:24px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.33)"></div><div style="position:absolute;top:21px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:11px solid ${color};filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))"></div></div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32]
  });
  routePointDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};

const mapMeasureAnchorIcon = L.divIcon({
  className: "domora-measure-anchor-icon",
  html: "",
  iconSize: [1, 1],
  iconAnchor: [0, 0]
});

const getMapStyleIcon = (styleId: MapStyleId) => {
  switch (styleId) {
    case "street":
      return <MapIcon className="h-4 w-4" />;
    case "nature":
      return <Mountain className="h-4 w-4" />;
    case "satellite":
      return <Satellite className="h-4 w-4" />;
    case "light":
      return <Sun className="h-4 w-4" />;
    case "dark":
      return <Moon className="h-4 w-4" />;
    default:
      return <MapIcon className="h-4 w-4" />;
  }
};

const getAnimatedWeatherState = (day: HouseholdWeatherDay): WeatherState => {
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

const getWeatherConditionLabelKey = (day: HouseholdWeatherDay) => {
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

const getWindDirectionLabel = (degrees: number | null) => {
  if (typeof degrees !== "number" || !Number.isFinite(degrees)) return "—";
  const normalized = ((degrees % 360) + 360) % 360;
  const labels = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const index = Math.round(normalized / 45) % 8;
  return labels[index] ?? "—";
};

const getDailyWeatherWarnings = (day: HouseholdWeatherDay) => {
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

const getStaticWeatherCalendarIcon = (day: HouseholdWeatherDay) => {
  const code = day.weatherCode;
  const wind = day.windSpeedKmh ?? 0;
  const iconClassName = "h-3.5 w-3.5";
  if (wind >= 45 && (code === 0 || code === 1 || code === 2 || code === 3)) {
    return <Wind className={`${iconClassName} text-teal-600 dark:text-teal-300`} />;
  }
  if (code === null) return null;
  if (code === 0) return <Sun className={`${iconClassName} text-amber-500 dark:text-amber-300`} />;
  if (code === 1 || code === 2) return <CloudSun className={`${iconClassName} text-amber-500 dark:text-amber-300`} />;
  if (code === 3) return <Cloud className={`${iconClassName} text-slate-500 dark:text-slate-300`} />;
  if (code === 45 || code === 48) return <CloudFog className={`${iconClassName} text-slate-500 dark:text-slate-300`} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className={`${iconClassName} text-sky-600 dark:text-sky-300`} />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow className={`${iconClassName} text-cyan-600 dark:text-cyan-300`} />;
  }
  if (code >= 95 && code <= 99) {
    return <CloudLightning className={`${iconClassName} text-violet-600 dark:text-violet-300`} />;
  }
  return null;
};

const moonEmojiCanvasCache = new Map<string, HTMLCanvasElement>();

const getDateKeyFromIsoDateTime = (value: string) => value.slice(0, 10);

const addDaysToDateKey = (dateKey: string, days: number) => {
  const source = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(source.getTime())) return dateKey;
  source.setDate(source.getDate() + days);
  const year = source.getFullYear();
  const month = `${source.getMonth() + 1}`.padStart(2, "0");
  const day = `${source.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMoonPhaseFraction = (date: Date) => {
  const synodicMonthDays = 29.530588853;
  const referenceNewMoonUtcMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSinceReference = (date.getTime() - referenceNewMoonUtcMs) / (1000 * 60 * 60 * 24);
  const cycle = daysSinceReference / synodicMonthDays;
  const normalized = cycle - Math.floor(cycle);
  return normalized < 0 ? normalized + 1 : normalized;
};

const getMoonIllumination = (phase: number) => 0.5 * (1 - Math.cos(2 * Math.PI * phase));

const getMoonPhaseEmoji = (phase: number) => {
  if (phase < 0.0625 || phase >= 0.9375) return "🌑";
  if (phase < 0.1875) return "🌒";
  if (phase < 0.3125) return "🌓";
  if (phase < 0.4375) return "🌔";
  if (phase < 0.5625) return "🌕";
  if (phase < 0.6875) return "🌖";
  if (phase < 0.8125) return "🌗";
  return "🌘";
};

const getMoonPhaseLabel = (phase: number) => {
  if (phase < 0.0625 || phase >= 0.9375) return "Neumond";
  if (phase < 0.1875) return "Zunehmende Sichel";
  if (phase < 0.3125) return "Erstes Viertel";
  if (phase < 0.4375) return "Zunehmender Mond";
  if (phase < 0.5625) return "Vollmond";
  if (phase < 0.6875) return "Abnehmender Mond";
  if (phase < 0.8125) return "Letztes Viertel";
  return "Abnehmende Sichel";
};

const getMoonPhasePointStyle = (emoji: string) => {
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

const resolveChartTickIndex = (tickValue: unknown, fallbackIndex: number) => {
  if (typeof tickValue === "number" && Number.isFinite(tickValue)) {
    return Math.round(tickValue);
  }
  const parsed = Number(tickValue);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed);
  }
  return fallbackIndex;
};

const getWeatherXAxisDensity = (visibleHours: number) => {
  if (visibleHours <= 30) {
    return { labelEvery: 1, minorGridEvery: 1, majorGridEvery: 6 };
  }
  if (visibleHours <= 60) {
    return { labelEvery: 2, minorGridEvery: 2, majorGridEvery: 6 };
  }
  if (visibleHours <= 96) {
    return { labelEvery: 4, minorGridEvery: 4, majorGridEvery: 12 };
  }
  if (visibleHours <= 144) {
    return { labelEvery: 6, minorGridEvery: 6, majorGridEvery: 24 };
  }
  return { labelEvery: 12, minorGridEvery: 12, majorGridEvery: 24 };
};

const getPrecipitationBarColor = (precipProbabilityPercent: number | null) => {
  const probability = Math.min(100, Math.max(0, precipProbabilityPercent ?? 0));
  const t = probability / 100;
  const lightness = 78 - t * 34; // 78% -> 44%
  const saturation = 68 + t * 20; // 68% -> 88%
  const alpha = 0.28 + t * 0.56; // 0.28 -> 0.84
  return `hsla(210, ${saturation}%, ${lightness}%, ${alpha})`;
};

const getPrecipitationBarBorderColor = (precipProbabilityPercent: number | null) => {
  const probability = Math.min(100, Math.max(0, precipProbabilityPercent ?? 0));
  const t = probability / 100;
  const lightness = 58 - t * 20; // 58% -> 38%
  const saturation = 70 + t * 18; // 70% -> 88%
  const alpha = 0.45 + t * 0.45; // 0.45 -> 0.9
  return `hsla(214, ${saturation}%, ${lightness}%, ${alpha})`;
};

const getPrecipitationAxisMax = (values: Array<number | null>) => {
  const maxValue = values.reduce<number>((max, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);

  // 12 mm/h is already heavy rain, so this gives useful headroom without
  // compressing normal household forecasts too much.
  const baselineMax = 12;
  const target = Math.max(maxValue, baselineMax);

  if (target <= 12) return 12;
  if (target <= 25) return Math.ceil(target / 2) * 2;
  if (target <= 50) return Math.ceil(target / 5) * 5;
  if (target <= 100) return Math.ceil(target / 10) * 10;
  return Math.ceil(target / 25) * 25;
};

const getUvAxisMax = (values: Array<number | null>) => {
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

const getWeatherPrimaryAxisRange = (points: HouseholdWeatherHourlyPoint[]) => {
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

const convertLandingTokensToEditorJsx = (markdown: string) => {
  const segments = splitLandingContentSegments(markdown);
  let widgetOrder = 0;
  return segments
    .map((segment) => {
      if (segment.type === "markdown") {
        return segment.content;
      }
      const component = LANDING_WIDGET_COMPONENTS.find((entry) => entry.key === segment.key);
      if (!component) {
        return widgetTokenFromKey(segment.key);
      }
      const jsx = `<${component.tag} domoraWidgetOrder="${widgetOrder}" />`;
      widgetOrder += 1;
      return jsx;
    })
    .join("");
};

const convertEditorJsxToLandingTokens = (markdown: string) => {
  let next = markdown;
  LANDING_WIDGET_COMPONENTS.forEach(({ key, tag }) => {
    const selfClosingPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?\\s*/>`, "g");
    const wrappedPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>\\s*</${tag}>`, "g");
    next = next.replace(selfClosingPattern, widgetTokenFromKey(key));
    next = next.replace(wrappedPattern, widgetTokenFromKey(key));
  });
  return next;
};

const splitLandingContentSegments = (markdown: string): LandingContentSegment[] => {
  const segments: LandingContentSegment[] = [];
  const widgetTokenPattern = /\{\{\s*widget:([a-z-]+)\s*\}\}/g;
  let lastIndex = 0;

  for (const match of markdown.matchAll(widgetTokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "markdown", content: markdown.slice(lastIndex, index) });
    }

    const key = match[1];
    if ((LANDING_WIDGET_KEYS as readonly string[]).includes(key)) {
      segments.push({ type: "widget", key: key as LandingWidgetKey });
    } else {
      segments.push({ type: "markdown", content: match[0] });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: "markdown", content: markdown.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "markdown", content: markdown });
  }

  return segments;
};

const getWidgetOrderFromMdastNode = (mdastNode: JsxEditorProps["mdastNode"]): number | null => {
  const attributes = Array.isArray(mdastNode.attributes) ? mdastNode.attributes : [];
  for (const attribute of attributes) {
    if (!attribute || typeof attribute !== "object") continue;
    const candidate = attribute as { type?: string; name?: string; value?: unknown };
    if (candidate.type !== "mdxJsxAttribute" || candidate.name !== "domoraWidgetOrder") continue;
    if (typeof candidate.value !== "string" && typeof candidate.value !== "number") continue;
    const parsed = Number.parseInt(String(candidate.value), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

const moveWidgetInMarkdown = (markdown: string, fromWidgetIndex: number, toWidgetIndex: number) => {
  if (fromWidgetIndex === toWidgetIndex) {
    return markdown;
  }

  const segments = splitLandingContentSegments(markdown);
  const widgetSegmentIndexes: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.type === "widget") {
      widgetSegmentIndexes.push(index);
    }
  });

  const fromSegmentIndex = widgetSegmentIndexes[fromWidgetIndex];
  const toSegmentIndex = widgetSegmentIndexes[toWidgetIndex];
  if (fromSegmentIndex === undefined || toSegmentIndex === undefined) {
    return markdown;
  }

  const nextSegments = [...segments];
  const [moved] = nextSegments.splice(fromSegmentIndex, 1);
  if (!moved) {
    return markdown;
  }
  const targetInsertionIndex = toSegmentIndex - (fromSegmentIndex < toSegmentIndex ? 1 : 0);
  nextSegments.splice(targetInsertionIndex, 0, moved);

  return nextSegments
    .map((segment) => (segment.type === "markdown" ? segment.content : widgetTokenFromKey(segment.key)))
    .join("");
};

const insertTextAroundWidget = (
  markdown: string,
  widgetIndex: number,
  position: "before" | "after",
  placeholder: string
) => {
  const segments = splitLandingContentSegments(markdown);
  const widgetSegmentIndexes: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.type === "widget") {
      widgetSegmentIndexes.push(index);
    }
  });

  const widgetSegmentIndex = widgetSegmentIndexes[widgetIndex];
  if (widgetSegmentIndex === undefined) {
    return markdown;
  }

  const insertAt = position === "before" ? widgetSegmentIndex : widgetSegmentIndex + 1;
  const textContent = `\n\n${placeholder}\n\n`;
  segments.splice(insertAt, 0, { type: "markdown", content: textContent });

  return segments
    .map((segment) => (segment.type === "markdown" ? segment.content : widgetTokenFromKey(segment.key)))
    .join("");
};

const LandingWidgetEditorShell = ({
  children,
  onRemove,
  onMove,
  onInsertTextBefore,
  onInsertTextAfter,
  dragHandleLabel,
  insertTextBeforeLabel,
  insertTextAfterLabel,
  widgetIndex
}: {
  children: React.ReactNode;
  onRemove: () => void;
  onMove: (sourceWidgetIndex: number, targetWidgetIndex: number) => void;
  onInsertTextBefore: () => void;
  onInsertTextAfter: () => void;
  dragHandleLabel: string;
  insertTextBeforeLabel: string;
  insertTextAfterLabel: string;
  widgetIndex: number;
}) => (
  <div className="not-prose my-2">
    <div
      className="relative"
      data-widget-index={widgetIndex}
      draggable
      contentEditable={false}
      onDragStart={(event) => {
        const sourceWidgetIndex = Number.parseInt(event.currentTarget.dataset.widgetIndex ?? "", 10);
        if (!Number.isFinite(sourceWidgetIndex)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/domora-widget-index", String(sourceWidgetIndex));
        event.dataTransfer.setData("text/plain", String(sourceWidgetIndex));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceWidgetIndex = Number.parseInt(
          event.dataTransfer.getData("text/domora-widget-index") || event.dataTransfer.getData("text/plain"),
          10
        );
        const targetWidgetIndex = Number.parseInt(event.currentTarget.dataset.widgetIndex ?? "", 10);
        if (!Number.isFinite(sourceWidgetIndex) || !Number.isFinite(targetWidgetIndex)) {
          return;
        }
        onMove(sourceWidgetIndex, targetWidgetIndex);
      }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-2 z-[2100] inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 active:cursor-grabbing dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label={dragHandleLabel}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{dragHandleLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-10 z-[2100] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInsertTextBefore();
              }}
              aria-label={insertTextBeforeLabel}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{insertTextBeforeLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-[4.25rem] z-[2100] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInsertTextAfter();
              }}
              aria-label={insertTextAfterLabel}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{insertTextAfterLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute right-2 top-2 z-[2100] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
              aria-label="Widget entfernen"
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Widget entfernen</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  </div>
);

export const HomePage = ({
  section = "summary",
  household,
  households,
  currentMember,
  userId,
  members,
  bucketItems,
  tasks,
  taskCompletions,
  financeEntries,
  cashAuditRequests,
  memberVacations,
  householdEvents,
  eventsHasMore = false,
  eventsLoadingMore = false,
  onLoadMoreEvents,
  whiteboardSceneJson,
  userLabel,
  busy,
  mobileTabBarVisible = true,
  onSelectHousehold,
  onSaveLandingMarkdown,
  onSaveWhiteboard,
  onUpdateHousehold,
  onAddBucketItem,
  onToggleBucketItem,
  onUpdateBucketItem,
  onDeleteBucketItem,
  onToggleBucketDateVote,
  onCompleteTask
}: HomePageProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const featureFlags = useMemo(
    () => ({
      bucket: household.feature_bucket_enabled ?? true,
      shopping: household.feature_shopping_enabled ?? true,
      tasks: household.feature_tasks_enabled ?? true,
      finances: household.feature_finances_enabled ?? true
    }),
    [household]
  );
  const landingInsertOptions = useMemo(
    () => [
      ...(featureFlags.tasks
        ? [
            { label: t("home.widgetTasksDue"), value: widgetTokenFromKey("tasks-overview") },
            { label: t("home.widgetTasksForYou"), value: widgetTokenFromKey("tasks-for-you") }
          ]
        : []),
      ...(featureFlags.finances
        ? [
            { label: t("home.widgetYourBalance"), value: widgetTokenFromKey("your-balance") },
            { label: t("home.widgetHouseholdBalance"), value: widgetTokenFromKey("household-balance") }
          ]
        : []),
      { label: t("home.widgetRecentActivity"), value: widgetTokenFromKey("recent-activity") },
      ...(featureFlags.bucket
        ? [{ label: t("home.widgetBucketShortList"), value: widgetTokenFromKey("bucket-short-list") }]
        : []),
      ...(featureFlags.tasks
        ? [
            { label: t("home.widgetMemberOfMonth"), value: widgetTokenFromKey("member-of-month") },
            { label: t("home.widgetFairness"), value: widgetTokenFromKey("fairness-score") },
            { label: t("home.widgetReliability"), value: widgetTokenFromKey("reliability-score") },
            { label: t("home.widgetFairnessByMember"), value: widgetTokenFromKey("fairness-by-member") },
            { label: t("home.widgetReliabilityByMember"), value: widgetTokenFromKey("reliability-by-member") }
          ]
        : []),
      ...(featureFlags.finances
        ? [{ label: t("home.widgetExpensesByMonth"), value: widgetTokenFromKey("expenses-by-month") }]
        : []),
      { label: t("home.calendarTitle"), value: widgetTokenFromKey("household-calendar") },
      { label: t("home.householdWeatherDailyWidgetTitle"), value: widgetTokenFromKey("household-weather-daily") },
      { label: t("home.householdWeatherPlotWidgetTitle"), value: widgetTokenFromKey("household-weather-plot") },
      { label: t("home.whiteboardTitle"), value: widgetTokenFromKey("household-whiteboard") },
      { label: t("home.householdMapTitle"), value: widgetTokenFromKey("household-map") }
    ],
    [featureFlags, t]
  );
  const landingInsertOptionsForEditor = useMemo(
    () =>
      landingInsertOptions.map((option) => ({
        ...option,
        value: convertLandingTokensToEditorJsx(option.value)
      })),
    [landingInsertOptions]
  );
  const defaultLandingMarkdown = useMemo(
    () =>
      [
        `# ${t("home.defaultLandingHeading", { household: household.name })}`,
        "",
        t("home.defaultLandingIntro"),
        "",
        `## ${t("home.defaultLandingWidgetsHeading")}`,
        "",
        "{{widget:tasks-for-you}}",
        "",
        "{{widget:your-balance}}",
        "",
        "{{widget:recent-activity}}",
        "",
        "{{widget:tasks-overview}}"
      ].join("\n"),
    [household.name, t]
  );
  const showSummary = section === "summary";
  const showBucket = section === "bucket" && featureFlags.bucket;
  const showFeed = section === "feed";
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => startOfMonth(new Date()));
  const [openCalendarTooltipDay, setOpenCalendarTooltipDay] = useState<string | null>(null);
  const [isCalendarCoarsePointer, setIsCalendarCoarsePointer] = useState(false);
  const [isCalendarMobile, setIsCalendarMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const [calendarFilters, setCalendarFilters] = useState(() => ({
    cleaning: true,
    tasksCompleted: true,
    finances: true,
    bucket: true,
    shopping: false,
    cashAudits: true,
    vacations: true
  }));
  const [isMobileBucketComposer, setIsMobileBucketComposer] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const [bucketTitle, setBucketTitle] = useState("");
  const [bucketDescriptionMarkdown, setBucketDescriptionMarkdown] = useState("");
  const [bucketSuggestedDates, setBucketSuggestedDates] = useState<string[]>([]);
  const [bucketItemBeingEdited, setBucketItemBeingEdited] = useState<BucketItem | null>(null);
  const [bucketEditTitle, setBucketEditTitle] = useState("");
  const [bucketEditDescriptionMarkdown, setBucketEditDescriptionMarkdown] = useState("");
  const [bucketEditSuggestedDates, setBucketEditSuggestedDates] = useState<string[]>([]);
  const [bucketItemPendingDelete, setBucketItemPendingDelete] = useState<BucketItem | null>(null);
  const [showCompletedBucketItems, setShowCompletedBucketItems] = useState(false);
  const bucketComposerContainerRef = useRef<HTMLDivElement | null>(null);
  const bucketComposerRowRef = useRef<HTMLDivElement | null>(null);
  const landingEditorRef = useRef<MDXEditorMethods | null>(null);
  const [bucketPopoverWidth, setBucketPopoverWidth] = useState(320);
  const [isEditingLanding, setIsEditingLanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCompleteTask, setPendingCompleteTask] = useState<TaskItem | null>(null);
  const savedMarkdown = getSavedLandingMarkdown(household.landing_page_markdown);
  const effectiveMarkdown = getEffectiveLandingMarkdown(savedMarkdown, defaultLandingMarkdown);
  const [markdownDraft, setMarkdownDraft] = useState(effectiveMarkdown);
  const [whiteboardDraft, setWhiteboardDraft] = useState(whiteboardSceneJson);
  const [whiteboardError, setWhiteboardError] = useState<string | null>(null);
  const [whiteboardStatus, setWhiteboardStatus] = useState<"idle" | "saving" | "saved" | "unsaved" | "error">("idle");
  const [addressMapCenter, setAddressMapCenter] = useState<[number, number] | null>(null);
  const [addressMapLabel, setAddressMapLabel] = useState<string | null>(null);
  const [mapRecenterRequestToken, setMapRecenterRequestToken] = useState(0);
  const [myLocationCenter, setMyLocationCenter] = useState<[number, number] | null>(null);
  const [myLocationRecenterRequestToken, setMyLocationRecenterRequestToken] = useState(0);
  const [myLocationStatus, setMyLocationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [myLocationError, setMyLocationError] = useState<string | null>(null);
  const [whiteboardOnlineUserIds, setWhiteboardOnlineUserIds] = useState<string[]>([]);
  const [liveShareDurationMinutes, setLiveShareDurationMinutes] = useState<number>(15);
  const [isLiveShareDialogOpen, setIsLiveShareDialogOpen] = useState(false);
  const [liveShareStatus, setLiveShareStatus] = useState<"idle" | "starting" | "active" | "stopping" | "error">("idle");
  const [liveShareError, setLiveShareError] = useState<string | null>(null);
  const [poiOverrideDrafts, setPoiOverrideDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [poiOverrideSavingId, setPoiOverrideSavingId] = useState<string | null>(null);
  const [poiOverrideError, setPoiOverrideError] = useState<string | null>(null);
  const [editingMarkerDraft, setEditingMarkerDraft] = useState<{
    id: string;
    title: string;
    description: string;
    icon: HouseholdMapMarkerIcon;
  } | null>(null);
  const [editingMarkerError, setEditingMarkerError] = useState<string | null>(null);
  const [editingMarkerSaving, setEditingMarkerSaving] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleId>("street");
  const [mapWeatherLayers, setMapWeatherLayers] = useState<MapWeatherLayerToggles>({
    radar: true,
    warnings: true,
    lightning: false
  });
  const [mapMeasurePanelOpen, setMapMeasurePanelOpen] = useState(false);
  const [mapMeasureMode, setMapMeasureMode] = useState<MapMeasureMode | null>(null);
  const [mapMeasureResult, setMapMeasureResult] = useState<string | null>(null);
  const [mapMeasureResultAnchor, setMapMeasureResultAnchor] = useState<[number, number] | null>(null);
  const [mapMeasureClearToken, setMapMeasureClearToken] = useState(0);
  const [mapRenderVersion, setMapRenderVersion] = useState(0);
  const [mapDeleteConfirm, setMapDeleteConfirm] = useState<{
    nextMarkers: HouseholdMapMarker[];
    removedMarkers: HouseholdMapMarker[];
  } | null>(null);
  const [mapReachabilityMode, setMapReachabilityMode] = useState<MapReachabilityMode>("walk");
  const [mapReachabilityMinutes, setMapReachabilityMinutes] = useState<number>(REACHABILITY_MINUTES_DEFAULT);
  const [mapReachabilityGeoJson, setMapReachabilityGeoJson] = useState<ReachabilityGeoJson | null>(null);
  const [mapReachabilityLoading, setMapReachabilityLoading] = useState(false);
  const [mapReachabilityError, setMapReachabilityError] = useState<string | null>(null);
  const [mapReachabilityPanelOpen, setMapReachabilityPanelOpen] = useState(false);
  const [mapReachabilityOrigin, setMapReachabilityOrigin] = useState<[number, number] | null>(null);
  const [mapReachabilityOriginManual, setMapReachabilityOriginManual] = useState(false);
  const [mapReachabilityPickOriginActive, setMapReachabilityPickOriginActive] = useState(false);
  const [mapReachabilityFitRequestToken, setMapReachabilityFitRequestToken] = useState(0);
  const [mapRoutePanelOpen, setMapRoutePanelOpen] = useState(false);
  const [mapRouteMode, setMapRouteMode] = useState<MapReachabilityMode>("walk");
  const [mapRouteMaxMinutes, setMapRouteMaxMinutes] = useState<number>(ROUTE_MAX_MINUTES_DEFAULT);
  const [mapRouteTarget, setMapRouteTarget] = useState<[number, number] | null>(null);
  const [mapRoutePickTargetActive, setMapRoutePickTargetActive] = useState(false);
  const [mapRouteGeoJson, setMapRouteGeoJson] = useState<RouteGeoJson | null>(null);
  const [mapRouteLoading, setMapRouteLoading] = useState(false);
  const [mapRouteError, setMapRouteError] = useState<string | null>(null);
  const [mapRouteFitRequestToken, setMapRouteFitRequestToken] = useState(0);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<MapSearchResult[]>([]);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchError, setMapSearchError] = useState<string | null>(null);
  const [mapSearchInputFocused, setMapSearchInputFocused] = useState(false);
  const [mapSearchViewportBounds, setMapSearchViewportBounds] = useState<MapSearchViewportBounds | null>(null);
  const [mapSearchZoomRequest, setMapSearchZoomRequest] = useState<MapSearchZoomRequest | null>(null);
  const [manualMarkerFilterMode, setManualMarkerFilterMode] = useState<ManualMarkerFilterMode>("all");
  const [manualMarkerFilterMemberId, setManualMarkerFilterMemberId] = useState<string>("");
  const [poiCategoriesEnabled, setPoiCategoriesEnabled] = useState<Record<PoiCategory, boolean>>({
    restaurant: true,
    shop: true,
    supermarket: true,
    fuel: true
  });
  const whiteboardSaveTimerRef = useRef<number | null>(null);
  const mapMarkerSaveTimerRef = useRef<number | null>(null);
  const pendingMapMarkerSaveRef = useRef<HouseholdMapMarker[] | null>(null);
  const locateControlRef = useRef<LocateControlHandle | null>(null);
  const liveShareHeartbeatTimerRef = useRef<number | null>(null);
  const liveShareExpiresAtRef = useRef<string | null>(null);
  const lastSavedWhiteboardRef = useRef(whiteboardSceneJson);
  const isWhiteboardFullscreenOpen = location.pathname === "/home/summary/whiteboard";
  const isMapFullscreenOpen = location.pathname === "/home/summary/map";
  const openWhiteboardFullscreen = useCallback(() => {
    if (isWhiteboardFullscreenOpen) return;
    void navigate({ to: "/home/summary/whiteboard" });
  }, [isWhiteboardFullscreenOpen, navigate]);
  const openMapFullscreen = useCallback(() => {
    if (isMapFullscreenOpen) return;
    void navigate({ to: "/home/summary/map" });
  }, [isMapFullscreenOpen, navigate]);
  const closeWhiteboardFullscreen = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      let didHandlePop = false;
      const onPopState = () => {
        didHandlePop = true;
        void navigate({ to: "/home/summary", replace: true });
      };
      window.addEventListener("popstate", onPopState, { once: true });
      window.history.back();
      window.setTimeout(() => {
        if (didHandlePop) return;
        window.removeEventListener("popstate", onPopState);
        void navigate({ to: "/home/summary", replace: true });
      }, 220);
      return;
    }
    void navigate({ to: "/home/summary", replace: true });
  }, [navigate]);
  const closeMapFullscreen = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      let didHandlePop = false;
      const onPopState = () => {
        didHandlePop = true;
        void navigate({ to: "/home/summary", replace: true });
      };
      window.addEventListener("popstate", onPopState, { once: true });
      window.history.back();
      window.setTimeout(() => {
        if (didHandlePop) return;
        window.removeEventListener("popstate", onPopState);
        void navigate({ to: "/home/summary", replace: true });
      }, 220);
      return;
    }
    void navigate({ to: "/home/summary", replace: true });
  }, [navigate]);
  const canEdit = canEditLandingByRole(currentMember?.role ?? null);
  const prefetchEditor = useCallback(() => {
    void import("../../components/mx-editor");
  }, []);
  const hasContent = effectiveMarkdown.trim().length > 0;
  const householdImageUrl = household.image_url?.trim() ?? "";
  const bannerBackgroundImage = useMemo(
    () => (householdImageUrl ? `url("${householdImageUrl}")` : createTrianglifyBannerBackground(household.name)),
    [household.name, householdImageUrl]
  );
  const language = i18n.resolvedLanguage ?? i18n.language;
  const addressInput = household.address.trim();
  const weatherLocationLabel = useMemo(() => {
    const source = (addressMapLabel ?? addressInput).trim();
    if (!source) return "";
    const cityFromPostalPattern = source.match(/\b\d{4,5}\s+([^,\d][^,]*)/u)?.[1]?.trim() ?? "";
    if (cityFromPostalPattern.length > 0) {
      return cityFromPostalPattern;
    }
    const commaParts = source
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const cleanPart = (part: string) =>
      part
        .replace(/\b\d{4,5}\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const alphaOnlyPart = commaParts
      .map(cleanPart)
      .find((part) => /\p{L}/u.test(part) && !/\d/.test(part) && part.length > 1);
    if (alphaOnlyPart) return alphaOnlyPart;
    return "";
  }, [addressInput, addressMapLabel]);
  const householdWeatherTitle = weatherLocationLabel
    ? t("home.householdWeatherTitleWithLocation", { location: weatherLocationLabel })
    : t("home.householdWeatherTitle");
  const firstManualMarkerCenter = useMemo(() => {
    for (const marker of household.household_map_markers) {
      const center = getHouseholdMarkerCenter(marker);
      if (center) return center;
    }
    return null;
  }, [household.household_map_markers]);
  const mapCenter = addressMapCenter
    ?? firstManualMarkerCenter
    ?? DEFAULT_MAP_CENTER;
  const mapHasPin = Boolean(addressMapCenter);
  const mapZoom = mapHasPin ? MAP_ZOOM_WITH_ADDRESS : addressInput ? MAP_ZOOM_WITH_ADDRESS_FALLBACK : MAP_ZOOM_DEFAULT;
  const selectedPoiCategories = useMemo(
    () =>
      POI_CATEGORY_OPTIONS.map((entry) => entry.id).filter((category) => poiCategoriesEnabled[category]),
    [poiCategoriesEnabled]
  );
  const activeMapStyle = useMemo(
    () => MAP_STYLE_OPTIONS.find((option) => option.id === mapStyle) ?? MAP_STYLE_OPTIONS[0],
    [mapStyle]
  );
  const mapMemberLabel = useCallback(
    (memberId: string) => {
      const member = members.find((entry) => entry.user_id === memberId);
      const display = member?.display_name?.trim();
      if (display) return display;
      return memberId;
    },
    [members]
  );
  const getMemberAvatarForMap = useCallback(
    (memberId: string) => {
      const member = members.find((entry) => entry.user_id === memberId);
      const avatar = member?.avatar_url?.trim();
      if (avatar) return avatar;
      return createDiceBearAvatarDataUri(
        getMemberAvatarSeed(memberId, member?.display_name),
      );
    },
    [members]
  );
  const filteredHouseholdMarkers = useMemo(() => {
    if (manualMarkerFilterMode === "none") return [] as HouseholdMapMarker[];
    if (manualMarkerFilterMode === "mine") {
      return household.household_map_markers.filter((marker) => marker.created_by === userId);
    }
    if (manualMarkerFilterMode === "member") {
      if (!manualMarkerFilterMemberId) return [] as HouseholdMapMarker[];
      return household.household_map_markers.filter((marker) => marker.created_by === manualMarkerFilterMemberId);
    }
    return household.household_map_markers;
  }, [household.household_map_markers, manualMarkerFilterMemberId, manualMarkerFilterMode, userId]);
  const memberOptionsForMarkerFilter = useMemo(
    () =>
      members
        .map((member) => ({
          id: member.user_id,
          label: mapMemberLabel(member.user_id)
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [mapMemberLabel, members]
  );
  useEffect(() => {
    if (manualMarkerFilterMode !== "member") return;
    if (memberOptionsForMarkerFilter.length === 0) {
      if (manualMarkerFilterMemberId !== "") {
        setManualMarkerFilterMemberId("");
      }
      return;
    }
    const exists = memberOptionsForMarkerFilter.some((option) => option.id === manualMarkerFilterMemberId);
    if (!exists) {
      setManualMarkerFilterMemberId(memberOptionsForMarkerFilter[0]!.id);
    }
  }, [manualMarkerFilterMemberId, manualMarkerFilterMode, memberOptionsForMarkerFilter]);
  const applyMapSearchResult = useCallback((result: MapSearchResult) => {
    setMapSearchZoomRequest({
      token: Date.now(),
      lat: result.lat,
      lon: result.lon,
      bounds: result.bounds
    });
  }, []);

  useEffect(() => {
    if (!isMapFullscreenOpen) return;

    const query = mapSearchQuery.trim();
    if (query.length < 2) {
      setMapSearchLoading(false);
      setMapSearchError(null);
      setMapSearchResults([]);
      return;
    }
    if (!mapSearchViewportBounds) {
      setMapSearchLoading(false);
      setMapSearchError(null);
      setMapSearchResults([]);
      return;
    }

    const controller = new AbortController();
    setMapSearchLoading(true);
    setMapSearchError(null);

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            format: "jsonv2",
            limit: "8",
            q: query,
            bounded: "1",
            viewbox: `${mapSearchViewportBounds.west},${mapSearchViewportBounds.north},${mapSearchViewportBounds.east},${mapSearchViewportBounds.south}`
          });
          const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal
          });
          if (!response.ok) {
            throw new Error("nominatim_failed");
          }
          const payload = (await response.json()) as Array<{
            place_id?: string | number;
            display_name?: string;
            lat?: string;
            lon?: string;
            boundingbox?: [string, string, string, string];
          }>;
          const nextResults = payload
            .map((entry): MapSearchResult | null => {
              const lat = Number(entry.lat);
              const lon = Number(entry.lon);
              if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
              const bbox = Array.isArray(entry.boundingbox) ? entry.boundingbox : null;
              const bounds =
                bbox && bbox.length === 4
                  ? {
                      south: Number(bbox[0]),
                      north: Number(bbox[1]),
                      west: Number(bbox[2]),
                      east: Number(bbox[3])
                    }
                  : null;
              return {
                id: String(entry.place_id ?? `${lat}:${lon}`),
                label: entry.display_name?.trim() || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                lat,
                lon,
                bounds:
                  bounds
                  && Number.isFinite(bounds.south)
                  && Number.isFinite(bounds.north)
                  && Number.isFinite(bounds.west)
                  && Number.isFinite(bounds.east)
                    ? bounds
                    : null
              };
            })
            .filter((entry): entry is MapSearchResult => entry !== null);

          setMapSearchResults(nextResults);
          setMapSearchError(null);
        } catch {
          if (controller.signal.aborted) return;
          setMapSearchResults([]);
          setMapSearchError(t("home.householdMapSearchError"));
        } finally {
          if (!controller.signal.aborted) {
            setMapSearchLoading(false);
          }
        }
      })();
    }, 380);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isMapFullscreenOpen, mapSearchQuery, mapSearchViewportBounds, t]);

  useEffect(() => {
    if (!isMapFullscreenOpen) {
      setMapSearchQuery("");
      setMapSearchResults([]);
      setMapSearchError(null);
      setMapSearchLoading(false);
      setMapReachabilityPanelOpen(false);
      setMapRoutePanelOpen(false);
      setMapRoutePickTargetActive(false);
      setMapMeasurePanelOpen(false);
    }
  }, [isMapFullscreenOpen]);
  const nearbyPoiQuery = useQuery({
    queryKey: [
      "map-poi",
      household.id,
      mapHasPin ? addressMapCenter?.[0] : null,
      mapHasPin ? addressMapCenter?.[1] : null,
      POI_RADIUS_METERS,
      selectedPoiCategories
    ],
    queryFn: () =>
      getNearbyPois({
        householdId: household.id,
        lat: addressMapCenter![0],
        lon: addressMapCenter![1],
        radiusMeters: POI_RADIUS_METERS,
        categories: selectedPoiCategories
      }),
    enabled: mapHasPin && selectedPoiCategories.length > 0,
    staleTime: 5 * 60 * 1000
  });
  const nearbyPois = (nearbyPoiQuery.data?.rows ?? []) as NearbyPoi[];
  const householdWeatherQuery = useQuery<{ days: HouseholdWeatherDay[]; hourly: HouseholdWeatherHourlyPoint[] }>({
    queryKey: [
      "household-weather",
      household.id,
      mapHasPin ? addressMapCenter?.[0] : null,
      mapHasPin ? addressMapCenter?.[1] : null
    ],
    queryFn: async () => {
      const latitude = addressMapCenter![0];
      const longitude = addressMapCenter![1];
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
          "sunset"
        ].join(","),
        hourly: [
          "temperature_2m",
          "apparent_temperature",
          "precipitation",
          "snowfall",
          "precipitation_probability",
          "cloud_cover",
          "uv_index",
          "wind_speed_10m"
        ].join(","),
        timezone: "auto",
        forecast_days: "7"
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error("weather_fetch_failed");
      }
      const payload = (await response.json()) as {
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
      };
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
            weatherCode: readNumber(Array.isArray(daily.weather_code) ? daily.weather_code : undefined),
            tempMaxC: readNumber(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : undefined),
            tempMinC: readNumber(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : undefined),
            precipitationMm: readNumber(Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum : undefined),
            precipitationProbabilityPercent: readNumber(
              Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : undefined
            ),
            uvIndexMax: readNumber(Array.isArray(daily.uv_index_max) ? daily.uv_index_max : undefined),
            windSpeedKmh: readNumber(Array.isArray(daily.wind_speed_10m_max) ? daily.wind_speed_10m_max : undefined),
            windGustKmh: readNumber(Array.isArray(daily.wind_gusts_10m_max) ? daily.wind_gusts_10m_max : undefined),
            windDirectionDeg: readNumber(
              Array.isArray(daily.wind_direction_10m_dominant) ? daily.wind_direction_10m_dominant : undefined
            ),
            sunrise: (() => {
              const raw = Array.isArray(daily.sunrise) ? daily.sunrise[index] : null;
              return typeof raw === "string" && raw.length > 0 ? raw : null;
            })(),
            sunset: (() => {
              const raw = Array.isArray(daily.sunset) ? daily.sunset[index] : null;
              return typeof raw === "string" && raw.length > 0 ? raw : null;
            })()
          };
        })
        .filter((entry) => entry.date.length > 0);
      const hourly = payload.hourly ?? {};
      const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
      const hourlyReadNumber = (values: unknown[] | undefined, index: number): number | null => {
        const raw = values?.[index];
        const parsed = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const next7DaysHourly: HouseholdWeatherHourlyPoint[] = hourlyTimes
        .slice(0, 24 * 7)
        .map((entry, index) => ({
          time: typeof entry === "string" ? entry : "",
          tempC: hourlyReadNumber(Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : undefined, index),
          apparentTempC: hourlyReadNumber(
            Array.isArray(hourly.apparent_temperature) ? hourly.apparent_temperature : undefined,
            index
          ),
          precipitationMm: hourlyReadNumber(Array.isArray(hourly.precipitation) ? hourly.precipitation : undefined, index),
          snowfallCm: hourlyReadNumber(Array.isArray(hourly.snowfall) ? hourly.snowfall : undefined, index),
          precipitationProbabilityPercent: hourlyReadNumber(
            Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : undefined,
            index
          ),
          cloudCoverPercent: hourlyReadNumber(Array.isArray(hourly.cloud_cover) ? hourly.cloud_cover : undefined, index),
          uvIndex: hourlyReadNumber(Array.isArray(hourly.uv_index) ? hourly.uv_index : undefined, index),
          windSpeedKmh: hourlyReadNumber(Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m : undefined, index)
        }))
        .filter((entry) => entry.time.length > 0);
      return { days, hourly: next7DaysHourly };
    },
    enabled: mapHasPin,
    staleTime: 15 * 60 * 1000
  });
  const householdWeatherDays = householdWeatherQuery.data?.days ?? [];
  const householdWeatherHourly = householdWeatherQuery.data?.hourly ?? [];
  const hasPrecipitationInForecast = useMemo(
    () => householdWeatherHourly.some((entry) => (entry.precipitationMm ?? 0) > 0),
    [householdWeatherHourly]
  );
  const hasSnowfallInForecast = useMemo(
    () => householdWeatherHourly.some((entry) => (entry.snowfallCm ?? 0) > 0),
    [householdWeatherHourly]
  );
  const weatherChartRef = useRef<ChartJS<"bar"> | null>(null);
  const weatherChartContainerRef = useRef<HTMLDivElement | null>(null);
  const lastWeatherChartTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
  const [weatherLegendVersion, setWeatherLegendVersion] = useState(0);
  const zoomOutWeatherChart = useCallback(() => {
    const chart = weatherChartRef.current as (ChartJS<"bar"> & { resetZoom?: () => void; zoom?: (amount: number) => void }) | null;
    if (!chart) return;
    if (typeof chart.resetZoom === "function") {
      chart.resetZoom();
      return;
    }
    if (typeof chart.zoom === "function") {
      chart.zoom(0.8);
    }
  }, []);
  const onWeatherChartTouchEndCapture = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
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
      y: touch.clientY
    };
  }, [zoomOutWeatherChart]);
  useEffect(() => {
    const hideWeatherTooltip = () => {
      const chart = weatherChartRef.current as
        | (ChartJS<"bar"> & {
            tooltip?: { setActiveElements?: (elements: unknown[], position: { x: number; y: number }) => void };
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
  const householdWeatherByDay = useMemo(() => {
    const byDay = new Map<string, HouseholdWeatherDay>();
    householdWeatherDays.forEach((day) => {
      byDay.set(day.date, day);
    });
    return byDay;
  }, [householdWeatherDays]);
  const householdWeatherChartData = useMemo(() => {
    const dailyAstronomy = new Map<
      string,
      {
        sunrise: Date | null;
        sunset: Date | null;
        moonPhase: number;
        moonIllumination: number;
      }
    >();

    householdWeatherDays.forEach((day) => {
      const dayDate = new Date(`${day.date}T12:00:00`);
      const moonPhase = Number.isNaN(dayDate.getTime()) ? 0 : getMoonPhaseFraction(dayDate);
      dailyAstronomy.set(day.date, {
        sunrise: day.sunrise ? new Date(day.sunrise) : null,
        sunset: day.sunset ? new Date(day.sunset) : null,
        moonPhase,
        moonIllumination: getMoonIllumination(moonPhase)
      });
    });

    const labels = householdWeatherHourly.map((entry, index) => {
      const date = new Date(entry.time);
      if (Number.isNaN(date.getTime())) return `${index + 1}`;
      const day = date.toLocaleDateString(language, { day: "2-digit", month: "2-digit" });
      const hour = date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
      return `${day} ${hour}`;
    });

    const sunTrack: Array<number | null> = [];
    const moonTrack: Array<number | null> = [];
    const moonPhaseTrack: number[] = [];
    const moonPointRadius: number[] = new Array(householdWeatherHourly.length).fill(0);
    const moonPointStyle: Array<string | HTMLCanvasElement> = new Array(householdWeatherHourly.length).fill("circle");
    const moonPointHoverRadius: number[] = new Array(householdWeatherHourly.length).fill(0);
    const moonPeakByDay = new Map<string, { index: number; distance: number }>();

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
            const progress = (current.getTime() - sunrise.getTime()) / dayDurationMs;
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
      let moonIllumination = dayAstronomy?.moonIllumination ?? getMoonIllumination(moonPhase);

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

      const progress = (current.getTime() - nightStart.getTime()) / nightDurationMs;
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
          tension: 0.3
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
          tension: 0.3
        },
        {
          type: "bar" as const,
          label: t("home.householdWeatherChartCloudCover"),
          hidden: true,
          data: householdWeatherHourly.map((entry) => {
            if (typeof entry.cloudCoverPercent !== "number" || !Number.isFinite(entry.cloudCoverPercent)) return null;
            return 100 - Math.min(100, Math.max(0, entry.cloudCoverPercent));
          }),
          yAxisID: "yCloud",
          base: 100,
          backgroundColor: householdWeatherHourly.map((entry) => {
            const cover = Math.min(100, Math.max(0, entry.cloudCoverPercent ?? 0));
            const alpha = 0.08 + (cover / 100) * 0.26;
            return `rgba(148, 163, 184, ${alpha})`;
          }),
          borderWidth: 0,
          barPercentage: 1,
          categoryPercentage: 1
        },
        ...(hasPrecipitationInForecast
          ? [
              {
                type: "bar" as const,
                label: t("home.householdWeatherChartPrecip"),
                data: householdWeatherHourly.map((entry) => entry.precipitationMm),
                yAxisID: "yPrecip",
                backgroundColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarColor(entry.precipitationProbabilityPercent)
                ),
                borderColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarBorderColor(entry.precipitationProbabilityPercent)
                ),
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1
              }
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
                  getPrecipitationBarColor(entry.precipitationProbabilityPercent)
                ),
                borderColor: householdWeatherHourly.map((entry) =>
                  getPrecipitationBarBorderColor(entry.precipitationProbabilityPercent)
                ),
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1
              }
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
          tension: 0.25
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
          tension: 0.3
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
          tension: 0.35
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
          pointStyle: moonPointStyle
        }
      ]
    };
  }, [hasPrecipitationInForecast, hasSnowfallInForecast, householdWeatherDays, householdWeatherHourly, language, t]);
  const weatherLegendItems = useMemo(() => {
    const activeDatasets =
      (weatherChartRef.current?.data.datasets as Array<{ label?: string; hidden?: boolean }> | undefined) ??
      (householdWeatherChartData.datasets as Array<{ label?: string; hidden?: boolean }>);
    const chart = weatherChartRef.current;
    return activeDatasets
      .map((dataset, index) => ({
        index,
        label: dataset.label ?? `${t("common.loading")} ${index + 1}`,
        visible: chart ? chart.isDatasetVisible(index) : !(dataset.hidden ?? false)
      }))
      .filter((item) => item.label.trim().length > 0);
  }, [householdWeatherChartData.datasets, t, weatherLegendVersion]);
  const toggleWeatherLegendDataset = useCallback((datasetIndex: number) => {
    const chart = weatherChartRef.current;
    if (!chart) return;
    const nextVisible = !chart.isDatasetVisible(datasetIndex);
    chart.setDatasetVisibility(datasetIndex, nextVisible);
    chart.update();
    setWeatherLegendVersion((version) => version + 1);
  }, []);
  const householdWeatherChartOptions = useMemo(
    () => {
      const precipitationAxisMax = getPrecipitationAxisMax(
        householdWeatherHourly.map((entry) => entry.precipitationMm)
      );
      const snowfallAxisMax = getPrecipitationAxisMax(
        householdWeatherHourly.map((entry) => entry.snowfallCm)
      );
      const uvAxisMax = getUvAxisMax(
        householdWeatherHourly.map((entry) => entry.uvIndex)
      );
      const primaryAxisRange = getWeatherPrimaryAxisRange(householdWeatherHourly);
      const initialVisibleHours = 48;
      const initialXMin = 0;
      const initialXMax = Math.max(0, Math.min(householdWeatherHourly.length - 1, initialVisibleHours - 1));
      const options: Record<string, unknown> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index" as const,
        intersect: false
      },
      plugins: {
        legend: {
          display: !isMobileBucketComposer,
          labels: {
            boxWidth: 12,
            boxHeight: 8,
            color: "rgb(100 116 139)"
          }
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
                minute: "2-digit"
              });
            },
            label: (context: { dataset: { label?: string; yAxisID?: string }; parsed: { y?: number }; dataIndex: number }) => {
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
                  getMoonIllumination(phase) * 100
                )} %)`;
              }
              if (context.dataset.yAxisID === "yCloud") {
                const cover = householdWeatherHourly[context.dataIndex]?.cloudCoverPercent ?? 0;
                return `${datasetLabel}: ${Math.round(cover)} %`;
              }
              if (datasetLabel === t("home.householdWeatherChartPrecip")) {
                const probability = householdWeatherHourly[context.dataIndex]?.precipitationProbabilityPercent ?? 0;
                return `${datasetLabel}: ${numericValue ?? 0} mm (${Math.round(probability)} %)`;
              }
              if (datasetLabel === t("home.householdWeatherChartSnowfall")) {
                const probability = householdWeatherHourly[context.dataIndex]?.precipitationProbabilityPercent ?? 0;
                return `${datasetLabel}: ${numericValue ?? 0} cm (${Math.round(probability)} %)`;
              }
              if (datasetLabel === t("home.householdWeatherChartWind")) {
                return `${datasetLabel}: ${numericValue ?? 0} km/h`;
              }
              if (datasetLabel === t("home.householdWeatherChartUvIndex")) {
                return `${datasetLabel}: ${numericValue ?? 0}`;
              }
              return `${datasetLabel}: ${numericValue ?? 0} °C`;
            }
          }
        }
      },
      scales: {
        x: {
          min: initialXMin,
          max: initialXMax,
          ticks: {
            autoSkip: false,
            maxTicksLimit: isMobileBucketComposer ? 6 : 14,
            maxRotation: 0,
            color: "rgb(100 116 139)",
            padding: isMobileBucketComposer ? 6 : 4,
            font: isMobileBucketComposer ? { size: 10 } : undefined,
            callback: function (this: { min?: number; max?: number }, value: string | number, index: number) {
              const visibleMin = Number.isFinite(this.min) ? Number(this.min) : 0;
              const visibleMax = Number.isFinite(this.max)
                ? Number(this.max)
                : Math.max(0, householdWeatherHourly.length - 1);
              const visibleHours = Math.max(1, Math.round(visibleMax - visibleMin + 1));
              const density = getWeatherXAxisDensity(visibleHours);
              const labelEvery = isMobileBucketComposer
                ? Math.max(
                    density.labelEvery * 4,
                    visibleHours <= 30 ? 6 : visibleHours <= 96 ? 8 : 12
                  )
                : density.labelEvery;
              const parsedIndex = resolveChartTickIndex(value, index);
              const clampedIndex = Math.max(0, Math.min(householdWeatherHourly.length - 1, parsedIndex));
              const row = householdWeatherHourly[clampedIndex];
              if (!row) return "";
              const date = new Date(row.time);
              if (Number.isNaN(date.getTime())) return "";

              const firstVisibleIndex = Math.max(
                0,
                Math.min(householdWeatherHourly.length - 1, Math.round(visibleMin))
              );
              const lastVisibleIndex = Math.max(
                0,
                Math.min(householdWeatherHourly.length - 1, Math.round(visibleMax))
              );
              const relativeIndex = Math.max(0, clampedIndex - firstVisibleIndex);
              const isEdgeTick = clampedIndex === firstVisibleIndex || clampedIndex === lastVisibleIndex;

              if (!isEdgeTick && relativeIndex % labelEvery !== 0) {
                return "";
              }

              if (visibleHours <= 30) {
                return isMobileBucketComposer
                  ? date.toLocaleTimeString(language, { hour: "2-digit" })
                  : date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
              }

              if (visibleHours <= 96) {
                if (date.getHours() === 0) {
                  return date.toLocaleDateString(language, { day: "2-digit", month: "2-digit" });
                }
                return date.toLocaleTimeString(language, { hour: "2-digit" });
              }

              if (date.getHours() === 0) {
                return date.toLocaleDateString(language, { day: "2-digit", month: "2-digit" });
              }
              if (date.getHours() % 12 === 0) {
                return date.toLocaleTimeString(language, { hour: "2-digit" });
              }
              return "";
            }
          },
          grid: {
            color: (ctx: { chart: { scales?: Record<string, { min?: number; max?: number }> }; tick?: { value?: number | string }; index: number }) => {
              const xScale = ctx.chart.scales?.x;
              const visibleMin = Number.isFinite(xScale?.min) ? Number(xScale?.min) : 0;
              const visibleMax = Number.isFinite(xScale?.max)
                ? Number(xScale?.max)
                : Math.max(0, householdWeatherHourly.length - 1);
              const visibleHours = Math.max(1, Math.round(visibleMax - visibleMin + 1));
              const density = getWeatherXAxisDensity(visibleHours);
              const tickIndex = resolveChartTickIndex(ctx.tick?.value, ctx.index);
              const normalized = Math.max(0, tickIndex);
              const row = householdWeatherHourly[Math.min(householdWeatherHourly.length - 1, normalized)];
              if (row) {
                const isMidnightByRawTime = /T00:00(?::00)?$/.test(row.time);
                const date = new Date(row.time);
                const isMidnightByParsedTime = !Number.isNaN(date.getTime()) && date.getHours() === 0;
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
            lineWidth: (ctx: { chart: { scales?: Record<string, { min?: number; max?: number }> }; tick?: { value?: number | string }; index: number }) => {
              const xScale = ctx.chart.scales?.x;
              const visibleMin = Number.isFinite(xScale?.min) ? Number(xScale?.min) : 0;
              const visibleMax = Number.isFinite(xScale?.max)
                ? Number(xScale?.max)
                : Math.max(0, householdWeatherHourly.length - 1);
              const visibleHours = Math.max(1, Math.round(visibleMax - visibleMin + 1));
              const density = getWeatherXAxisDensity(visibleHours);
              const tickIndex = resolveChartTickIndex(ctx.tick?.value, ctx.index);
              const normalized = Math.max(0, tickIndex);
              const row = householdWeatherHourly[Math.min(householdWeatherHourly.length - 1, normalized)];
              if (row) {
                const isMidnightByRawTime = /T00:00(?::00)?$/.test(row.time);
                const date = new Date(row.time);
                const isMidnightByParsedTime = !Number.isNaN(date.getTime()) && date.getHours() === 0;
                if (isMidnightByRawTime || isMidnightByParsedTime) return 1.8;
              }
              if (normalized % density.majorGridEvery === 0) return 1.1;
              if (normalized % density.minorGridEvery === 0) return 0.7;
              return 0.35;
            }
          }
        },
        y: {
          position: "left" as const,
          min: primaryAxisRange.min,
          max: primaryAxisRange.max,
          ticks: {
            display: !isMobileBucketComposer,
            color: "rgb(100 116 139)",
            callback: (value: number | string) => `${value}°C / kmh`
          },
          grid: {
            color: "rgba(148, 163, 184, 0.2)"
          }
        },
        yPrecip: {
          display: false,
          position: "right" as const,
          min: 0,
          max: precipitationAxisMax,
          ticks: {
            display: false,
            color: "rgb(100 116 139)",
            callback: (value: number | string) => `${value} mm`
          },
          grid: {
            display: false,
            drawOnChartArea: false
          }
        },
        ySnow: {
          display: false,
          position: "right" as const,
          min: 0,
          max: snowfallAxisMax,
          ticks: {
            display: false
          },
          grid: {
            display: false,
            drawOnChartArea: false
          }
        },
        yCloud: {
          display: false,
          position: "right" as const,
          min: 0,
          max: 100,
          grid: {
            display: false,
            drawOnChartArea: false
          },
          ticks: {
            display: false
          }
        },
        yUv: {
          display: false,
          position: "right" as const,
          min: 0,
          max: uvAxisMax,
          grid: {
            display: false,
            drawOnChartArea: false
          },
          ticks: {
            display: false
          }
        },
        ySky: {
          position: "right" as const,
          min: 0,
          max: 1,
          display: false,
          grid: {
            display: false,
            drawOnChartArea: false
          },
          ticks: {
            display: false
          }
        }
      }
    };
      const plugins = options.plugins as Record<string, unknown>;
      plugins.zoom = {
        pan: {
          enabled: true,
          mode: "x",
          scaleMode: "x"
        },
        zoom: {
          wheel: {
            enabled: true
          },
          pinch: {
            enabled: true
          },
          drag: {
            enabled: true,
            backgroundColor: "rgba(59, 130, 246, 0.12)"
          },
          mode: "x",
          scaleMode: "x"
        },
        limits: {
          x: { min: 0, max: Math.max(0, householdWeatherHourly.length - 1) },
          y: { min: primaryAxisRange.min, max: primaryAxisRange.max },
          yPrecip: { min: 0, max: precipitationAxisMax },
          ySnow: { min: 0, max: snowfallAxisMax },
          yCloud: { min: 0, max: 100 },
          yUv: { min: 0, max: uvAxisMax },
          ySky: { min: 0, max: 1 }
        }
      };

      return options;
    },
    [householdWeatherHourly, isMobileBucketComposer, language, t]
  );
  const liveLocationsQuery = useQuery<HouseholdLiveLocation[]>({
    queryKey: queryKeys.householdLiveLocations(household.id),
    queryFn: () => getHouseholdLiveLocations(household.id),
    refetchInterval: 30_000
  });
  const activeLiveLocations = liveLocationsQuery.data ?? [];
  const myActiveLiveLocation = useMemo(
    () => activeLiveLocations.find((entry) => entry.user_id === userId) ?? null,
    [activeLiveLocations, userId]
  );
  const otherActiveLiveLocations = useMemo(
    () => activeLiveLocations.filter((entry) => entry.user_id !== userId),
    [activeLiveLocations, userId]
  );
  const isHouseholdOwner = currentMember?.role === "owner";
  const poiOverrideMarkersByRef = useMemo(() => {
    const byRef = new Map<string, HouseholdMapMarker>();
    for (const marker of household.household_map_markers) {
      if (!marker.poi_ref) continue;
      const existing = byRef.get(marker.poi_ref);
      if (!existing) {
        byRef.set(marker.poi_ref, marker);
        continue;
      }
      const existingAt = Date.parse(existing.last_edited_at);
      const currentAt = Date.parse(marker.last_edited_at);
      if (!Number.isFinite(existingAt) || currentAt > existingAt) {
        byRef.set(marker.poi_ref, marker);
      }
    }
    return byRef;
  }, [household.household_map_markers]);
  const buildHouseholdUpdatePayload = useCallback(
    (markers: HouseholdMapMarker[]): UpdateHouseholdInput => ({
      name: household.name,
      imageUrl: household.image_url ?? "",
      address: household.address,
      currency: household.currency,
      apartmentSizeSqm: household.apartment_size_sqm,
      coldRentMonthly: household.cold_rent_monthly,
      utilitiesMonthly: household.utilities_monthly,
      utilitiesOnRoomSqmPercent: household.utilities_on_room_sqm_percent,
      taskLazinessEnabled: household.task_laziness_enabled,
      vacationTasksExcludeEnabled: household.vacation_tasks_exclude_enabled,
      vacationFinancesExcludeEnabled: household.vacation_finances_exclude_enabled,
      taskSkipEnabled: household.task_skip_enabled,
      featureBucketEnabled: household.feature_bucket_enabled,
      featureShoppingEnabled: household.feature_shopping_enabled,
      featureTasksEnabled: household.feature_tasks_enabled,
      featureOneOffTasksEnabled: household.feature_one_off_tasks_enabled,
      featureFinancesEnabled: household.feature_finances_enabled,
      oneOffClaimTimeoutHours: household.one_off_claim_timeout_hours,
      oneOffClaimMaxPimpers: household.one_off_claim_max_pimpers,
      themePrimaryColor: household.theme_primary_color,
      themeAccentColor: household.theme_accent_color,
      themeFontFamily: household.theme_font_family,
      themeRadiusScale: household.theme_radius_scale,
      translationOverrides: household.translation_overrides,
      householdMapMarkers: markers
    }),
    [household]
  );
  const onSaveExistingPoiOverride = useCallback(
    async (marker: HouseholdMapMarker) => {
      if (marker.type !== "point") return;
      if (!marker.poi_ref) return;
      if (!isHouseholdOwner) {
        setPoiOverrideError(t("home.householdMapPoiOverrideOwnerOnly"));
        return;
      }
      const draft = poiOverrideDrafts[marker.poi_ref];
      const title = (draft?.title ?? marker.title).trim();
      if (!title) {
        setPoiOverrideError(t("home.householdMapPoiOverrideTitleRequired"));
        return;
      }
      const nowIso = new Date().toISOString();
      const nextMarker: HouseholdMapMarker = {
        ...marker,
        title,
        description: (draft?.description ?? marker.description).trim(),
        last_edited_by: userId,
        last_edited_at: nowIso
      };
      const nextMarkers = household.household_map_markers.map((entry) =>
        entry.id === marker.id ? nextMarker : entry
      );
      try {
        setPoiOverrideSavingId(marker.poi_ref);
        setPoiOverrideError(null);
        await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.unknownError");
        setPoiOverrideError(message);
      } finally {
        setPoiOverrideSavingId(null);
      }
    },
    [
      buildHouseholdUpdatePayload,
      household.household_map_markers,
      isHouseholdOwner,
      onUpdateHousehold,
      poiOverrideDrafts,
      t,
      userId
    ]
  );
  const openMarkerEdit = useCallback(
    (marker: HouseholdMapMarker) => {
      if (!isHouseholdOwner) return;
      setEditingMarkerError(null);
      setEditingMarkerDraft({
        id: marker.id,
        title: marker.title,
        description: marker.description,
        icon: marker.icon
      });
    },
    [isHouseholdOwner]
  );
  const saveEditedMarker = useCallback(async () => {
    if (!editingMarkerDraft || !isHouseholdOwner) return;

    const title = editingMarkerDraft.title.trim();
    if (!title) {
      setEditingMarkerError(t("home.householdMapMarkerTitleRequired"));
      return;
    }

    const markerToUpdate = household.household_map_markers.find((marker) => marker.id === editingMarkerDraft.id);
    if (!markerToUpdate) {
      setEditingMarkerError(t("app.unknownError"));
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedMarker: HouseholdMapMarker = {
      ...markerToUpdate,
      title,
      description: editingMarkerDraft.description.trim(),
      icon: editingMarkerDraft.icon,
      last_edited_by: userId,
      last_edited_at: nowIso
    };
    const nextMarkers = household.household_map_markers.map((marker) =>
      marker.id === updatedMarker.id ? updatedMarker : marker
    );

    try {
      setEditingMarkerSaving(true);
      setEditingMarkerError(null);
      await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      setEditingMarkerDraft(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.unknownError");
      setEditingMarkerError(message);
    } finally {
      setEditingMarkerSaving(false);
    }
  }, [
    buildHouseholdUpdatePayload,
    editingMarkerDraft,
    household.household_map_markers,
    isHouseholdOwner,
    onUpdateHousehold,
    t,
    userId
  ]);

  const flushQueuedMapMarkerSave = useCallback(async () => {
    const nextMarkers = pendingMapMarkerSaveRef.current;
    pendingMapMarkerSaveRef.current = null;
    if (!nextMarkers) return;

    const currentSerialized = JSON.stringify(household.household_map_markers);
    const nextSerialized = JSON.stringify(nextMarkers);
    if (currentSerialized === nextSerialized) return;

    try {
      await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
    } catch {
      // Ignore silent autosave errors in map editor to avoid blocking interactions.
    }
  }, [buildHouseholdUpdatePayload, household.household_map_markers, onUpdateHousehold]);

  const queueMapMarkerAutosave = useCallback(
    (markers: HouseholdMapMarker[]) => {
      pendingMapMarkerSaveRef.current = markers;
      if (mapMarkerSaveTimerRef.current !== null) {
        window.clearTimeout(mapMarkerSaveTimerRef.current);
      }
      mapMarkerSaveTimerRef.current = window.setTimeout(() => {
        mapMarkerSaveTimerRef.current = null;
        void flushQueuedMapMarkerSave();
      }, 500);
    },
    [flushQueuedMapMarkerSave]
  );

  const onGeomanMarkersChanged = useCallback(
    (markers: HouseholdMapMarker[]) => {
      if (!isHouseholdOwner) return;

      const nextIds = new Set(markers.map((entry) => entry.id));
      const removedMarkers = household.household_map_markers.filter((entry) => !nextIds.has(entry.id));
      if (removedMarkers.length > 0) {
        setMapDeleteConfirm({ nextMarkers: markers, removedMarkers });
        return;
      }

      queueMapMarkerAutosave(markers);
    },
    [household.household_map_markers, isHouseholdOwner, queueMapMarkerAutosave]
  );

  const confirmMapDeletion = useCallback(() => {
    if (!mapDeleteConfirm) return;
    queueMapMarkerAutosave(mapDeleteConfirm.nextMarkers);
    setMapDeleteConfirm(null);
  }, [mapDeleteConfirm, queueMapMarkerAutosave]);

  const cancelMapDeletion = useCallback(() => {
    setMapDeleteConfirm(null);
    setMapRenderVersion((current) => current + 1);
  }, []);

  const onLocateControlReady = useCallback((control: LocateControlHandle | null) => {
    locateControlRef.current = control;
  }, []);

  const onLocateControlFound = useCallback((lat: number, lon: number) => {
    setMyLocationCenter([lat, lon]);
    setMyLocationRecenterRequestToken((current) => current + 1);
    setMyLocationError(null);
    setMyLocationStatus("idle");
  }, []);

  const onLocateControlError = useCallback(() => {
    setMyLocationStatus("error");
    setMyLocationError(t("home.householdMapMyLocationError"));
  }, [t]);

  const requestMyLocation = useCallback(() => {
    if (locateControlRef.current) {
      setMyLocationError(null);
      setMyLocationStatus("loading");
      locateControlRef.current.start();
      return;
    }

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setMyLocationStatus("error");
      setMyLocationError(t("home.householdMapMyLocationUnavailable"));
      return;
    }

    setMyLocationStatus("loading");
    setMyLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setMyLocationStatus("error");
          setMyLocationError(t("home.householdMapMyLocationError"));
          return;
        }
        setMyLocationCenter([lat, lon]);
        setMyLocationRecenterRequestToken((current) => current + 1);
        setMyLocationStatus("idle");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setMyLocationError(t("home.householdMapMyLocationDenied"));
        } else if (error.code === error.TIMEOUT) {
          setMyLocationError(t("home.householdMapMyLocationTimeout"));
        } else {
          setMyLocationError(t("home.householdMapMyLocationError"));
        }
        setMyLocationStatus("error");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }, [t]);

  const runReachability = useCallback(async () => {
    const origin = mapReachabilityOrigin;
    if (!origin) {
      setMapReachabilityError(t("home.householdMapReachabilityNeedsOrigin"));
      return;
    }
    try {
      setMapReachabilityLoading(true);
      setMapReachabilityError(null);
      const response = await getHouseholdReachability({
        householdId: household.id,
        lat: origin[0],
        lon: origin[1],
        minutes: mapReachabilityMinutes,
        travelMode: mapReachabilityMode
      });
      setMapReachabilityGeoJson(response.geojson);
      setMapReachabilityFitRequestToken(Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : t("home.householdMapReachabilityError");
      setMapReachabilityError(message);
    } finally {
      setMapReachabilityLoading(false);
    }
  }, [household.id, mapReachabilityMinutes, mapReachabilityMode, mapReachabilityOrigin, t]);

  const clearReachability = useCallback(() => {
    setMapReachabilityGeoJson(null);
    setMapReachabilityError(null);
    setMapReachabilityLoading(false);
    setMapReachabilityPickOriginActive(false);
  }, []);

  const mapReachabilityColor = useMemo(() => {
    return "#f97316";
  }, []);

  const mapRouteOrigin = useMemo<[number, number] | null>(() => {
    if (myLocationCenter) return myLocationCenter;
    if (addressMapCenter) return addressMapCenter;
    return null;
  }, [addressMapCenter, myLocationCenter]);

  useEffect(() => {
    if (mapReachabilityOrigin) return;
    if (!mapRouteOrigin) return;
    setMapReachabilityOrigin(mapRouteOrigin);
    setMapReachabilityOriginManual(false);
  }, [mapReachabilityOrigin, mapRouteOrigin]);

  const runRoutePlanning = useCallback(async () => {
    if (!mapRouteOrigin) {
      setMapRouteError(t("home.householdMapRouteNeedsOrigin"));
      return;
    }
    if (!mapRouteTarget) {
      setMapRouteError(t("home.householdMapRouteNeedsTarget"));
      return;
    }
    try {
      setMapRouteLoading(true);
      setMapRouteError(null);
      const response = await getHouseholdRoute({
        householdId: household.id,
        fromLat: mapRouteOrigin[0],
        fromLon: mapRouteOrigin[1],
        toLat: mapRouteTarget[0],
        toLon: mapRouteTarget[1],
        maxMinutes: mapRouteMaxMinutes,
        travelMode: mapRouteMode
      });
      setMapRouteGeoJson(response.geojson);
      setMapRouteFitRequestToken(Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : t("home.householdMapRouteError");
      setMapRouteError(message);
    } finally {
      setMapRouteLoading(false);
    }
  }, [household.id, mapRouteMaxMinutes, mapRouteMode, mapRouteOrigin, mapRouteTarget, t]);

  const clearRoutePlanning = useCallback(() => {
    setMapRouteGeoJson(null);
    setMapRouteError(null);
    setMapRouteLoading(false);
  }, []);

  const mapRouteColor = useMemo(() => {
    switch (mapRouteMode) {
      case "walk":
        return "#16a34a";
      case "bike":
        return "#0891b2";
      case "car":
        return "#f97316";
      case "transit":
        return "#7c3aed";
      default:
        return "#0f766e";
    }
  }, [mapRouteMode]);

  const getCurrentPositionOnce = useCallback(
    () =>
      new Promise<{ lat: number; lon: number }>((resolve, reject) => {
        if (typeof window === "undefined" || !("geolocation" in navigator)) {
          reject(new Error("geolocation_unavailable"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
              reject(new Error("geolocation_invalid"));
              return;
            }
            resolve({ lat, lon });
          },
          (error) => reject(error),
          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 15000
          }
        );
      }),
    []
  );

  const stopLiveLocationShareNow = useCallback(async () => {
    if (liveShareHeartbeatTimerRef.current !== null) {
      window.clearInterval(liveShareHeartbeatTimerRef.current);
      liveShareHeartbeatTimerRef.current = null;
    }
    liveShareExpiresAtRef.current = null;
    setLiveShareStatus("stopping");
    setLiveShareError(null);
    try {
      await stopHouseholdLiveLocationShare(household.id, userId);
      setLiveShareStatus("idle");
      await liveLocationsQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.unknownError");
      setLiveShareError(message);
      setLiveShareStatus("error");
    }
  }, [household.id, liveLocationsQuery, t, userId]);

  const startLiveLocationShareNow = useCallback(async () => {
    setLiveShareStatus("starting");
    setLiveShareError(null);
    try {
      const first = await getCurrentPositionOnce();
      const actorName = (currentMember?.display_name ?? "").trim() || null;
      const started = await startHouseholdLiveLocationShare({
        householdId: household.id,
        userId,
        lat: first.lat,
        lon: first.lon,
        durationMinutes: liveShareDurationMinutes,
        actorName
      });
      liveShareExpiresAtRef.current = started.expires_at;
      setLiveShareStatus("active");
      await liveLocationsQuery.refetch();

      if (liveShareHeartbeatTimerRef.current !== null) {
        window.clearInterval(liveShareHeartbeatTimerRef.current);
      }
      liveShareHeartbeatTimerRef.current = window.setInterval(() => {
        void (async () => {
          const expiresAt = liveShareExpiresAtRef.current;
          if (!expiresAt) return;
          const expiresAtMs = Date.parse(expiresAt);
          if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
            await stopLiveLocationShareNow();
            return;
          }

          try {
            const next = await getCurrentPositionOnce();
            await updateHouseholdLiveLocationShare({
              householdId: household.id,
              userId,
              lat: next.lat,
              lon: next.lon,
              expiresAt
            });
            void liveLocationsQuery.refetch();
          } catch {
            // Soft-fail heartbeat updates to avoid interrupting the active share.
          }
        })();
      }, 20_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.unknownError");
      setLiveShareError(message);
      setLiveShareStatus("error");
    }
  }, [
    currentMember?.display_name,
    getCurrentPositionOnce,
    household.id,
    liveLocationsQuery,
    liveShareDurationMinutes,
    stopLiveLocationShareNow,
    t,
    userId
  ]);
  const onConfirmStartLiveShare = useCallback(() => {
    setIsLiveShareDialogOpen(false);
    void startLiveLocationShareNow();
  }, [startLiveLocationShareNow]);
  const onSavePoiOverride = useCallback(
    async (poi: NearbyPoi) => {
      if (!isHouseholdOwner) {
        setPoiOverrideError(t("home.householdMapPoiOverrideOwnerOnly"));
        return;
      }

      const existing = poiOverrideMarkersByRef.get(poi.id);
      const draft = poiOverrideDrafts[poi.id];
      const title = (draft?.title ?? existing?.title ?? poi.name ?? t("home.householdMapPoiUnnamed")).trim();
      if (!title) {
        setPoiOverrideError(t("home.householdMapPoiOverrideTitleRequired"));
        return;
      }

      const description = (draft?.description ?? existing?.description ?? "").trim();
      const nowIso = new Date().toISOString();
      const overrideMarker: HouseholdMapMarker = {
        id: existing?.id ?? `poi:${poi.id}`,
        type: "point",
        icon: getMarkerIconFromPoiCategory(poi.category),
        title,
        description,
        image_b64: existing?.image_b64 ?? null,
        poi_ref: poi.id,
        created_by: existing?.created_by ?? userId,
        created_at: existing?.created_at ?? nowIso,
        last_edited_by: userId,
        last_edited_at: nowIso,
        lat: poi.lat,
        lon: poi.lon
      };

      const nextMarkers = [
        ...household.household_map_markers.filter(
          (marker) => marker.id !== overrideMarker.id && marker.poi_ref !== poi.id
        ),
        overrideMarker
      ];

      try {
        setPoiOverrideSavingId(poi.id);
        setPoiOverrideError(null);
        await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.unknownError");
        setPoiOverrideError(message);
      } finally {
        setPoiOverrideSavingId(null);
      }
    },
    [
      buildHouseholdUpdatePayload,
      household.household_map_markers,
      isHouseholdOwner,
      onUpdateHousehold,
      poiOverrideDrafts,
      poiOverrideMarkersByRef,
      t,
      userId
    ]
  );
  const markerHistoryNode = useCallback(
    (marker: HouseholdMapMarker) => (
      <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <p>
          {t("home.householdMapMarkerHistoryCreatedBy", {
            name: marker.created_by ? mapMemberLabel(marker.created_by) : t("common.memberFallback"),
            at: formatDateTime(marker.created_at, language, marker.created_at)
          })}
        </p>
        <p>
          {t("home.householdMapMarkerHistoryUpdatedBy", {
            name: marker.last_edited_by ? mapMemberLabel(marker.last_edited_by) : t("common.memberFallback"),
            at: formatDateTime(marker.last_edited_at, language, marker.last_edited_at)
          })}
        </p>
      </div>
    ),
    [language, mapMemberLabel, t]
  );
  const buildExternalMapsHref = useCallback((lat: number, lon: number) => {
    const query = `${lat},${lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }, []);
  const renderOpenInMapsButton = useCallback(
    (lat: number, lon: number, compact = false) => (
      <Button
        asChild
        type="button"
        size="sm"
        variant="outline"
        className={compact ? "h-6 px-2 text-[11px]" : "h-7"}
      >
        <a href={buildExternalMapsHref(lat, lon)} target="_blank" rel="noreferrer noopener">
          {t("home.householdMapOpen")}
        </a>
      </Button>
    ),
    [buildExternalMapsHref, t]
  );
  const renderManualHouseholdMarkerPopup = useCallback(
    (marker: HouseholdMapMarker) => {
      const center = getHouseholdMarkerCenter(marker);
      return (
        <Popup>
          <div className="space-y-1">
          <p className="font-semibold">
            {getMarkerEmoji(marker.icon)} {marker.title}
          </p>
          {marker.description ? (
            <div className="prose prose-xs max-w-none text-xs dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{marker.description}</ReactMarkdown>
            </div>
          ) : null}
          {marker.image_b64 ? (
            <img
              src={marker.image_b64}
              alt={marker.title}
              className="max-h-32 w-full rounded object-cover"
            />
          ) : null}
          {isHouseholdOwner ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-7"
              onClick={() => openMarkerEdit(marker)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t("home.householdMapMarkerEditAction")}
            </Button>
          ) : null}
          {center ? renderOpenInMapsButton(center[0], center[1]) : null}
          </div>
        </Popup>
      );
    },
    [isHouseholdOwner, openMarkerEdit, renderOpenInMapsButton, t]
  );
  const editingMarkerMeta = useMemo(
    () =>
      editingMarkerDraft
        ? household.household_map_markers.find((marker) => marker.id === editingMarkerDraft.id) ?? null
        : null,
    [editingMarkerDraft, household.household_map_markers]
  );
  const onMeasuredWithGeoman = useCallback(
    (result: MapMeasureResult) => {
      if (result.mode === "distance" && typeof result.distanceMeters === "number") {
        const value =
          result.distanceMeters >= 1000
            ? `${(result.distanceMeters / 1000).toFixed(2)} km`
            : `${Math.round(result.distanceMeters)} m`;
        setMapMeasureResult(t("home.householdMapMeasureResultDistance", { value }));
        setMapMeasureResultAnchor(result.anchor ?? null);
        return;
      }
      if (result.mode === "area" && typeof result.areaSqm === "number") {
        const value =
          result.areaSqm >= 1000000
            ? `${(result.areaSqm / 1000000).toFixed(2)} km²`
            : `${Math.round(result.areaSqm)} m²`;
        setMapMeasureResult(t("home.householdMapMeasureResultArea", { value }));
        setMapMeasureResultAnchor(result.anchor ?? null);
      }
    },
    [t]
  );
  const clearMeasureResultAndLayer = useCallback(() => {
    setMapMeasureMode(null);
    setMapMeasureResult(null);
    setMapMeasureResultAnchor(null);
    setMapMeasureClearToken((current) => current + 1);
  }, []);
  const dismissMapPanelsOnMapClick = useCallback(() => {
    if (mapRoutePickTargetActive || mapReachabilityPickOriginActive) return;
    setMapReachabilityPanelOpen(false);
    setMapRoutePanelOpen(false);
    setMapMeasurePanelOpen(false);
  }, [mapReachabilityPickOriginActive, mapRoutePickTargetActive]);
  const renderHouseholdMapSurface = useCallback(
    (containerClassName: string, isFullscreen: boolean) => (
      <div className={containerClassName}>
        <div className={`absolute right-2 z-[1000] flex flex-col gap-2 ${isFullscreen ? "bottom-[7.5rem]" : "bottom-2"}`}>
          {isFullscreen ? (
            <Button
              type="button"
              size="sm"
              variant={mapMeasurePanelOpen || mapMeasureMode ? "default" : "outline"}
              className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
              onClick={() => {
                setMapMeasurePanelOpen((current) => !current);
              }}
              aria-label={t("home.householdMapMeasureLabel")}
              title={t("home.householdMapMeasureLabel")}
            >
              <Ruler className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
            onClick={() => setMapRecenterRequestToken((current) => current + 1)}
            aria-label={t("home.householdMapBackToWg")}
            title={t("home.householdMapBackToWg")}
          >
            <House className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
            onClick={requestMyLocation}
            disabled={myLocationStatus === "loading"}
            aria-label={t("home.householdMapMyLocation")}
            title={t("home.householdMapMyLocation")}
          >
            {myLocationStatus === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="absolute right-2 top-2 z-[1000] flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-2 border-slate-200/80 bg-white/95 px-2.5 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>
                  {t("home.calendarFilterAction")} ({selectedPoiCategories.length})
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {POI_CATEGORY_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={poiCategoriesEnabled[option.id]}
                  onCheckedChange={(checked) =>
                    setPoiCategoriesEnabled((current) => ({
                      ...current,
                      [option.id]: Boolean(checked)
                    }))
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{option.emoji}</span>
                    <span>{t(option.labelKey as never)}</span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("home.householdMapManualFilterLabel")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={manualMarkerFilterMode === "all"}
                onCheckedChange={(checked) => {
                  if (!checked) return;
                  setManualMarkerFilterMode("all");
                }}
              >
                {t("home.householdMapManualFilterAll")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={manualMarkerFilterMode === "mine"}
                onCheckedChange={(checked) => {
                  if (!checked) return;
                  setManualMarkerFilterMode("mine");
                }}
              >
                {t("home.householdMapManualFilterMine")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={manualMarkerFilterMode === "none"}
                onCheckedChange={(checked) => {
                  if (!checked) return;
                  setManualMarkerFilterMode("none");
                }}
              >
                {t("home.householdMapManualFilterNone")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("home.householdMapManualFilterByMember")}</DropdownMenuLabel>
              {memberOptionsForMarkerFilter.map((memberOption) => (
                <DropdownMenuCheckboxItem
                  key={memberOption.id}
                  checked={manualMarkerFilterMode === "member" && manualMarkerFilterMemberId === memberOption.id}
                  onCheckedChange={(checked) => {
                    if (!checked) return;
                    setManualMarkerFilterMode("member");
                    setManualMarkerFilterMemberId(memberOption.id);
                  }}
                >
                  {memberOption.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                aria-label={t("home.householdMapStyleLabel")}
                title={t("home.householdMapStyleLabel")}
              >
                {getMapStyleIcon(mapStyle)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {MAP_STYLE_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={mapStyle === option.id}
                  onCheckedChange={(checked) => {
                    if (!checked) return;
                    setMapStyle(option.id);
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    {getMapStyleIcon(option.id)}
                    <span>{t(option.labelKey as never)}</span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("home.householdMapWeatherLayers")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={mapWeatherLayers.radar}
                onCheckedChange={(checked) =>
                  setMapWeatherLayers((current) => ({ ...current, radar: Boolean(checked) }))
                }
              >
                {t("home.householdMapWeatherLayerRadar")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={mapWeatherLayers.warnings}
                onCheckedChange={(checked) =>
                  setMapWeatherLayers((current) => ({ ...current, warnings: Boolean(checked) }))
                }
              >
                {t("home.householdMapWeatherLayerWarnings")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={mapWeatherLayers.lightning}
                onCheckedChange={(checked) =>
                  setMapWeatherLayers((current) => ({ ...current, lightning: Boolean(checked) }))
                }
              >
                {t("home.householdMapWeatherLayerLightning")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {t("home.householdMapWeatherLayersHint")}
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isFullscreen ? (
          <div className="absolute bottom-[7.5rem] left-2 z-[1000] flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              variant={mapRoutePanelOpen ? "default" : "outline"}
              className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
              onClick={() => {
                setMapRoutePanelOpen((current) => !current);
              }}
              aria-label={t("home.householdMapRoute")}
              title={t("home.householdMapRoute")}
            >
              <Route className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mapReachabilityPanelOpen ? "default" : "outline"}
              className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
              onClick={() => {
                setMapReachabilityPanelOpen((current) => !current);
              }}
              aria-label={t("home.householdMapReachability")}
              title={t("home.householdMapReachability")}
            >
              <MapIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <MapContainer
          key={`household-map-${isFullscreen ? "fullscreen" : "inline"}-${mapRenderVersion}`}
          className="domora-map-surface"
          center={mapCenter}
          zoom={mapZoom}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <GeomanEditorBridge
            enabled={isHouseholdOwner && isFullscreen}
            suppressCreate={Boolean(mapMeasureMode)}
            userId={userId}
            defaultTitle={t("home.householdMapMarkerPending")}
            onMarkersChange={onGeomanMarkersChanged}
          />
          <LocateControlBridge
            enabled
            onReady={onLocateControlReady}
            onLocationFound={onLocateControlFound}
            onLocationError={onLocateControlError}
          />
          <GeomanMeasureBridge
            enabled={isFullscreen}
            mode={mapMeasureMode}
            clearToken={mapMeasureClearToken}
            onModeChange={setMapMeasureMode}
            onMeasured={onMeasuredWithGeoman}
          />
          <DwdTimeDimensionBridge
            enabled={isFullscreen}
            layers={mapWeatherLayers}
          />
          <RouteTargetPickBridge
            enabled={isFullscreen && mapRoutePanelOpen && mapRoutePickTargetActive}
            onPick={(lat, lon) => {
              setMapRouteTarget([lat, lon]);
              setMapRoutePickTargetActive(false);
            }}
          />
          <RouteTargetPickBridge
            enabled={isFullscreen && mapReachabilityPanelOpen && mapReachabilityPickOriginActive}
            onPick={(lat, lon) => {
              setMapReachabilityOrigin([lat, lon]);
              setMapReachabilityOriginManual(true);
              setMapReachabilityPickOriginActive(false);
              setMapReachabilityError(null);
            }}
          />
          <MapOverlayDismissBridge
            enabled={isFullscreen}
            onDismiss={dismissMapPanelsOnMapClick}
          />
          <RouteLayerBridge geojson={mapRouteGeoJson} color={mapRouteColor} />
          <RouteFitBoundsBridge geojson={mapRouteGeoJson} requestToken={mapRouteFitRequestToken} />
          <ReachabilityLayerBridge geojson={mapReachabilityGeoJson} color={mapReachabilityColor} />
          <ReachabilityFitBoundsBridge
            geojson={mapReachabilityGeoJson}
            requestToken={mapReachabilityFitRequestToken}
          />
          <AddressMapView center={mapCenter} />
          <RecenterMapOnRequest
            center={mapCenter}
            zoom={mapZoom}
            requestToken={mapRecenterRequestToken}
          />
          {myLocationCenter ? (
            <RecenterMapOnRequest
              center={myLocationCenter}
              zoom={MAP_ZOOM_WITH_ADDRESS}
              requestToken={myLocationRecenterRequestToken}
            />
          ) : null}
          <FullscreenMapViewportBridge
            enabled={isFullscreen}
            onBoundsChange={setMapSearchViewportBounds}
          />
          <MapSearchZoomBridge request={mapSearchZoomRequest} />
          <TileLayer
            key={activeMapStyle.id}
            attribution={activeMapStyle.attribution}
            url={activeMapStyle.tileUrl}
            subdomains={activeMapStyle.subdomains ?? "abc"}
            maxZoom={activeMapStyle.maxZoom}
            updateWhenIdle={false}
            updateWhenZooming
            keepBuffer={4}
            detectRetina
          />
          {mapHasPin ? (
            <Marker position={mapCenter} icon={getManualMarkerIcon("home")} pmIgnore>
              <LeafletTooltip interactive>
                <div
                  className="min-w-[180px] rounded-md border border-white/30 bg-white/92 p-2 text-slate-900 shadow-md dark:border-slate-600/70 dark:bg-slate-900/90 dark:text-slate-100"
                  style={
                    isFullscreen && householdImageUrl
                      ? {
                          backgroundImage: `linear-gradient(rgba(2,6,23,0.45), rgba(2,6,23,0.45)), url("${householdImageUrl}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          color: "#f8fafc"
                        }
                      : undefined
                  }
                >
                  <p className="font-semibold">{household.name}</p>
                  {renderOpenInMapsButton(mapCenter[0], mapCenter[1], true)}
                </div>
              </LeafletTooltip>
            </Marker>
          ) : null}
          {myLocationCenter ? (
            <Marker position={myLocationCenter} pmIgnore>
              <Popup>
                <div className="space-y-1">
                  <p>{t("home.householdMapMyLocation")}</p>
                  {renderOpenInMapsButton(myLocationCenter[0], myLocationCenter[1])}
                </div>
              </Popup>
            </Marker>
          ) : null}
          {otherActiveLiveLocations.map((entry) => (
            <Marker
              key={`live-location-${entry.user_id}`}
              position={[entry.lat, entry.lon]}
              icon={getLiveLocationUserIcon(getMemberAvatarForMap(entry.user_id))}
              pmIgnore
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold">
                    {t("home.householdMapLiveLocationUser", {
                      name: mapMemberLabel(entry.user_id)
                    })}
                  </p>
                  <p className="text-xs">
                    {t("home.householdMapLiveLocationUntil", {
                      at: formatDateTime(entry.expires_at, language, entry.expires_at)
                    })}
                  </p>
                  {renderOpenInMapsButton(entry.lat, entry.lon)}
                </div>
              </Popup>
            </Marker>
          ))}
          {isFullscreen && mapRouteTarget ? (
            <Marker
              key={`route-target-${mapRouteTarget[0]}-${mapRouteTarget[1]}`}
              position={mapRouteTarget}
              icon={getRoutePointMarkerIcon(mapRouteColor)}
              pmIgnore
            >
              <Popup>
                <div className="space-y-1">
                  <p className="text-xs font-semibold">{t("home.householdMapRouteTarget")}</p>
                  {renderOpenInMapsButton(mapRouteTarget[0], mapRouteTarget[1])}
                </div>
              </Popup>
            </Marker>
          ) : null}
          {isFullscreen && mapReachabilityOrigin && mapReachabilityOriginManual ? (
            <Marker
              key={`reachability-origin-${mapReachabilityOrigin[0]}-${mapReachabilityOrigin[1]}`}
              position={mapReachabilityOrigin}
              icon={getRoutePointMarkerIcon(mapReachabilityColor)}
              pmIgnore
            >
              <Popup>
                <div className="space-y-1">
                  <p className="text-xs font-semibold">{t("home.householdMapReachabilityOriginLabel")}</p>
                  {renderOpenInMapsButton(mapReachabilityOrigin[0], mapReachabilityOrigin[1])}
                </div>
              </Popup>
            </Marker>
          ) : null}
          {isFullscreen
            ? mapSearchResults.map((result) => (
                <Marker
                  key={`map-search-marker-${result.id}`}
                  position={[result.lat, result.lon]}
                  icon={getSearchResultMarkerIcon()}
                  pmIgnore
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">{result.label}</p>
                      {renderOpenInMapsButton(result.lat, result.lon)}
                    </div>
                  </Popup>
                </Marker>
              ))
            : null}
          {filteredHouseholdMarkers.map((marker, markerIndex) => {
            const markerRenderKey = `${marker.type}:${marker.id}:${markerIndex}`;
            if (marker.type === "point") {
              return (
                <Marker
                  key={markerRenderKey}
                  position={[marker.lat, marker.lon]}
                  icon={getManualMarkerIcon(marker.icon)}
                  pmIgnore={!isHouseholdOwner}
                  eventHandlers={{
                    add: (event) => {
                      (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                    }
                  }}
                >
                  {marker.poi_ref ? (
                    <Popup>
                      <div className="space-y-2">
                        <p className="font-semibold">
                          {getMarkerEmoji(marker.icon)} {marker.title}
                        </p>
                        <Input
                          value={poiOverrideDrafts[marker.poi_ref]?.title ?? marker.title}
                          onChange={(event) =>
                            setPoiOverrideDrafts((current) => ({
                              ...current,
                              [marker.poi_ref!]: {
                                title: event.target.value,
                                description: current[marker.poi_ref!]?.description ?? marker.description
                              }
                            }))
                          }
                          placeholder={t("home.householdMapPoiOverrideTitlePlaceholder")}
                        />
                        <Input
                          value={poiOverrideDrafts[marker.poi_ref]?.description ?? marker.description}
                          onChange={(event) =>
                            setPoiOverrideDrafts((current) => ({
                              ...current,
                              [marker.poi_ref!]: {
                                title: current[marker.poi_ref!]?.title ?? marker.title,
                                description: event.target.value
                              }
                            }))
                          }
                          placeholder={t("home.householdMapPoiOverrideDescriptionPlaceholder")}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 w-full"
                          onClick={() => {
                            void onSaveExistingPoiOverride(marker);
                          }}
                          disabled={!isHouseholdOwner || poiOverrideSavingId === marker.poi_ref}
                        >
                          {poiOverrideSavingId === marker.poi_ref
                            ? t("home.householdMapPoiOverrideSaving")
                            : t("home.householdMapPoiOverrideSave")}
                        </Button>
                        {marker.image_b64 ? (
                          <img
                            src={marker.image_b64}
                            alt={marker.title}
                            className="max-h-32 w-full rounded object-cover"
                          />
                        ) : null}
                        {marker.description ? (
                          <div className="prose prose-xs max-w-none text-xs dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{marker.description}</ReactMarkdown>
                          </div>
                        ) : null}
                        {renderOpenInMapsButton(marker.lat, marker.lon)}
                      </div>
                    </Popup>
                  ) : (
                    renderManualHouseholdMarkerPopup(marker)
                  )}
                </Marker>
              );
            }

            if (marker.type === "vector") {
              return (
                <Polyline
                  key={markerRenderKey}
                  positions={marker.points.map((point) => [point.lat, point.lon])}
                  pathOptions={{ color: "#0f766e", weight: 5, opacity: 0.85 }}
                  pmIgnore={!isHouseholdOwner}
                  eventHandlers={{
                    add: (event) => {
                      (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                    }
                  }}
                >
                  {renderManualHouseholdMarkerPopup(marker)}
                </Polyline>
              );
            }

            if (marker.type === "circle") {
              return (
                <Circle
                  key={markerRenderKey}
                  center={[marker.center.lat, marker.center.lon]}
                  radius={marker.radius_meters}
                  pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.2, weight: 3 }}
                  pmIgnore={!isHouseholdOwner}
                  eventHandlers={{
                    add: (event) => {
                      (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                    }
                  }}
                >
                  {renderManualHouseholdMarkerPopup(marker)}
                </Circle>
              );
            }

            return (
              <Rectangle
                key={markerRenderKey}
                bounds={[
                  [marker.bounds.south, marker.bounds.west],
                  [marker.bounds.north, marker.bounds.east]
                ]}
                pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.2, weight: 3 }}
                pmIgnore={!isHouseholdOwner}
                eventHandlers={{
                  add: (event) => {
                    (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                  }
                }}
              >
                {renderManualHouseholdMarkerPopup(marker)}
              </Rectangle>
            );
          })}
          {nearbyPois.map((poi) => (
            <Marker key={poi.id} position={[poi.lat, poi.lon]} icon={getPoiMarkerIcon(poi.category)} pmIgnore>
              <Popup>
                  <div className="space-y-1">
                  <p className="font-semibold">
                    {getPoiEmoji(poi.category)} {poi.name ?? t("home.householdMapPoiUnnamed")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    {t(`home.householdMapPoiCategory.${poi.category}` as never)}
                  </p>
                  {typeof poi.tags["addr:street"] === "string" ? (
                    <p className="text-xs">
                      {poi.tags["addr:street"]}
                      {typeof poi.tags["addr:housenumber"] === "string" ? ` ${poi.tags["addr:housenumber"]}` : ""}
                    </p>
                  ) : null}
                  <div className="space-y-1 pt-1">
                    <Input
                      value={
                        poiOverrideDrafts[poi.id]?.title
                        ?? poiOverrideMarkersByRef.get(poi.id)?.title
                        ?? (poi.name ?? "")
                      }
                      onChange={(event) =>
                        setPoiOverrideDrafts((current) => ({
                          ...current,
                          [poi.id]: {
                            title: event.target.value,
                            description:
                              current[poi.id]?.description
                              ?? poiOverrideMarkersByRef.get(poi.id)?.description
                              ?? ""
                          }
                        }))
                      }
                      placeholder={t("home.householdMapPoiOverrideTitlePlaceholder")}
                    />
                    <Input
                      value={
                        poiOverrideDrafts[poi.id]?.description
                        ?? poiOverrideMarkersByRef.get(poi.id)?.description
                        ?? ""
                      }
                      onChange={(event) =>
                        setPoiOverrideDrafts((current) => ({
                          ...current,
                          [poi.id]: {
                            title:
                              current[poi.id]?.title
                              ?? poiOverrideMarkersByRef.get(poi.id)?.title
                              ?? poi.name
                              ?? "",
                            description: event.target.value
                          }
                        }))
                      }
                      placeholder={t("home.householdMapPoiOverrideDescriptionPlaceholder")}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 w-full"
                      onClick={() => {
                        void onSavePoiOverride(poi);
                      }}
                      disabled={!isHouseholdOwner || poiOverrideSavingId === poi.id}
                    >
                      {poiOverrideSavingId === poi.id
                        ? t("home.householdMapPoiOverrideSaving")
                        : t("home.householdMapPoiOverrideSave")}
                    </Button>
                    {renderOpenInMapsButton(poi.lat, poi.lon)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          {isFullscreen && mapMeasureResult && mapMeasureResultAnchor ? (
            <Marker
              position={mapMeasureResultAnchor}
              icon={mapMeasureAnchorIcon}
              interactive={false}
              pmIgnore
            >
              <LeafletTooltip
                permanent
                direction="top"
                offset={[0, -10]}
                opacity={1}
                className="domora-measure-result-tooltip"
              >
                {mapMeasureResult}
              </LeafletTooltip>
            </Marker>
          ) : null}
        </MapContainer>
        {isFullscreen ? (
          <div className="absolute bottom-2 left-1/2 z-[1000] w-[min(560px,calc(100%-1rem))] -translate-x-1/2">
            <div className="rounded-xl z-100 border border-slate-200/85 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" />
                <Input
                  value={mapSearchQuery}
                  onChange={(event) => setMapSearchQuery(event.target.value)}
                  onFocus={() => setMapSearchInputFocused(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setMapSearchInputFocused(false);
                    }, 120);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (mapSearchResults.length === 0) return;
                    applyMapSearchResult(mapSearchResults[0]!);
                  }}
                  placeholder={t("home.householdMapSearchPlaceholder")}
                  className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
              {mapSearchInputFocused && mapSearchLoading ? (
                <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">{t("home.householdMapSearchLoading")}</p>
              ) : null}
              {mapSearchInputFocused && !mapSearchLoading && mapSearchError ? (
                <p className="pt-1 text-xs text-rose-600 dark:text-rose-400">{mapSearchError}</p>
              ) : null}
              {mapSearchInputFocused && !mapSearchLoading && !mapSearchError && mapSearchQuery.trim().length >= 2 && mapSearchResults.length === 0 ? (
                <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">{t("home.householdMapSearchEmpty")}</p>
              ) : null}
              {mapSearchInputFocused && mapSearchResults.length > 0 ? (
                <div className="mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                  {mapSearchResults.map((result) => (
                    <button
                      key={`map-search-result-${result.id}`}
                      type="button"
                      className="flex w-full items-start gap-2 border-b border-slate-200/80 px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100/80 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800/80 last:border-b-0"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => applyMapSearchResult(result)}
                    >
                      <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="line-clamp-2">{result.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {isFullscreen && mapReachabilityPanelOpen ? (
          <div className="absolute bottom-2 left-2 right-2 z-[1100] rounded-xl border border-slate-200/85 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 sm:bottom-[11rem] sm:right-auto sm:w-[min(320px,calc(100%-1rem))]">
            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-2 items-center gap-2">
                <Label className="text-xs">{t("home.householdMapReachabilityModeLabel")}</Label>
                <Select
                  value={mapReachabilityMode}
                  onValueChange={(value) => setMapReachabilityMode(value as MapReachabilityMode)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REACHABILITY_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {t(option.labelKey as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 items-center gap-2">
                <Label className="text-xs" htmlFor="map-reachability-minutes">
                  {t("home.householdMapReachabilityDurationLabel")}
                </Label>
                <Input
                  id="map-reachability-minutes"
                  type="number"
                  min={1}
                  max={180}
                  step={1}
                  value={String(mapReachabilityMinutes)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    setMapReachabilityMinutes(Math.max(1, Math.min(180, Math.round(parsed))));
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {mapReachabilityOrigin
                  ? t("home.householdMapReachabilityOriginReady", {
                      lat: mapReachabilityOrigin[0].toFixed(5),
                      lon: mapReachabilityOrigin[1].toFixed(5)
                    })
                  : t("home.householdMapReachabilityNeedsOrigin")}
              </div>
              <Button
                type="button"
                size="sm"
                variant={mapReachabilityPickOriginActive ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setMapReachabilityPickOriginActive((current) => !current);
                }}
              >
                {mapReachabilityPickOriginActive
                  ? t("home.householdMapReachabilityPickOriginActive")
                  : t("home.householdMapReachabilityPickOrigin")}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => {
                    void runReachability();
                  }}
                  disabled={mapReachabilityLoading}
                >
                  {mapReachabilityLoading ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {t("home.householdMapReachabilityRun")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={clearReachability}
                  disabled={mapReachabilityLoading && !mapReachabilityGeoJson}
                >
                  {t("home.householdMapReachabilityClear")}
                </Button>
              </div>
              {mapReachabilityError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{mapReachabilityError}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {isFullscreen && mapMeasurePanelOpen ? (
          <div className="absolute bottom-[11rem] right-2 z-[1000] w-[min(280px,calc(100%-1rem))] rounded-xl border border-slate-200/85 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95">
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                size="sm"
                variant={mapMeasureMode === "distance" ? "default" : "outline"}
                className="h-8 justify-start"
                onClick={() => {
                  setMapMeasureResult(null);
                  setMapMeasureResultAnchor(null);
                  setMapMeasureClearToken((current) => current + 1);
                  setMapMeasureMode((current) => (current === "distance" ? null : "distance"));
                }}
              >
                <Ruler className="mr-2 h-4 w-4" />
                {t("home.householdMapMeasureDistance")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mapMeasureMode === "area" ? "default" : "outline"}
                className="h-8 justify-start"
                onClick={() => {
                  setMapMeasureResult(null);
                  setMapMeasureResultAnchor(null);
                  setMapMeasureClearToken((current) => current + 1);
                  setMapMeasureMode((current) => (current === "area" ? null : "area"));
                }}
              >
                <CircleDot className="mr-2 h-4 w-4" />
                {t("home.householdMapMeasureArea")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 justify-start"
                onClick={() => {
                  clearMeasureResultAndLayer();
                }}
              >
                <X className="mr-2 h-4 w-4" />
                {t("home.householdMapMeasureClear")}
              </Button>
            </div>
          </div>
        ) : null}
        {isFullscreen && mapRoutePanelOpen ? (
          <div className="absolute bottom-2 left-2 right-2 z-[1100] rounded-xl border border-slate-200/85 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 sm:bottom-[11rem] sm:left-auto sm:w-[min(340px,calc(100%-1rem))]">
            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-2 items-center gap-2">
                <Label className="text-xs">{t("home.householdMapRouteModeLabel")}</Label>
                <Select
                  value={mapRouteMode}
                  onValueChange={(value) => setMapRouteMode(value as MapReachabilityMode)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REACHABILITY_OPTIONS.map((option) => (
                      <SelectItem key={`route-mode-${option.id}`} value={option.id}>
                        {t(option.labelKey as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 items-center gap-2">
                <Label className="text-xs" htmlFor="map-route-max-minutes">
                  {t("home.householdMapRouteMaxDurationLabel")}
                </Label>
                <Input
                  id="map-route-max-minutes"
                  type="number"
                  min={1}
                  max={240}
                  step={1}
                  value={String(mapRouteMaxMinutes)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    setMapRouteMaxMinutes(Math.max(1, Math.min(240, Math.round(parsed))));
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {mapRouteOrigin ? t("home.householdMapRouteOriginReady") : t("home.householdMapRouteNeedsOrigin")}
              </div>
              <Button
                type="button"
                size="sm"
                variant={mapRoutePickTargetActive ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setMapRoutePickTargetActive((current) => !current);
                }}
              >
                {mapRoutePickTargetActive
                  ? t("home.householdMapRoutePickTargetActive")
                  : t("home.householdMapRoutePickTarget")}
              </Button>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {mapRouteTarget
                  ? t("home.householdMapRouteTargetReady", {
                      lat: mapRouteTarget[0].toFixed(5),
                      lon: mapRouteTarget[1].toFixed(5)
                    })
                  : t("home.householdMapRouteNeedsTarget")}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => {
                    void runRoutePlanning();
                  }}
                  disabled={mapRouteLoading}
                >
                  {mapRouteLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {t("home.householdMapRouteRun")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    clearRoutePlanning();
                    setMapRouteTarget(null);
                    setMapRoutePickTargetActive(false);
                  }}
                  disabled={mapRouteLoading && !mapRouteGeoJson}
                >
                  {t("home.householdMapRouteClear")}
                </Button>
              </div>
              {mapRouteError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{mapRouteError}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    ),
    [
      activeMapStyle.attribution,
      activeMapStyle.id,
      activeMapStyle.maxZoom,
      activeMapStyle.subdomains,
      activeMapStyle.tileUrl,
      addressInput,
      addressMapLabel,
      filteredHouseholdMarkers,
      mapCenter,
      mapHasPin,
      mapRecenterRequestToken,
      mapZoom,
      manualMarkerFilterMemberId,
      manualMarkerFilterMode,
      mapMeasureMode,
      mapMeasureResult,
      mapMeasureResultAnchor,
      mapRenderVersion,
      mapRouteColor,
      mapRouteError,
      mapRouteFitRequestToken,
      mapRouteGeoJson,
      mapRouteLoading,
      mapRouteMaxMinutes,
      mapRouteMode,
      mapRouteOrigin,
      mapRoutePanelOpen,
      mapRoutePickTargetActive,
      mapRouteTarget,
      mapWeatherLayers,
      mapMeasurePanelOpen,
      dismissMapPanelsOnMapClick,
      mapReachabilityColor,
      mapReachabilityError,
      mapReachabilityFitRequestToken,
      mapReachabilityGeoJson,
      mapReachabilityLoading,
      mapReachabilityMinutes,
      mapReachabilityMode,
      mapReachabilityOrigin,
      mapReachabilityPickOriginActive,
      mapReachabilityPanelOpen,
      mapSearchError,
      mapSearchInputFocused,
      mapSearchLoading,
      mapSearchQuery,
      mapSearchResults,
      mapSearchZoomRequest,
      memberOptionsForMarkerFilter,
      renderOpenInMapsButton,
      mapMemberLabel,
      myLocationCenter,
      myLocationRecenterRequestToken,
      myLocationStatus,
      otherActiveLiveLocations,
      nearbyPois,
      onGeomanMarkersChanged,
      onLocateControlError,
      onLocateControlFound,
      onLocateControlReady,
      onMeasuredWithGeoman,
      clearMeasureResultAndLayer,
      clearReachability,
      clearRoutePlanning,
      cancelMapDeletion,
      confirmMapDeletion,
      applyMapSearchResult,
      onSaveExistingPoiOverride,
      onSavePoiOverride,
      poiOverrideDrafts,
      poiOverrideMarkersByRef,
      poiOverrideSavingId,
      requestMyLocation,
      runReachability,
      runRoutePlanning,
      selectedPoiCategories.length,
      isHouseholdOwner,
      language,
      t,
      userId
    ]
  );

  useEffect(() => {
    ensureLeafletMarkerIcon();
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`whiteboard-online-${household.id}`, {
      config: { presence: { key: userId } }
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ user_id?: string }>();
      const nextUserIds = new Set<string>();
      Object.values(state).forEach((entries) => {
        entries.forEach((entry) => {
          if (typeof entry.user_id === "string" && entry.user_id.length > 0) {
            nextUserIds.add(entry.user_id);
          }
        });
      });
      setWhiteboardOnlineUserIds(Array.from(nextUserIds));
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: userId,
        household_id: household.id,
        online_at: new Date().toISOString()
      });
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
      setWhiteboardOnlineUserIds([]);
    };
  }, [household.id, userId]);

  useEffect(() => {
    if (myActiveLiveLocation) {
      liveShareExpiresAtRef.current = myActiveLiveLocation.expires_at;
      setLiveShareStatus("active");
      return;
    }
    liveShareExpiresAtRef.current = null;
    if (liveShareStatus === "active") {
      setLiveShareStatus("idle");
    }
  }, [liveShareStatus, myActiveLiveLocation]);

  useEffect(() => () => {
    if (mapMarkerSaveTimerRef.current !== null) {
      window.clearTimeout(mapMarkerSaveTimerRef.current);
    }
    if (liveShareHeartbeatTimerRef.current !== null) {
      window.clearInterval(liveShareHeartbeatTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const query = addressInput.trim();
    if (query.length < MIN_ADDRESS_LENGTH_FOR_GEOCODE) {
      setAddressMapCenter(null);
      setAddressMapLabel(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
          const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal
          });
          if (!response.ok) throw new Error("geocode_failed");
          const payload = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
          const first = payload[0];
          const lat = first?.lat ? Number(first.lat) : Number.NaN;
          const lon = first?.lon ? Number(first.lon) : Number.NaN;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          if (!active) return;
          setAddressMapCenter([lat, lon]);
          setAddressMapLabel(first?.display_name?.trim() || query);
        } catch {
          if (!active || controller.signal.aborted) return;
          setAddressMapCenter(null);
          setAddressMapLabel(null);
        }
      })();
    }, ADDRESS_GEOCODE_DEBOUNCE_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addressInput]);
  const insertTextPlaceholder = t("home.widgetTextPlaceholder");
  const insertTextBeforeLabel = t("home.widgetInsertTextBefore");
  const insertTextAfterLabel = t("home.widgetInsertTextAfter");
  const memberLabel = useMemo(
    () =>
      createMemberLabelGetter({
        members,
        currentUserId: userId,
        youLabel: t("common.you"),
        youLabels: {
          nominative: t("common.youNominative"),
          dative: t("common.youDative"),
          accusative: t("common.youAccusative")
        },
        fallbackLabel: t("common.memberFallback")
      }),
    [members, t, userId]
  );
  const whiteboardOnlineMembers = useMemo(
    () => members.filter((member) => whiteboardOnlineUserIds.includes(member.user_id)),
    [members, whiteboardOnlineUserIds]
  );
  const dueTasksCount = useMemo(() => {
    const now = Date.now();
    return tasks.filter((task) => task.is_active && !task.done && new Date(task.due_at).getTime() <= now).length;
  }, [tasks]);
  const dueTasksForYou = useMemo(() => {
    const now = Date.now();
    return tasks.filter(
      (task) => task.is_active && !task.done && task.assignee_id === userId && new Date(task.due_at).getTime() <= now
    );
  }, [tasks, userId]);
  const openTasksCount = useMemo(() => tasks.filter((task) => task.is_active && !task.done).length, [tasks]);
  const lastCashAuditAt = useMemo(() => {
    if (cashAuditRequests.length === 0) return null;
    return [...cashAuditRequests]
      .map((entry) => entry.created_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  }, [cashAuditRequests]);
  const settlementEntries = useMemo(() => {
    if (!lastCashAuditAt) return financeEntries;
    const auditDay = lastCashAuditAt.slice(0, 10);
    return financeEntries.filter((entry) => {
      const day = entry.entry_date || entry.created_at.slice(0, 10);
      return day > auditDay;
    });
  }, [financeEntries, lastCashAuditAt]);
  const financeBalances = useMemo(
    () => calculateBalancesByMember(settlementEntries, members.map((entry) => entry.user_id)),
    [members, settlementEntries]
  );
  const yourBalance = useMemo(
    () => financeBalances.find((entry) => entry.memberId === userId)?.balance ?? 0,
    [financeBalances, userId]
  );
  const householdOpenBalance = useMemo(
    () => financeBalances.filter((entry) => entry.balance > 0).reduce((sum, entry) => sum + entry.balance, 0),
    [financeBalances]
  );
  const formatMoney = useMemo(
    () => (amount: number) =>
      new Intl.NumberFormat(language, {
        style: "currency",
        currency: household.currency || "EUR"
      }).format(amount),
    [household.currency, language]
  );
  const monthlyExpenseRows = useMemo(() => {
    const byMonth = new Map<string, { total: number; categories: Map<string, number> }>();
    financeEntries.forEach((entry) => {
      const day = entry.entry_date || entry.created_at.slice(0, 10);
      const month = day.slice(0, 7);
      const bucket = byMonth.get(month) ?? { total: 0, categories: new Map<string, number>() };
      bucket.total += entry.amount;
      const currentCategoryTotal = bucket.categories.get(entry.category) ?? 0;
      bucket.categories.set(entry.category, currentCategoryTotal + entry.amount);
      byMonth.set(month, bucket);
    });

    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 4)
      .map(([month, data]) => {
        const categories = [...data.categories.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category, value]) => ({ category, value }));
        return { month, total: data.total, categories };
      });
  }, [financeEntries]);
  const labelForUserId = useCallback(
    (memberId: string | null) => (memberId ? memberLabel(memberId) : t("common.memberFallback")),
    [memberLabel, t]
  );
  const calendarWeekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2026, 0, 5));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(monday.getTime() + index * 86400000))
    );
  }, [language]);
  const calendarMonthCells = useMemo(() => buildMonthGrid(calendarMonthDate), [calendarMonthDate]);
  const calendarMonthTitle = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(calendarMonthDate),
    [calendarMonthDate, language]
  );
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const parseDateOnly = useCallback((value: string) => {
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);
  const addDays = useCallback((date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }, []);
  const calendarMonthRange = useMemo(() => {
    const firstDate = calendarMonthCells[0]?.date;
    const lastDate = calendarMonthCells[calendarMonthCells.length - 1]?.date;
    if (!firstDate || !lastDate) return null;
    return {
      start: new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()),
      end: new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate())
    };
  }, [calendarMonthCells]);
  const visibleCalendarDayKeys = useMemo(
    () => new Set(calendarMonthCells.map((cell) => dayKey(cell.date))),
    [calendarMonthCells]
  );
  const calendarVacationRanges = useMemo<HomeCalendarVacationEntry[]>(() => {
    const ranges: HomeCalendarVacationEntry[] = [];
    memberVacations.forEach((vacation) => {
      ranges.push({
        id: vacation.id,
        userId: vacation.user_id,
        startDate: vacation.start_date,
        endDate: vacation.end_date,
        note: vacation.note ?? null
      });
    });
    const vacationEvents = householdEvents
      .filter(
        (event) =>
          event.event_type === "vacation_mode_enabled" || event.event_type === "vacation_mode_disabled"
      )
      .filter((event) => Boolean(event.actor_user_id))
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return aTime - bTime;
      });
    const openByUser = new Map<string, string>();
    vacationEvents.forEach((event) => {
      const userId = event.actor_user_id;
      if (!userId) return;
      const eventDate = new Date(event.created_at).toISOString().slice(0, 10);
      if (event.event_type === "vacation_mode_enabled") {
        if (!openByUser.has(userId)) {
          openByUser.set(userId, eventDate);
        }
        return;
      }
      const startDate = openByUser.get(userId);
      if (!startDate) return;
      ranges.push({
        id: `manual-${userId}-${startDate}`,
        userId,
        startDate,
        endDate: eventDate,
        note: null,
        manual: true
      });
      openByUser.delete(userId);
    });
    members.forEach((member) => {
      if (!member.vacation_mode) return;
      if (!openByUser.has(member.user_id)) {
        openByUser.set(member.user_id, todayIso);
      }
    });
    openByUser.forEach((startDate, userId) => {
      ranges.push({
        id: `manual-${userId}-${startDate}`,
        userId,
        startDate,
        endDate: todayIso,
        note: null,
        manual: true
      });
    });
    return ranges;
  }, [householdEvents, memberVacations, members, todayIso]);
  const homeCalendarEntries = useMemo(() => {
    const map = new Map<string, HomeCalendarEntry>();
    const ensureEntry = (key: string) => {
      const current = map.get(key);
      if (current) return current;
      const next: HomeCalendarEntry = {
        cleaningDueTasks: [],
        taskCompletions: [],
        financeEntries: [],
        bucketVotes: [],
        shoppingEntries: [],
        cashAudits: [],
        vacations: []
      };
      map.set(key, next);
      return next;
    };
    const normalizeText = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const isCleaningTask = (task: TaskItem) => {
      const candidate = `${task.title} ${task.description || ""}`.trim();
      if (!candidate) return false;
      const suggested = suggestCategoryLabel(candidate, language);
      if (suggested === "Reinigung" || suggested === "Cleaning") return true;
      const normalized = normalizeText(candidate);
      return /(?:\bputz|\breinig|\bclean|\bwisch|\bbad\b|\bkueche\b|\bküche\b|\bfenster\b|\bboden\b)/.test(normalized);
    };
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayKey = dayKey(todayStart);
    const overdueTaskIds = new Set<string>();
    const taskOccurrenceKeys = new Set<string>();

    if (featureFlags.tasks) {
      tasks.forEach((task) => {
        if (!task.is_active) return;
        if (!isCleaningTask(task)) return;
        const dueAt = new Date(task.due_at);
        if (Number.isNaN(dueAt.getTime())) return;
        const isOverdue = dueAt.getTime() < todayStart.getTime();
        const dueKey = dayKey(dueAt);
        const key = isOverdue ? todayKey : dueKey;
        const status = isOverdue ? "overdue" : dueKey === todayKey ? "due" : "upcoming";
        const occurrenceKey = `${task.id}:${key}`;
        if (!taskOccurrenceKeys.has(occurrenceKey)) {
          ensureEntry(key).cleaningDueTasks.push({ task, status });
          taskOccurrenceKeys.add(occurrenceKey);
        }
        if (isOverdue) {
          overdueTaskIds.add(task.id);
        }

        const intervalDays = Math.max(1, Math.floor(task.frequency_days || 0));
        if (intervalDays > 0) {
          let occurrences = 0;
          let cursor = dueAt;
          let safety = 0;
          while (occurrences < 2 && safety < 20) {
            safety += 1;
            cursor = addDays(cursor, intervalDays);
            if (cursor.getTime() < todayStart.getTime()) {
              continue;
            }
            const nextKey = dayKey(cursor);
            const nextStatus = nextKey === todayKey ? "due" : "upcoming";
            const nextOccurrenceKey = `${task.id}:${nextKey}`;
            if (taskOccurrenceKeys.has(nextOccurrenceKey)) {
              continue;
            }
            ensureEntry(nextKey).cleaningDueTasks.push({ task, status: nextStatus });
            taskOccurrenceKeys.add(nextOccurrenceKey);
            occurrences += 1;
          }
        }
      });

      taskCompletions.forEach((completion) => {
        const completedAt = new Date(completion.completed_at);
        if (Number.isNaN(completedAt.getTime())) return;
        const key = dayKey(completedAt);
        if (key === todayKey && overdueTaskIds.has(completion.task_id)) {
          return;
        }
        ensureEntry(key).taskCompletions.push(completion);
      });
    }

    if (featureFlags.finances) {
      financeEntries.forEach((entry) => {
        const day = entry.entry_date || entry.created_at.slice(0, 10);
        const parsed = parseDateOnly(day);
        if (!parsed) return;
        if (parsed.getTime() > todayStart.getTime()) return;
        const key = dayKey(parsed);
        ensureEntry(key).financeEntries.push(entry);
      });

      cashAuditRequests.forEach((entry) => {
        const parsed = new Date(entry.created_at);
        if (Number.isNaN(parsed.getTime())) return;
        const key = dayKey(parsed);
        ensureEntry(key).cashAudits.push(entry);
      });
    }

    if (featureFlags.bucket) {
      bucketItems.forEach((item) => {
        if (item.done) return;
        const votesByDate = item.votes_by_date ?? {};
        item.suggested_dates.forEach((date) => {
          const voters = votesByDate[date] ?? [];
          if (voters.length === 0) return;
          const parsed = parseDateOnly(date);
          if (!parsed) return;
          const key = dayKey(parsed);
          ensureEntry(key).bucketVotes.push({ item, date, voters });
        });
      });
    }

    if (featureFlags.shopping) {
      householdEvents.forEach((entry) => {
        if (entry.event_type !== "shopping_completed") return;
        const createdAt = new Date(entry.created_at);
        if (Number.isNaN(createdAt.getTime())) return;
        const payload = entry.payload ?? {};
        const title = String(payload.title ?? "").trim();
        const key = dayKey(createdAt);
        ensureEntry(key).shoppingEntries.push({
          id: entry.id,
          title: title || t("shopping.title"),
          userId: entry.actor_user_id,
          at: entry.created_at
        });
      });
    }

    const visibleDayKeys = visibleCalendarDayKeys;

    calendarVacationRanges.forEach((vacation) => {
      const start = parseDateOnly(vacation.startDate);
      const end = parseDateOnly(vacation.endDate);
      if (!start || !end) return;
      let cursor = start;
      let safety = 0;
      while (cursor.getTime() <= end.getTime() && safety < 500) {
        safety += 1;
        const key = dayKey(cursor);
        if (visibleDayKeys.has(key)) {
          ensureEntry(key).vacations.push(vacation);
        }
        cursor = addDays(cursor, 1);
      }
    });

    return map;
  }, [
    bucketItems,
    calendarMonthCells,
    calendarVacationRanges,
    cashAuditRequests,
    featureFlags,
    financeEntries,
    householdEvents,
    language,
    parseDateOnly,
    taskCompletions,
    tasks,
    t,
    visibleCalendarDayKeys,
    addDays
  ]);
  const getCalendarCounts = useCallback(
    (entry: HomeCalendarEntry | undefined) => {
      const showCleaning = calendarFilters.cleaning && featureFlags.tasks;
      const showTasksCompleted = calendarFilters.tasksCompleted && featureFlags.tasks;
      const showFinances = calendarFilters.finances && featureFlags.finances;
      const showCashAudits = calendarFilters.cashAudits && featureFlags.finances;
      const showBucketVotes = calendarFilters.bucket && featureFlags.bucket;
      const showShopping = calendarFilters.shopping && featureFlags.shopping;
      const showVacations = calendarFilters.vacations;

      const cleaningDueTasks = showCleaning ? entry?.cleaningDueTasks ?? [] : [];
      const cleaningCount = cleaningDueTasks.length;
      const criticalCleaningCount = cleaningDueTasks.filter((taskEntry) => taskEntry.status !== "upcoming").length;
      const completionCount = showTasksCompleted ? entry?.taskCompletions.length ?? 0 : 0;
      const financeCount = showFinances ? entry?.financeEntries.length ?? 0 : 0;
      const cashAuditCount = showCashAudits ? entry?.cashAudits.length ?? 0 : 0;
      const bucketCount = showBucketVotes ? entry?.bucketVotes.length ?? 0 : 0;
      const shoppingCount = showShopping ? entry?.shoppingEntries.length ?? 0 : 0;
      const vacationCount = showVacations ? entry?.vacations.length ?? 0 : 0;
      const totalCount =
        cleaningCount + completionCount + financeCount + cashAuditCount + bucketCount + shoppingCount + vacationCount;

      return {
        cleaningDueTasks,
        cleaningCount,
        criticalCleaningCount,
        completionCount,
        financeCount,
        cashAuditCount,
        bucketCount,
        shoppingCount,
        vacationCount,
        totalCount,
        showCleaning,
        showTasksCompleted,
        showFinances,
        showCashAudits,
        showBucketVotes,
        showShopping,
        showVacations
      };
    },
    [calendarFilters, featureFlags]
  );
  const vacationSpansByDay = useMemo(() => {
    const map = new Map<string, HomeCalendarVacationSpan[]>();
    if (!calendarMonthRange) return map;
    const visibleStart = calendarMonthRange.start;
    const visibleEnd = calendarMonthRange.end;

    calendarVacationRanges.forEach((vacation) => {
      const start = parseDateOnly(vacation.startDate);
      const end = parseDateOnly(vacation.endDate);
      if (!start || !end) return;
      const rangeStart = start.getTime() < visibleStart.getTime() ? visibleStart : start;
      const rangeEnd = end.getTime() > visibleEnd.getTime() ? visibleEnd : end;
      if (rangeStart.getTime() > rangeEnd.getTime()) return;
      const startKey = dayKey(rangeStart);
      const endKey = dayKey(rangeEnd);
      let cursor = rangeStart;
      let safety = 0;
      while (cursor.getTime() <= rangeEnd.getTime() && safety < 500) {
        safety += 1;
        const key = dayKey(cursor);
        if (!visibleCalendarDayKeys.has(key)) {
          cursor = addDays(cursor, 1);
          continue;
        }
        const kind =
          startKey === endKey
            ? "single"
            : key === startKey
              ? "start"
              : key === endKey
                ? "end"
                : "middle";
        const entry = map.get(key) ?? [];
        entry.push({ ...vacation, kind });
        map.set(key, entry);
        cursor = addDays(cursor, 1);
      }
    });
    return map;
  }, [
    addDays,
    calendarMonthRange,
    calendarVacationRanges,
    parseDateOnly,
    visibleCalendarDayKeys
  ]);
  const isCalendarDense = useMemo(() => isCalendarMobile, [isCalendarMobile]);
  const renderDenseStack = useCallback((count: number, colorClass: string) => {
    if (count <= 0) return null;
    const stackCount = Math.min(count, 5);
    return (
      <span className="flex items-center -space-x-1">
        {Array.from({ length: stackCount }).map((_, index) => (
          <span
            key={`${colorClass}-${index}`}
            className={`h-2 w-2 rounded-full ${colorClass} ring-1 ring-white dark:ring-slate-900`}
          />
        ))}
      </span>
    );
  }, []);
  const taskFairness = useMemo(() => {
    const memberIds = [...new Set(members.map((entry) => entry.user_id))];
    if (memberIds.length === 0) {
      return {
        overallScore: 100,
        rows: [] as Array<{ memberId: string; score: number; completions: number }>
      };
    }

    const completionsByUser = new Map<string, number>();
    taskCompletions.forEach((entry) => {
      completionsByUser.set(entry.user_id, (completionsByUser.get(entry.user_id) ?? 0) + 1);
    });
    const totalCompletions = memberIds.reduce((sum, memberId) => sum + (completionsByUser.get(memberId) ?? 0), 0);
    const expected = totalCompletions > 0 ? totalCompletions / memberIds.length : 0;

    const rows = memberIds.map((memberId) => {
      const completions = completionsByUser.get(memberId) ?? 0;
      if (expected <= 0) {
        return { memberId, score: 100, completions };
      }
      const deviation = Math.abs(completions - expected) / expected;
      const score = Math.max(0, Math.round((1 - Math.min(1, deviation)) * 100));
      return { memberId, score, completions };
    });

    const overallScore = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 100;
    return { overallScore, rows: rows.sort((a, b) => b.score - a.score) };
  }, [members, taskCompletions]);
  const taskReliability = useMemo(() => {
    const memberIds = [...new Set(members.map((entry) => entry.user_id))];
    if (memberIds.length === 0) {
      return {
        overallScore: 100,
        rows: [] as Array<{ memberId: string; score: number; averageDelayMinutes: number }>
      };
    }

    const delaysByUser = new Map<string, { total: number; count: number }>();
    taskCompletions.forEach((entry) => {
      const current = delaysByUser.get(entry.user_id) ?? { total: 0, count: 0 };
      delaysByUser.set(entry.user_id, {
        total: current.total + Math.max(0, entry.delay_minutes ?? 0),
        count: current.count + 1
      });
    });

    const rows = memberIds.map((memberId) => {
      const stats = delaysByUser.get(memberId) ?? { total: 0, count: 0 };
      const averageDelayMinutes = stats.count > 0 ? stats.total / stats.count : 0;
      return { memberId, averageDelayMinutes, score: 100 };
    });

    const maxAverageDelay = Math.max(0, ...rows.map((row) => row.averageDelayMinutes));
    rows.forEach((row) => {
      if (maxAverageDelay <= 0) {
        row.score = 100;
      } else {
        const ratio = row.averageDelayMinutes / maxAverageDelay;
        row.score = Math.max(0, Math.round((1 - Math.min(1, ratio)) * 100));
      }
    });

    const overallScore =
      rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 100;
    return {
      overallScore,
      rows: rows.sort((a, b) => b.score - a.score)
    };
  }, [members, taskCompletions]);
  const lastMonthRange = useMemo(() => getLastMonthRange(), []);
  const memberOfMonth = useMemo(
    () => getMemberOfMonth(taskCompletions, lastMonthRange),
    [lastMonthRange, taskCompletions]
  );
  const memberOfMonthProfile = useMemo(
    () => (memberOfMonth ? members.find((entry) => entry.user_id === memberOfMonth.userId) ?? null : null),
    [memberOfMonth, members]
  );
  const memberOfMonthLabel = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(lastMonthRange.start),
    [language, lastMonthRange]
  );
  const recentActivity = useMemo(() => {
    type ActivityItem = {
      id: string;
      at: string;
      icon: "task" | "shopping" | "finance" | "audit";
      text: string;
      navigateTo?: "/tasks/overview" | "/home/summary";
    };
    return householdEvents
      .map((entry): ActivityItem => {
        const payload = entry.payload ?? {};
        if (entry.event_type === "task_completed") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
            text: t("home.activityTaskCompleted", {
              user: labelForUserId(entry.actor_user_id),
              task: String(payload.title ?? t("tasks.fallbackTitle"))
            }),
            navigateTo: "/tasks/overview"
          };
        }

        if (entry.event_type === "task_skipped") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
            text: t("home.activityTaskSkipped", {
              user: labelForUserId(entry.actor_user_id),
              task: String(payload.title ?? t("tasks.fallbackTitle"))
            }),
            navigateTo: "/tasks/overview"
          };
        }

        if (entry.event_type === "task_rated") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
            text: t("home.activityTaskRated", {
              user: labelForUserId(entry.actor_user_id),
              task: String(payload.title ?? t("tasks.fallbackTitle")),
              rating: String(payload.rating ?? "")
            }),
            navigateTo: "/tasks/overview"
          };
        }

        if (entry.event_type === "shopping_completed") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "shopping",
              text: t("home.activityShoppingCompleted", {
              item: String(payload.title ?? ""),
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "finance_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityFinanceCreated", {
              name: String(payload.description ?? ""),
              amount: Number(payload.amount ?? 0).toFixed(2)
            })
          };
        }

        if (entry.event_type === "cash_audit_requested") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityCashAudit", {
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "admin_hint") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: String(payload.message ?? t("home.activityAdminHintFallback"))
          };
        }

        if (entry.event_type === "pimpers_reset") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityPimpersReset", {
              user: labelForUserId(entry.actor_user_id),
              total: Number(payload.total_reset ?? 0)
            })
          };
        }

        if (entry.event_type === "vacation_mode_enabled") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityVacationEnabled", {
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "vacation_mode_disabled") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityVacationDisabled", {
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "rent_updated") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityRentUpdated", {
              user: labelForUserId(entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "contract_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityContractCreated", {
              name: String(payload.contractName ?? t("finances.subscriptionListTitle"))
            })
          };
        }

        if (entry.event_type === "contract_updated") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityContractUpdated", {
              name: String(payload.contractName ?? t("finances.subscriptionListTitle"))
            })
          };
        }

        if (entry.event_type === "contract_deleted") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityContractDeleted", {
              name: String(payload.contractName ?? t("finances.subscriptionListTitle"))
            })
          };
        }

        if (entry.event_type === "member_joined") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityMemberJoined", {
              user: labelForUserId(entry.subject_user_id ?? entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "member_left") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityMemberLeft", {
              user: labelForUserId(entry.subject_user_id ?? entry.actor_user_id)
            })
          };
        }

        if (entry.event_type === "live_location_started") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityLiveLocationStarted", {
              user: labelForUserId(entry.actor_user_id),
              minutes: Number(payload.durationMinutes ?? 0)
            }),
            navigateTo: "/home/summary"
          };
        }

        if (entry.event_type === "one_off_claim_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
            text: t("tasks.oneOffTaskRequestedBy", {
              user: labelForUserId(entry.actor_user_id)
            }),
            navigateTo: "/tasks/overview"
          };
        }

        return {
          id: `event-${entry.id}`,
          at: entry.created_at,
          icon: "audit",
            text: t("home.activityRoleChanged", {
            user: labelForUserId(entry.subject_user_id),
            role: String(payload.nextRole ?? "")
          })
        };
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [householdEvents, labelForUserId, t]);
  const markdownComponents = useMemo<Components>(
    () => ({
      h1: ({ children }) => <h1 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{children}</h1>,
      h2: ({ children }) => <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">{children}</h2>,
      h3: ({ children }) => <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{children}</h3>,
      p: ({ children }) => <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
      ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">{children}</ul>,
      ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700 dark:text-slate-300">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
        >
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote className="mt-3 border-l-4 border-brand-300 pl-3 italic text-slate-600 dark:border-brand-700 dark:text-slate-300">
          {children}
        </blockquote>
      ),
      code: ({ children, className }) => (
        <code className={`rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] dark:bg-slate-800 ${className ?? ""}`}>{children}</code>
      ),
      pre: ({ children }) => (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          {children}
        </pre>
      ),
      table: ({ children }) => (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold dark:border-slate-700 dark:bg-slate-800">
          {children}
        </th>
      ),
      td: ({ children }) => <td className="border border-slate-200 px-2 py-1 dark:border-slate-700">{children}</td>
    }),
    []
  );
  const landingContentSegments = useMemo(() => splitLandingContentSegments(effectiveMarkdown), [effectiveMarkdown]);
  const landingWidgetKeySet = useMemo(() => {
    const keys = new Set<LandingWidgetKey>();
    for (const segment of landingContentSegments) {
      if (segment.type === "widget") {
        keys.add(segment.key);
      }
    }
    return keys;
  }, [landingContentSegments]);
  const hasHouseholdAddress = addressInput.length > 0;
  const showSummaryCalendarCard = !landingWidgetKeySet.has("household-calendar");
  const showSummaryWhiteboardCard = !landingWidgetKeySet.has("household-whiteboard");
  const showSummaryMapCard = hasHouseholdAddress && !landingWidgetKeySet.has("household-map");
  const hasWeatherWidgetInLanding =
    landingWidgetKeySet.has("household-weather")
    || landingWidgetKeySet.has("household-weather-daily")
    || landingWidgetKeySet.has("household-weather-plot");
  const showSummaryWeatherCard = hasHouseholdAddress && !hasWeatherWidgetInLanding;
  const openBucketItemsCount = useMemo(() => bucketItems.filter((entry) => !entry.done).length, [bucketItems]);
  const doneBucketItemsCount = useMemo(() => bucketItems.filter((entry) => entry.done).length, [bucketItems]);
  const visibleBucketItems = useMemo(
    () => (showCompletedBucketItems ? bucketItems : bucketItems.filter((entry) => !entry.done)),
    [bucketItems, showCompletedBucketItems]
  );
  const bucketShortList = useMemo(
    () =>
      bucketItems
        .filter((entry) => !entry.done)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [bucketItems]
  );
  const onSubmitBucketItem = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextTitle = bucketTitle.trim();
      if (!nextTitle) return;

      await onAddBucketItem({
        title: nextTitle,
        descriptionMarkdown: bucketDescriptionMarkdown.trim(),
        suggestedDates: [...new Set(bucketSuggestedDates)].sort()
      });
      setBucketTitle("");
      setBucketDescriptionMarkdown("");
      setBucketSuggestedDates([]);
    },
    [bucketDescriptionMarkdown, bucketSuggestedDates, bucketTitle, onAddBucketItem]
  );
  const onStartBucketEdit = useCallback((item: BucketItem) => {
    setBucketItemBeingEdited(item);
    setBucketEditTitle(item.title);
    setBucketEditDescriptionMarkdown(item.description_markdown);
    setBucketEditSuggestedDates(item.suggested_dates);
  }, []);
  const onSubmitBucketEdit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!bucketItemBeingEdited) return;

      const nextTitle = bucketEditTitle.trim();
      if (!nextTitle) return;

      await onUpdateBucketItem(bucketItemBeingEdited, {
        title: nextTitle,
        descriptionMarkdown: bucketEditDescriptionMarkdown.trim(),
        suggestedDates: [...new Set(bucketEditSuggestedDates)].sort()
      });

      setBucketItemBeingEdited(null);
      setBucketEditTitle("");
      setBucketEditDescriptionMarkdown("");
      setBucketEditSuggestedDates([]);
    },
    [bucketEditDescriptionMarkdown, bucketEditSuggestedDates, bucketEditTitle, bucketItemBeingEdited, onUpdateBucketItem]
  );
  const onConfirmDeleteBucketItem = useCallback(async () => {
    if (!bucketItemPendingDelete) return;
    await onDeleteBucketItem(bucketItemPendingDelete);
    setBucketItemPendingDelete(null);
  }, [bucketItemPendingDelete, onDeleteBucketItem]);
  const formatSuggestedDate = useMemo(
    () => (value: string) => {
      const parsed = new Date(`${value}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return value;
      return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(parsed);
    },
    [language]
  );
  const onConfirmCompleteTask = useCallback(async () => {
    if (!pendingCompleteTask) return;
    await onCompleteTask(pendingCompleteTask);
    setPendingCompleteTask(null);
  }, [onCompleteTask, pendingCompleteTask]);

  const renderHouseholdCalendarCard = (withTopMargin: boolean, showTitle: boolean) => (
              <Card className={`${withTopMargin ? "mt-6 " : ""}rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100`}>
                <HouseholdCalendarWidget
                  title={showTitle ? t("home.calendarTitle") : <span className="sr-only">{t("home.calendarTitle")}</span>}
                  description={showTitle ? t("home.calendarDescription") : undefined}
                  headerActions={
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setCalendarMonthDate(
                            (current) =>
                              new Date(
                                current.getFullYear(),
                                current.getMonth() - 1,
                                1,
                              ),
                          );
                        }}
                        aria-label={t("home.calendarPrevMonth")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <p className="min-w-[130px] text-center text-sm font-medium capitalize text-slate-700 dark:text-slate-200">
                        {calendarMonthTitle}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setCalendarMonthDate(
                            (current) =>
                              new Date(
                                current.getFullYear(),
                                current.getMonth() + 1,
                                1,
                              ),
                          );
                        }}
                        aria-label={t("home.calendarNextMonth")}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-2 px-2.5"
                            aria-label={t("home.calendarFilterAction")}
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                            <span className="hidden sm:inline">
                              {t("home.calendarFilterAction")}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[220px]">
                          <DropdownMenuLabel>
                            {t("home.calendarFilterTitle")}
                          </DropdownMenuLabel>
                          <DropdownMenuCheckboxItem
                            checked={calendarFilters.cleaning && featureFlags.tasks}
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                cleaning: Boolean(checked),
                              }))
                            }
                            disabled={!featureFlags.tasks}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                              <span>{t("home.calendarFilterCleaning")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={
                              calendarFilters.tasksCompleted && featureFlags.tasks
                            }
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                tasksCompleted: Boolean(checked),
                              }))
                            }
                            disabled={!featureFlags.tasks}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                              <span>{t("home.calendarFilterTasksCompleted")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={
                              calendarFilters.finances && featureFlags.finances
                            }
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                finances: Boolean(checked),
                              }))
                            }
                            disabled={!featureFlags.finances}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                              <span>{t("home.calendarFilterFinances")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={
                              calendarFilters.cashAudits && featureFlags.finances
                            }
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                cashAudits: Boolean(checked),
                              }))
                            }
                            disabled={!featureFlags.finances}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                              <span>{t("home.calendarFilterCashAudits")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={calendarFilters.vacations}
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                vacations: Boolean(checked),
                              }))
                            }
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                              <span>{t("home.calendarFilterVacations")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={calendarFilters.bucket && featureFlags.bucket}
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                bucket: Boolean(checked),
                              }))
                            }
                            disabled={!featureFlags.bucket}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                              <span>{t("home.calendarFilterBucketVotes")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={
                              calendarFilters.shopping && featureFlags.shopping
                            }
                            onCheckedChange={(checked) =>
                              setCalendarFilters((prev) => ({
                                ...prev,
                                shopping: Boolean(checked),
                              }))
                            }
                            disabled={!featureFlags.shopping}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                              <span>{t("home.calendarFilterShopping")}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  }
                >
                  <div className="grid grid-cols-7 gap-1">
                    {calendarWeekdayLabels.map((label) => (
                      <p
                        key={label}
                        className="px-1 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      >
                        {label}
                      </p>
                    ))}
                  </div>
                  <TooltipProvider>
                    <div className="grid grid-cols-7 gap-1">
                      {calendarMonthCells.map((cell) => {
                        const cellDayKey = dayKey(cell.date);
                        const dayWeather = householdWeatherByDay.get(cellDayKey) ?? null;
                        const isToday = cellDayKey === dayKey(new Date());
                        const entry = homeCalendarEntries.get(cellDayKey);
                        const vacationSpans = vacationSpansByDay.get(cellDayKey) ?? [];
                        const {
                          cleaningCount,
                          criticalCleaningCount,
                          completionCount,
                          financeCount,
                          cashAuditCount,
                          bucketCount,
                          shoppingCount,
                          vacationCount,
                        } = getCalendarCounts(entry);
                        const hasEntries =
                          cleaningCount +
                            completionCount +
                            financeCount +
                            cashAuditCount +
                            bucketCount +
                            shoppingCount >
                          0;
                        const showVacationSpans = calendarFilters.vacations && vacationSpans.length > 0;
                        const cellHeightClass = isCalendarDense
                          ? "min-h-[52px]"
                          : "min-h-[70px]";
    
                        return (
                          <Tooltip
                            key={cellDayKey}
                            open={
                              isCalendarCoarsePointer
                                ? openCalendarTooltipDay === cellDayKey
                                : undefined
                            }
                            onOpenChange={(open) => {
                              if (!isCalendarCoarsePointer) return;
                              setOpenCalendarTooltipDay(open ? cellDayKey : null);
                            }}
                          >
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isCalendarCoarsePointer) return;
                                  setOpenCalendarTooltipDay((current) =>
                                    current === cellDayKey ? null : cellDayKey,
                                  );
                                }}
                                className={`${cellHeightClass} flex h-full flex-col justify-between rounded-lg border px-1.5 py-1 text-left transition ${
                                  cell.inCurrentMonth
                                    ? `border-brand-100 bg-white/90 hover:bg-brand-50/60 dark:border-slate-700 dark:bg-slate-900 ${
                                        isToday
                                          ? "ring-2 ring-brand-400/60 ring-offset-1 ring-offset-white dark:ring-brand-500/50 dark:ring-offset-slate-900"
                                          : ""
                                      }`
                                    : "border-brand-50 bg-white/40 opacity-65 dark:border-slate-800 dark:bg-slate-900/40"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <p
                                    className={`text-xs font-medium ${
                                      isToday
                                        ? "text-brand-700 dark:text-brand-300"
                                        : "text-slate-700 dark:text-slate-300"
                                    }`}
                                  >
                                    {cell.date.getDate()}
                                  </p>
                                  {dayWeather ? (
                                    <span className="inline-flex items-center justify-center">
                                      {getStaticWeatherCalendarIcon(dayWeather)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 flex min-h-[16px] flex-col justify-end">
                                  {hasEntries ? (
                                    isCalendarDense ? (
                                      <div className="flex flex-wrap gap-1">
                                        {renderDenseStack(
                                          cleaningCount,
                                          criticalCleaningCount > 0
                                            ? "bg-rose-500"
                                            : "bg-emerald-500",
                                        )}
                                        {renderDenseStack(
                                          completionCount,
                                          "bg-brand-500",
                                        )}
                                        {renderDenseStack(
                                          financeCount,
                                          "bg-amber-500",
                                        )}
                                        {renderDenseStack(
                                          cashAuditCount,
                                          "bg-slate-500",
                                        )}
                                        {renderDenseStack(
                                          bucketCount,
                                          "bg-indigo-500",
                                        )}
                                        {renderDenseStack(
                                          shoppingCount,
                                          "bg-cyan-500",
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                                        {cleaningCount > 0 ? (
                                          <span
                                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
                                              criticalCleaningCount > 0
                                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                            }`}
                                          >
                                            <span
                                              className={`h-1.5 w-1.5 rounded-full ${
                                                criticalCleaningCount > 0
                                                  ? "bg-rose-500"
                                                  : "bg-emerald-500"
                                              }`}
                                            />
                                            {cleaningCount}
                                          </span>
                                        ) : null}
                                        {completionCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                                            {completionCount}
                                          </span>
                                        ) : null}
                                        {financeCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                            {financeCount}
                                          </span>
                                        ) : null}
                                        {cashAuditCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                                            {cashAuditCount}
                                          </span>
                                        ) : null}
                                        {bucketCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                            {bucketCount}
                                          </span>
                                        ) : null}
                                        {shoppingCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-1.5 py-0.5 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                                            {shoppingCount}
                                          </span>
                                        ) : null}
                                      </div>
                                    )
                                  ) : null}
                                  {showVacationSpans ? (
                                    <div className="mt-1 space-y-0.5">
                                      {vacationSpans.map((span) => {
                                        const segmentClassName =
                                          span.kind === "single"
                                            ? "mx-0 rounded-full"
                                            : span.kind === "start"
                                              ? "-mr-2 rounded-l-full"
                                              : span.kind === "end"
                                                ? "-ml-2 rounded-r-full"
                                                : "-mx-2";
                                        return (
                                          <div
                                            key={`${cellDayKey}-vac-${span.id}-${span.kind}`}
                                            className={`relative z-10 h-1.5 ${segmentClassName} ${
                                              span.manual ? "bg-violet-400" : "bg-violet-500"
                                            }`}
                                          />
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[320px] border border-slate-200 bg-white text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                              <p className="mb-2 font-semibold">
                                {t("home.calendarTooltipTitle", {
                                  date: formatShortDay(
                                    cellDayKey,
                                    language,
                                    cellDayKey,
                                  ),
                                })}
                              </p>
                              <div className="space-y-2">
                                {cleaningCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarCleaningTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.cleaningDueTasks
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((taskEntry) => (
                                          <li
                                            key={`cleaning-${cellDayKey}-${taskEntry.task.id}`}
                                            className="text-xs"
                                          >
                                            <span
                                              className={`mr-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                taskEntry.status === "overdue"
                                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                                                  : taskEntry.status === "due"
                                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                              }`}
                                            >
                                              {taskEntry.status === "overdue"
                                                ? t("home.calendarOverdueLabel")
                                                : taskEntry.status === "due"
                                                  ? t("home.calendarDueLabel")
                                                  : t("home.calendarUpcomingLabel")}
                                            </span>
                                            {taskEntry.task.title} ·{" "}
                                            {labelForUserId(
                                              taskEntry.task.assignee_id,
                                            )}
                                          </li>
                                        ))}
                                    </ul>
                                    {cleaningCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            cleaningCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {completionCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarTasksCompletedTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.taskCompletions
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((completion) => (
                                          <li
                                            key={`completed-${cellDayKey}-${completion.id}`}
                                            className="text-xs"
                                          >
                                            {completion.task_title_snapshot ||
                                              t("tasks.fallbackTitle")}{" "}
                                            · {labelForUserId(completion.user_id)}
                                          </li>
                                        ))}
                                    </ul>
                                    {completionCount >
                                    MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            completionCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {financeCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarFinanceTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.financeEntries
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((finance) => (
                                          <li
                                            key={`finance-${cellDayKey}-${finance.id}`}
                                            className="text-xs"
                                          >
                                            {finance.description} ·{" "}
                                            {formatMoney(finance.amount)}
                                          </li>
                                        ))}
                                    </ul>
                                    {financeCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            financeCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {cashAuditCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarCashAuditTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.cashAudits
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((audit) => (
                                          <li
                                            key={`audit-${cellDayKey}-${audit.id}`}
                                            className="text-xs"
                                          >
                                            {t("home.calendarCashAuditEntry", {
                                              user: labelForUserId(
                                                audit.requested_by,
                                              ),
                                            })}
                                          </li>
                                        ))}
                                    </ul>
                                    {cashAuditCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            cashAuditCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {vacationCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarVacationsTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.vacations
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((vacation) => (
                                          <li
                                            key={`vacation-${cellDayKey}-${vacation.id}-${vacation.userId}`}
                                            className="text-xs"
                                          >
                                            {labelForUserId(vacation.userId)}
                                            {vacation.manual ? (
                                              <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400">
                                                ({t("home.calendarVacationManual")})
                                              </span>
                                            ) : null}
                                            <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400">
                                              {formatDateOnly(vacation.startDate, language, vacation.startDate)} –{" "}
                                              {formatDateOnly(vacation.endDate, language, vacation.endDate)}
                                            </span>
                                            {vacation.note ? ` · ${vacation.note}` : ""}
                                          </li>
                                        ))}
                                    </ul>
                                    {vacationCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            vacationCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {shoppingCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarShoppingTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.shoppingEntries
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((shopping) => (
                                          <li
                                            key={`shopping-${cellDayKey}-${shopping.id}`}
                                            className="text-xs"
                                          >
                                            {shopping.title} ·{" "}
                                            {labelForUserId(shopping.userId)}
                                          </li>
                                        ))}
                                    </ul>
                                    {shoppingCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            shoppingCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {bucketCount > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("home.calendarBucketVotesTitle")}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {entry?.bucketVotes
                                        .slice(0, MAX_CALENDAR_TOOLTIP_ITEMS)
                                        .map((vote) => (
                                          <li
                                            key={`bucket-${cellDayKey}-${vote.item.id}-${vote.date}`}
                                            className="text-xs"
                                          >
                                            {vote.item.title} ·{" "}
                                            {t("home.bucketVotes", {
                                              count: vote.voters.length,
                                            })}
                                          </li>
                                        ))}
                                    </ul>
                                    {bucketCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("home.calendarMore", {
                                          count:
                                            bucketCount -
                                            MAX_CALENDAR_TOOLTIP_ITEMS,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {!hasEntries ? (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t("home.calendarEmpty")}
                                  </p>
                                ) : null}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </TooltipProvider>
                </HouseholdCalendarWidget>
              </Card>
  );

  const renderLandingWidget = useCallback((key: LandingWidgetKey) => {
    if (key === "tasks-overview") {
      if (!featureFlags.tasks) return null;
      return (
        <button
          type="button"
          className="w-full rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-left transition hover:bg-brand-100/70 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
          onClick={() => void navigate({ to: "/tasks/overview" })}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksDue")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{dueTasksCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("home.widgetTasksOpen", { count: openTasksCount })}
          </p>
        </button>
      );
    }

    if (key === "tasks-for-you") {
      if (!featureFlags.tasks) return null;
      return (
        <div className="rounded-xl border border-brand-100 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksForYou")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{dueTasksForYou.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetTasksForYouHint")}</p>
          {dueTasksForYou.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {dueTasksForYou.slice(0, 3).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1 dark:bg-slate-950/60">
                  <span className="truncate text-xs text-slate-600 dark:text-slate-300">{task.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => {
                      setPendingCompleteTask(task);
                    }}
                  >
                    {t("tasks.complete")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }

    if (key === "your-balance") {
      if (!featureFlags.finances) return null;
      const positive = yourBalance >= 0;
      return (
        <button
          type="button"
          className="w-full rounded-xl border border-brand-100 bg-white/80 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-900"
          onClick={() => void navigate({ to: "/finances/stats" })}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetYourBalance")}</p>
          <p className={`mt-1 text-lg font-semibold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {formatMoney(yourBalance)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetBalanceSinceAudit")}</p>
        </button>
      );
    }

    if (key === "household-balance") {
      if (!featureFlags.finances) return null;
      return (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetHouseholdBalance")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatMoney(householdOpenBalance)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetHouseholdBalanceHint")}</p>
        </div>
      );
    }

    if (key === "recent-activity") {
      return (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("home.widgetRecentActivity")}</p>
          {recentActivity.length > 0 ? (
            <ul className="space-y-1">
              {recentActivity.slice(0, 4).map((entry) => (
                <li key={entry.id} className="truncate text-xs text-slate-600 dark:text-slate-300">
                  {entry.navigateTo ? (
                    <button
                      type="button"
                      className="w-full truncate text-left underline-offset-2 hover:underline"
                      onClick={() => {
                        const target = entry.navigateTo;
                        if (!target) return;
                        void navigate({ to: target });
                      }}
                    >
                      {entry.text}
                    </button>
                  ) : (
                    entry.text
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.activityEmpty")}</p>
          )}
        </div>
      );
    }

    if (key === "bucket-short-list") {
      if (!featureFlags.bucket) return null;
      return (
        <button
          type="button"
          className="w-full rounded-xl border border-brand-100 bg-white/80 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-900"
          onClick={() => void navigate({ to: "/home/bucket" })}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetBucketShortList")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{openBucketItemsCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetBucketShortListHint")}</p>
          {bucketShortList.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {bucketShortList.map((entry) => (
                <li key={entry.id} className="truncate text-xs text-slate-600 dark:text-slate-300">
                  • {entry.title}
                </li>
              ))}
            </ul>
          ) : null}
        </button>
      );
    }

    if (key === "member-of-month") {
      if (!featureFlags.tasks) return null;
      return (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetMemberOfMonth")}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("home.widgetMemberOfMonthHint", { month: memberOfMonthLabel })}
          </p>
          {memberOfMonth ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <MemberAvatar
                  src={
                    memberOfMonthProfile?.avatar_url?.trim() ||
                    createDiceBearAvatarDataUri(
                      getMemberAvatarSeed(
                        memberOfMonth.userId,
                        memberOfMonthProfile?.display_name
                      ),
                      memberOfMonthProfile?.user_color
                    )
                  }
                  alt={memberLabel(memberOfMonth.userId)}
                  isVacation={
                    memberOfMonthProfile
                      ? isMemberOnVacation(
                          memberOfMonthProfile.user_id,
                          memberVacations,
                          todayIso,
                          memberOfMonthProfile.vacation_mode
                        )
                      : false
                  }
                  isMemberOfMonth
                  className="h-8 w-8 rounded-full border border-brand-200 dark:border-slate-700"
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {memberLabel(memberOfMonth.userId)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("tasks.pimpersValue", { count: memberOfMonth.totalPimpers })}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("home.widgetMemberOfMonthDelay", {
                  minutes: Math.round(memberOfMonth.averageDelayMinutes)
                })}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("home.widgetMemberOfMonthEmpty")}</p>
          )}
        </div>
      );
    }

    if (key === "fairness-score") {
      if (!featureFlags.tasks) return null;
      return (
        <div className="rounded-xl border border-brand-100 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetFairness")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{taskFairness.overallScore} / 100</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetFairnessHint")}</p>
        </div>
      );
    }

    if (key === "reliability-score") {
      if (!featureFlags.tasks) return null;
      return (
        <div className="rounded-xl border border-brand-100 bg-emerald-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetReliability")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {taskReliability.overallScore} / 100
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.widgetReliabilityHint")}</p>
        </div>
      );
    }

    if (key === "expenses-by-month") {
      if (!featureFlags.finances) return null;
      return monthlyExpenseRows.length > 0 ? (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("home.widgetExpensesByMonth")}</p>
          <ul className="space-y-2">
            {monthlyExpenseRows.map((entry) => (
              <li key={entry.month} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-700 dark:text-slate-300">{entry.month}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {entry.categories.map((categoryRow) => `${categoryRow.category}: ${categoryRow.value.toFixed(2)} €`).join(" • ")}
                  </p>
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{entry.total.toFixed(2)} €</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    }

    if (key === "fairness-by-member") {
      if (!featureFlags.tasks) return null;
      return taskFairness.rows.length > 0 ? (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("home.widgetFairnessByMember")}</p>
          <ul className="space-y-2">
            {taskFairness.rows.map((row) => (
              <li key={row.memberId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">{memberLabel(row.memberId)}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {row.score} / 100 · {row.completions}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${row.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    }

    if (key === "reliability-by-member") {
      if (!featureFlags.tasks) return null;
      return taskReliability.rows.length > 0 ? (
        <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("home.widgetReliabilityByMember")}
          </p>
          <ul className="space-y-2">
            {taskReliability.rows.map((row) => (
              <li key={row.memberId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">{memberLabel(row.memberId)}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {row.score} / 100 · {Math.round(row.averageDelayMinutes)}m
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${row.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    }

    if (key === "household-calendar") {
      return renderHouseholdCalendarCard(false, false);
    }

    if (key === "household-weather-daily") {
      return !mapHasPin ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("home.householdWeatherNeedsAddress")}
        </p>
      ) : householdWeatherQuery.isLoading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("home.householdWeatherLoading")}
        </p>
      ) : householdWeatherQuery.isError ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          {t("home.householdWeatherError")}
        </p>
      ) : householdWeatherHourly.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("home.householdWeatherEmpty")}
        </p>
      ) : (
        <HouseholdWeatherDailyPreview>
          {householdWeatherDays.slice(0, 4).map((day, index) => (
            <div
              key={`landing-weather-day-${day.date}`}
              className="w-[168px] shrink-0 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white/95 to-slate-50/90 p-1 shadow-sm dark:border-slate-700/90 dark:from-slate-900/85 dark:to-slate-900/65"
            >
              <div className="relative flex items-center justify-center rounded-xl bg-white/70 py-1 pt-4 dark:bg-slate-800/65">
                <WeatherSvg
                  state={getAnimatedWeatherState(day)}
                  width={52}
                  height={52}
                />
                <p className="absolute top-2 left-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {index === 0
                    ? t("home.householdWeatherRelativeToday")
                    : index === 1
                      ? t("home.householdWeatherRelativeTomorrow")
                      : index === 2
                        ? t("home.householdWeatherRelativeDayAfterTomorrow")
                        : formatDateOnly(day.date, language, day.date)}
                </p>
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
              <p className="px-2 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
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
              <p className="px-2 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
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
                      : Math.round(
                          Math.max(day.windSpeedKmh ?? 0, day.windGustKmh ?? 0),
                        ),
                  dir: getWindDirectionLabel(day.windDirectionDeg),
                })}
              </p>
            </div>
          ))}
        </HouseholdWeatherDailyPreview>
      );
    }

    if (key === "household-weather-plot") {
      return (
        !mapHasPin ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.householdWeatherNeedsAddress")}</p>
        ) : householdWeatherQuery.isLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.householdWeatherLoading")}</p>
        ) : householdWeatherQuery.isError ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{t("home.householdWeatherError")}</p>
        ) : householdWeatherHourly.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("home.householdWeatherEmpty")}</p>
        ) : (
          <HouseholdWeatherPlot
            hint={t("home.householdWeatherChartHint")}
            isMobile={isMobileBucketComposer}
            legendButtonLabel={t("home.householdWeatherLegendButton")}
            legendItems={weatherLegendItems}
            onToggleLegendItem={toggleWeatherLegendDataset}
          >
            <div
              ref={weatherChartContainerRef}
              className="h-64 rounded-lg border border-slate-200/90 bg-white/80 p-2 dark:border-slate-700/90 dark:bg-slate-900/70"
              onDoubleClick={zoomOutWeatherChart}
              onTouchEndCapture={onWeatherChartTouchEndCapture}
            >
              <Chart
                ref={weatherChartRef}
                type="bar"
                data={householdWeatherChartData}
                options={householdWeatherChartOptions}
              />
            </div>
          </HouseholdWeatherPlot>
        )
      );
    }

    if (key === "household-weather") {
      return (
        <div className="space-y-2">
          {renderLandingWidget("household-weather-daily")}
          {renderLandingWidget("household-weather-plot")}
        </div>
      );
    }

    if (key === "household-whiteboard") {
      return (
        <Suspense
          fallback={
            <div className="flex h-[560px] items-center justify-center rounded-xl border border-brand-100 bg-white/70 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              {t("common.loading")}
            </div>
          }
        >
          <div className="relative">
            <ExcalidrawBoardLazy
              sceneJson={whiteboardDraft}
              onSceneChange={(nextValue) => {
                setWhiteboardDraft(nextValue);
              }}
              className="rounded-xl border border-brand-100 bg-white dark:border-slate-700"
              height={560}
              previewMode
            />
            <button
              type="button"
              className="absolute inset-0 rounded-xl border border-transparent transition hover:border-brand-200 hover:bg-brand-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
              onClick={openWhiteboardFullscreen}
              aria-label={t("home.whiteboardFullscreen")}
              title={t("home.whiteboardFullscreen")}
            />
          </div>
        </Suspense>
      );
    }

    if (key === "household-map") {
      return (
        <div className="relative">
          {renderHouseholdMapSurface(
            "relative h-72 overflow-hidden rounded-lg border border-brand-100 dark:border-slate-700",
            false
          )}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1200] flex items-end justify-start">
            <button
              type="button"
              className="pointer-events-auto z-[1201] inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/95 dark:text-brand-100 dark:hover:bg-slate-800"
              onClick={openMapFullscreen}
              aria-label={t("home.householdMapFullscreen")}
              title={t("home.householdMapFullscreen")}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    return null;
  }, [
    featureFlags,
    dueTasksCount,
    openTasksCount,
    dueTasksForYou,
    yourBalance,
    formatMoney,
    householdOpenBalance,
    recentActivity,
    monthlyExpenseRows,
    bucketShortList,
    openBucketItemsCount,
    taskFairness,
    taskReliability,
    memberOfMonth,
    memberOfMonthLabel,
    memberOfMonthProfile,
    memberLabel,
    navigate,
    onCompleteTask,
    busy,
    t
  ]);
  const landingWidgetJsxDescriptors = useMemo<JsxComponentDescriptor[]>(
    () =>
      LANDING_WIDGET_COMPONENTS.map(({ key, tag }) => {
        const DescriptorEditor = ({ mdastNode }: JsxEditorProps) => {
          const removeNode = useLexicalNodeRemove();
          const widgetOrder = getWidgetOrderFromMdastNode(mdastNode) ?? 0;
          return (
            <LandingWidgetEditorShell
              onRemove={removeNode}
              onMove={(sourceWidgetIndex, targetWidgetIndex) => {
                setMarkdownDraft((previous) => moveWidgetInMarkdown(previous, sourceWidgetIndex, targetWidgetIndex));
              }}
              onInsertTextBefore={() => {
                setMarkdownDraft((previous) => {
                  const nextValue = insertTextAroundWidget(
                    previous,
                    widgetOrder,
                    "before",
                    insertTextPlaceholder
                  );
                  landingEditorRef.current?.setMarkdown(convertLandingTokensToEditorJsx(nextValue));
                  return nextValue;
                });
              }}
              onInsertTextAfter={() => {
                setMarkdownDraft((previous) => {
                  const nextValue = insertTextAroundWidget(
                    previous,
                    widgetOrder,
                    "after",
                    insertTextPlaceholder
                  );
                  landingEditorRef.current?.setMarkdown(convertLandingTokensToEditorJsx(nextValue));
                  return nextValue;
                });
              }}
              dragHandleLabel={t("tasks.dragHandle")}
              insertTextBeforeLabel={insertTextBeforeLabel}
              insertTextAfterLabel={insertTextAfterLabel}
              widgetIndex={widgetOrder}
            >
              {renderLandingWidget(key)}
            </LandingWidgetEditorShell>
          );
        };
        return {
          name: tag,
          kind: "flow",
          props: [],
          hasChildren: false,
          Editor: DescriptorEditor
        };
      }),
    [insertTextAfterLabel, insertTextBeforeLabel, insertTextPlaceholder, renderLandingWidget, t]
  );

  const whiteboardStatusLabel = useMemo(() => {
    if (whiteboardError) return whiteboardError;
    if (whiteboardStatus === "saving") return t("home.whiteboardSaving");
    if (whiteboardStatus === "unsaved") return t("home.whiteboardUnsaved");
    if (whiteboardStatus === "saved") return t("home.whiteboardSaved");
    if (whiteboardStatus === "error") return t("home.whiteboardSaveError");
    return t("home.whiteboardIdle");
  }, [t, whiteboardError, whiteboardStatus]);

  const whiteboardStatusIndicator = useMemo(() => {
    if (whiteboardStatus === "saving") {
      return <Loader2 className="h-4 w-4 animate-spin text-brand-600 dark:text-brand-300" />;
    }
    if (whiteboardStatus === "saved") {
      return (
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
      );
    }
    if (whiteboardStatus === "unsaved") {
      return (
        <CircleDot className="h-4 w-4 text-amber-500 dark:text-amber-300" />
      );
    }
    if (whiteboardStatus === "error") {
      return <X className="h-4 w-4 text-rose-500 dark:text-rose-300" />;
    }
    return null;
  }, [whiteboardStatus]);

  useEffect(() => {
    setMarkdownDraft(getEffectiveLandingMarkdown(getSavedLandingMarkdown(household.landing_page_markdown), defaultLandingMarkdown));
    setIsEditingLanding(false);
  }, [defaultLandingMarkdown, household.id, household.landing_page_markdown]);
  useEffect(() => {
    setWhiteboardDraft(whiteboardSceneJson);
    lastSavedWhiteboardRef.current = whiteboardSceneJson;
    setWhiteboardStatus("idle");
    setWhiteboardError(null);
  }, [household.id, whiteboardSceneJson]);
  useEffect(() => {
    const updateWidth = () => {
      const next =
        bucketComposerContainerRef.current?.getBoundingClientRect().width ??
        bucketComposerRowRef.current?.getBoundingClientRect().width;
      if (!next || Number.isNaN(next)) return;
      setBucketPopoverWidth(Math.max(220, Math.round(next)));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isMobileBucketComposer]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsCalendarCoarsePointer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsCalendarMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setOpenCalendarTooltipDay(null);
  }, [calendarMonthDate]);
  useEffect(() => {
    if (whiteboardSaveTimerRef.current) {
      window.clearTimeout(whiteboardSaveTimerRef.current);
      whiteboardSaveTimerRef.current = null;
    }

    if (whiteboardDraft === lastSavedWhiteboardRef.current) {
      setWhiteboardStatus("idle");
      return;
    }

    if (whiteboardDraft.length > MAX_WHITEBOARD_BYTES) {
      setWhiteboardError(t("home.whiteboardTooLarge"));
      setWhiteboardStatus("error");
      return;
    }

    setWhiteboardError(null);
          setWhiteboardStatus("unsaved");
    whiteboardSaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setWhiteboardStatus("saving");
          await onSaveWhiteboard(whiteboardDraft);
          lastSavedWhiteboardRef.current = whiteboardDraft;
          setWhiteboardStatus("saved");
        } catch {
          setWhiteboardStatus("error");
        }
      })();
    }, 1200);
    return () => {
      if (whiteboardSaveTimerRef.current) {
        window.clearTimeout(whiteboardSaveTimerRef.current);
        whiteboardSaveTimerRef.current = null;
      }
    };
  }, [onSaveWhiteboard, t, whiteboardDraft]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobileBucketComposer(event.matches);
    setIsMobileBucketComposer(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const renderBucketComposer = (mobile: boolean) => (
    <form className={mobile ? "space-y-0" : "space-y-2"} onSubmit={(event) => void onSubmitBucketItem(event)}>
      <div className="flex items-end">
        <div className="relative flex-1 space-y-1">
          <Label className={mobile ? "sr-only" : ""}>{t("home.bucketTitle")}</Label>
          <Popover>
            <PopoverAnchor asChild>
              <div
                ref={bucketComposerRowRef}
                className="flex h-10 items-stretch overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900 focus-within:border-brand-500 focus-within:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:focus-within:border-slate-500 dark:focus-within:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]"
              >
                <Input
                  value={bucketTitle}
                  onChange={(event) => setBucketTitle(event.target.value)}
                  placeholder={t("home.bucketPlaceholder")}
                  maxLength={200}
                  disabled={busy}
                  className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-full w-10 shrink-0 rounded-none border-l border-brand-200 p-0 dark:border-slate-700"
                    aria-label={t("home.bucketMoreOptions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <Button
                  type="submit"
                  disabled={busy || bucketTitle.trim().length === 0}
                  className="h-full shrink-0 rounded-none border-l border-brand-200 px-3 dark:border-slate-700"
                  aria-label={t("home.bucketAddAction")}
                >
                  <Plus className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{t("home.bucketAddAction")}</span>
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              side={mobile ? "top" : "bottom"}
              sideOffset={12}
              className="w-auto space-y-3 -translate-x-1.5 rounded-xl border-brand-100 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-slate-700"
              style={{ width: `${bucketPopoverWidth}px` }}
            >
                <div className="space-y-1">
                  <Label>{t("home.bucketDescriptionPlaceholder")}</Label>
                  <textarea
                    value={bucketDescriptionMarkdown}
                    onChange={(event) => setBucketDescriptionMarkdown(event.target.value)}
                    placeholder={t("home.bucketDescriptionPlaceholder")}
                    maxLength={20000}
                    disabled={busy}
                    rows={4}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("home.bucketDatesLabel")}</p>
                  <MultiDateCalendarSelect
                    value={bucketSuggestedDates}
                    onChange={setBucketSuggestedDates}
                    disabled={busy}
                    locale={language}
                    placeholder={t("home.bucketDatePickerPlaceholder")}
                    clearLabel={t("home.bucketDatePickerClear")}
                    doneLabel={t("home.bucketDatePickerDone")}
                  />
                </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      {showSummary ? (
        <div className="relative overflow-hidden rounded-2xl border border-brand-200 shadow-card dark:border-slate-700">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: bannerBackgroundImage }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/45 via-slate-900/25 to-slate-900/55" />
          <div className="relative flex min-h-44 items-end p-5 sm:min-h-56 sm:p-7">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-white/80">
                {userLabel ?? t("app.noUserLabel")}
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">
                {household.name}
              </h1>
            </div>
          </div>
        </div>
      ) : null}

      {showSummary ? (
        <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
          <CardContent className="relative">
            {households.length > 1 ? (
              <div className="mb-4 sm:max-w-[280px]">
                <Select value={household.id} onValueChange={onSelectHousehold}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("home.switchHousehold")} />
                  </SelectTrigger>
                  <SelectContent>
                    {households.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {!isEditingLanding ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full border-brand-200 bg-white/95 px-0 shadow-sm hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900/95 dark:hover:bg-slate-800"
                      onMouseEnter={prefetchEditor}
                      onFocus={prefetchEditor}
                      onClick={() => setIsEditingLanding(true)}
                      disabled={!canEdit}
                      aria-label={t("home.editLanding")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("home.editLanding")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {!canEdit ? (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                {t("home.editLandingOwnerOnly")}
              </p>
            ) : null}
            {canEdit && isEditingLanding ? (
              <form
                className="w-full space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void (async () => {
                    try {
                      setIsSaving(true);
                      await onSaveLandingMarkdown(markdownDraft);
                      setIsEditingLanding(false);
                    } finally {
                      setIsSaving(false);
                    }
                  })();
                }}
              >
                <ErrorBoundary
                  fallback={
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                      {t("home.editorError")}
                    </div>
                  }
                >
                  <Suspense
                    fallback={
                      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                        {t("common.loading")}
                      </div>
                    }
                  >
                    <MXEditorLazy
                      editorRef={landingEditorRef}
                      value={convertLandingTokensToEditorJsx(markdownDraft)}
                      onChange={(nextValue) =>
                        setMarkdownDraft(
                          convertEditorJsxToLandingTokens(nextValue),
                        )
                      }
                      placeholder={t("home.markdownPlaceholder")}
                      chrome="flat"
                      insertOptions={landingInsertOptionsForEditor}
                      insertPlaceholder={t("home.insertWidgetPlaceholder")}
                      insertButtonLabel={t("home.insertWidgetAction")}
                      jsxComponentDescriptors={landingWidgetJsxDescriptors}
                    />
                  </Suspense>
                </ErrorBoundary>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMarkdownDraft(effectiveMarkdown);
                      setIsEditingLanding(false);
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={busy || isSaving}>
                    {t("home.saveLanding")}
                  </Button>
                </div>
              </form>
            ) : hasContent ? (
              <div className="prose prose-slate max-w-none dark:prose-invert [&_*]:break-words">
                {landingContentSegments.map((segment, index) =>
                  segment.type === "markdown" ? (
                    <ReactMarkdown
                      key={`md-${index}`}
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {segment.content}
                    </ReactMarkdown>
                  ) : (
                    <div
                      key={`widget-${segment.key}-${index}`}
                      className="not-prose mt-4"
                    >
                      {renderLandingWidget(segment.key)}
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("home.landingEmpty")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showBucket ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.bucketTitle")}</CardTitle>
              <CardDescription>{t("home.bucketDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isMobileBucketComposer ? renderBucketComposer(false) : null}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("home.bucketProgress", {
                  open: openBucketItemsCount,
                  done: doneBucketItemsCount,
                })}
              </p>
              {doneBucketItemsCount > 0 ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      setShowCompletedBucketItems((current) => !current)
                    }
                    disabled={busy}
                  >
                    {showCompletedBucketItems
                      ? t("home.bucketHideCompleted")
                      : t("home.bucketShowCompleted", {
                          count: doneBucketItemsCount,
                        })}
                  </Button>
                </div>
              ) : null}
              {visibleBucketItems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("home.bucketEmpty")}
                </p>
              ) : null}
            </CardContent>
          </Card>
          {visibleBucketItems.length > 0 ? (
            <div
              className={`space-y-3 ${isMobileBucketComposer ? "pb-40" : ""}`}
            >
              {visibleBucketItems.map((item) => (
                <Card
                  className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4"
                  key={item.id}
                >
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={item.done}
                          onCheckedChange={() => {
                            void onToggleBucketItem(item);
                          }}
                          aria-label={
                            item.done
                              ? t("home.bucketMarkOpen")
                              : t("home.bucketMarkDone")
                          }
                          disabled={busy}
                        />
                        <span
                          className={`truncate text-sm ${
                            item.done
                              ? "text-slate-400 line-through dark:text-slate-500"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {item.title}
                        </span>
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 px-0"
                            disabled={busy}
                            aria-label={t("home.bucketItemActions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onStartBucketEdit(item)}
                            disabled={busy}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("home.bucketEdit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setBucketItemPendingDelete(item)}
                            disabled={busy}
                            className="text-rose-600 dark:text-rose-300"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("home.bucketDelete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {item.description_markdown.trim().length > 0 ? (
                      <div className="prose prose-slate max-w-none text-sm dark:prose-invert [&_*]:break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {item.description_markdown}
                        </ReactMarkdown>
                      </div>
                    ) : null}

                    {item.suggested_dates.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {t("home.bucketSuggestedDatesTitle")}
                        </p>
                        <ul className="space-y-1">
                          {item.suggested_dates.map((dateValue) => {
                            const voters = item.votes_by_date[dateValue] ?? [];
                            const hasVoted = voters.includes(userId);
                            return (
                              <li
                                key={`${item.id}-${dateValue}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800/60"
                              >
                                <span className="text-xs text-slate-700 dark:text-slate-300">
                                  {formatSuggestedDate(dateValue)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {t("home.bucketVotes", {
                                      count: voters.length,
                                    })}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={hasVoted ? "default" : "outline"}
                                    className="h-7 px-2 text-[11px]"
                                    disabled={busy}
                                    onClick={() => {
                                      void onToggleBucketDateVote(
                                        item,
                                        dateValue,
                                        !hasVoted,
                                      );
                                    }}
                                  >
                                    {hasVoted
                                      ? t("home.bucketVotedAction")
                                      : t("home.bucketVoteAction")}
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
          <Dialog
            open={bucketItemBeingEdited !== null}
            onOpenChange={(open) => {
              if (open) return;
              setBucketItemBeingEdited(null);
              setBucketEditTitle("");
              setBucketEditDescriptionMarkdown("");
              setBucketEditSuggestedDates([]);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("home.bucketEditTitle")}</DialogTitle>
                <DialogDescription>
                  {t("home.bucketEditDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(event) => void onSubmitBucketEdit(event)}
              >
                <div className="space-y-1">
                  <Label>{t("home.bucketTitle")}</Label>
                  <Input
                    value={bucketEditTitle}
                    onChange={(event) => setBucketEditTitle(event.target.value)}
                    placeholder={t("home.bucketPlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("home.bucketDescriptionPlaceholder")}</Label>
                  <textarea
                    value={bucketEditDescriptionMarkdown}
                    onChange={(event) =>
                      setBucketEditDescriptionMarkdown(event.target.value)
                    }
                    placeholder={t("home.bucketDescriptionPlaceholder")}
                    className="min-h-[96px] w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("home.bucketDatesLabel")}
                  </p>
                  <MultiDateCalendarSelect
                    value={bucketEditSuggestedDates}
                    onChange={setBucketEditSuggestedDates}
                    locale={language}
                    placeholder={t("home.bucketDatePickerPlaceholder")}
                    clearLabel={t("home.bucketDatePickerClear")}
                    doneLabel={t("home.bucketDatePickerDone")}
                    disabled={busy}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setBucketItemBeingEdited(null);
                      setBucketEditTitle("");
                      setBucketEditDescriptionMarkdown("");
                      setBucketEditSuggestedDates([]);
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy || bucketEditTitle.trim().length === 0}
                  >
                    {t("home.bucketEditSave")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={bucketItemPendingDelete !== null}
            onOpenChange={(open) => {
              if (!open) setBucketItemPendingDelete(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("home.bucketDeleteConfirmTitle")}</DialogTitle>
                <DialogDescription>
                  {t("home.bucketDeleteConfirmDescription", {
                    title: bucketItemPendingDelete?.title ?? "",
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setBucketItemPendingDelete(null)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    void onConfirmDeleteBucketItem();
                  }}
                >
                  {t("home.bucketDeleteConfirmAction")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {isMobileBucketComposer ? (
            <div
              className={`fixed inset-x-0 z-40 px-3 sm:hidden ${
                mobileTabBarVisible
                  ? "bottom-[calc(env(safe-area-inset-bottom)+3.75rem)]"
                  : "bottom-[calc(env(safe-area-inset-bottom)+0.2rem)]"
              }`}
            >
              <div
                ref={bucketComposerContainerRef}
                className="rounded-2xl border border-brand-200/70 bg-white/75 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/75"
              >
                {renderBucketComposer(true)}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showFeed ? (
        <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
          <CardHeader>
            <CardTitle>{t("home.activityTitle")}</CardTitle>
            <CardDescription>{t("home.activityDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <ul className="space-y-2">
                {recentActivity.map((entry) => {
                  const Icon =
                    entry.icon === "task"
                      ? CalendarCheck2
                      : entry.icon === "shopping"
                        ? ShoppingCart
                        : entry.icon === "finance"
                          ? Wallet
                          : Receipt;
                  return (
                    <li
                      key={entry.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-brand-100 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/70"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                        {entry.navigateTo ? (
                          <button
                            type="button"
                            className="min-w-0 text-left text-slate-700 underline-offset-2 hover:underline dark:text-slate-300"
                            onClick={() => {
                              const target = entry.navigateTo;
                              if (!target) return;
                              void navigate({ to: target });
                            }}
                          >
                            {entry.text}
                          </button>
                        ) : (
                          <span className="min-w-0 text-slate-700 dark:text-slate-300">
                            {entry.text}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(entry.at, language, entry.at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("home.activityEmpty")}
              </p>
            )}
            {eventsHasMore ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => onLoadMoreEvents?.()}
                  disabled={eventsLoadingMore}
                >
                  {t("common.loadMore")}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showSummary ? (
        <>
          {showSummaryCalendarCard
            ? renderHouseholdCalendarCard(true, true)
            : null}

          {showSummaryWhiteboardCard ? (
            <Card className="mt-6 rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
              <HouseholdWhiteboardWidget
                title={
                  <>
                    {t("home.whiteboardTitle")}
                    {whiteboardOnlineMembers.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          {t("home.whiteboardOnlineNow", {
                            count: whiteboardOnlineMembers.length,
                          })}
                        </span>
                        {whiteboardOnlineMembers.slice(0, 6).map((member) => (
                          <span
                            key={`wb-online-card-${member.user_id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {memberLabel(member.user_id)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                }
                description={t("home.whiteboardDescription")}
                headerActions={<div className="flex items-center gap-2" />}
              >
                <ErrorBoundary
                  fallback={
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                      {t("home.whiteboardError")}
                    </div>
                  }
                >
                  <Suspense
                    fallback={
                      <div className="flex h-[560px] items-center justify-center rounded-xl border border-brand-100 bg-white/70 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                        {t("common.loading")}
                      </div>
                    }
                  >
                    <div className="relative">
                      <ExcalidrawBoardLazy
                        sceneJson={whiteboardDraft}
                        onSceneChange={(nextValue) => {
                          setWhiteboardDraft(nextValue);
                        }}
                        className="rounded-xl border border-brand-100 bg-white dark:border-slate-700"
                        height={560}
                        previewMode
                      />
                      <button
                        type="button"
                        className="absolute inset-0 rounded-xl border border-transparent transition hover:border-brand-200 hover:bg-brand-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                        onClick={openWhiteboardFullscreen}
                        aria-label={t("home.whiteboardFullscreen")}
                        title={t("home.whiteboardFullscreen")}
                      />
                    </div>
                  </Suspense>
                </ErrorBoundary>
              </HouseholdWhiteboardWidget>
            </Card>
          ) : null}

          {showSummaryMapCard ? (
            <Card className="mt-6 rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
              <HouseholdMapWidget
                title={t("home.householdMapTitle")}
                description={t("home.householdMapDescription")}
                headerActions={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-200/80 dark:text-brand-100 dark:hover:bg-slate-800"
                      onClick={openMapFullscreen}
                      aria-label={t("home.householdMapFullscreen")}
                      title={t("home.householdMapFullscreen")}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </div>
                }
              >
                {renderHouseholdMapSurface(
                  "relative h-72 overflow-hidden rounded-lg border border-brand-100 dark:border-slate-700",
                  false,
                )}
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {!mapHasPin
                    ? t("home.householdMapPoiNeedsAddress")
                    : nearbyPoiQuery.isFetching
                      ? t("home.householdMapPoiLoading")
                      : nearbyPoiQuery.isError
                        ? t("home.householdMapPoiError")
                        : t("home.householdMapPoiCount", {
                            count: nearbyPois.length,
                          })}
                </div>
                {myLocationStatus === "loading" ? (
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("home.householdMapLocating")}
                  </div>
                ) : null}
                {myLocationError ? (
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    {myLocationError}
                  </div>
                ) : null}
                {poiOverrideError ? (
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    {poiOverrideError}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {myActiveLiveLocation ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void stopLiveLocationShareNow();
                      }}
                      disabled={liveShareStatus === "stopping"}
                    >
                      {t("home.householdMapLiveShareStop")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setIsLiveShareDialogOpen(true);
                      }}
                      disabled={liveShareStatus === "starting"}
                    >
                      {t("home.householdMapLiveShareStart")}
                    </Button>
                  )}
                  {myActiveLiveLocation ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("home.householdMapLiveShareActiveUntil", {
                        at: formatDateTime(
                          myActiveLiveLocation.expires_at,
                          language,
                          myActiveLiveLocation.expires_at,
                        ),
                      })}
                    </span>
                  ) : null}
                </div>
                {liveShareError ? (
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    {liveShareError}
                  </div>
                ) : null}
              </HouseholdMapWidget>
            </Card>
          ) : null}

          {showSummaryWeatherCard ? (
            <Card className="mt-6 rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
              <CardHeader className="gap-1">
                <CardTitle>{householdWeatherTitle}</CardTitle>
                <CardDescription>
                  {t("home.householdWeatherDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {!mapHasPin ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("home.householdWeatherNeedsAddress")}
                  </p>
                ) : householdWeatherQuery.isLoading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("home.householdWeatherLoading")}
                  </p>
                ) : householdWeatherQuery.isError ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {t("home.householdWeatherError")}
                  </p>
                ) : householdWeatherHourly.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("home.householdWeatherEmpty")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {householdWeatherDays.length > 0 ? (
                      <HouseholdWeatherDailyPreview>
                        {householdWeatherDays.map((day, index) => (
                          <div
                            key={`weather-day-${day.date}`}
                            className="w-[168px] shrink-0 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white/95 to-slate-50/90 p-1 shadow-sm dark:border-slate-700/90 dark:from-slate-900/85 dark:to-slate-900/65"
                          >
                            {(() => {
                              const warnings = getDailyWeatherWarnings(day);
                              return (
                                <div className="relative flex items-center justify-center rounded-xl bg-white/70 py-1 pt-4 dark:bg-slate-800/65">
                                  <p className="absolute top-2 left-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {index === 0
                                      ? t("home.householdWeatherRelativeToday")
                                      : index === 1
                                        ? t(
                                            "home.householdWeatherRelativeTomorrow",
                                          )
                                        : index === 2
                                          ? t(
                                              "home.householdWeatherRelativeDayAfterTomorrow",
                                            )
                                          : formatDateOnly(
                                              day.date,
                                              language,
                                              day.date,
                                            )}
                                  </p>
                                  {warnings.icy ||
                                  warnings.heat ||
                                  warnings.storm ||
                                  warnings.uv ? (
                                    <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                                      {warnings.icy ? (
                                        <span
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/90 bg-cyan-50/95 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200"
                                          title={t(
                                            "home.householdWeatherWarningIcy",
                                          )}
                                          aria-label={t(
                                            "home.householdWeatherWarningIcy",
                                          )}
                                        >
                                          <Snowflake className="h-3 w-3" />
                                        </span>
                                      ) : null}
                                      {warnings.heat ? (
                                        <span
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-orange-200/90 bg-orange-50/95 text-orange-700 dark:border-orange-800 dark:bg-orange-900/40 dark:text-orange-200"
                                          title={t(
                                            "home.householdWeatherWarningHeat",
                                          )}
                                          aria-label={t(
                                            "home.householdWeatherWarningHeat",
                                          )}
                                        >
                                          <Flame className="h-3 w-3" />
                                        </span>
                                      ) : null}
                                      {warnings.storm ? (
                                        <span
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-indigo-200/90 bg-indigo-50/95 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                                          title={t(
                                            "home.householdWeatherWarningStorm",
                                          )}
                                          aria-label={t(
                                            "home.householdWeatherWarningStorm",
                                          )}
                                        >
                                          <Wind className="h-3 w-3" />
                                        </span>
                                      ) : null}
                                      {warnings.uv ? (
                                        <span
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/90 bg-amber-50/95 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                          title={t(
                                            "home.householdWeatherWarningUv",
                                          )}
                                          aria-label={t(
                                            "home.householdWeatherWarningUv",
                                          )}
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
                              );
                            })()}
                            <p className="p-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {t("home.householdWeatherTemp", {
                                max:
                                  day.tempMaxC === null
                                    ? "—"
                                    : Math.round(day.tempMaxC),
                                min:
                                  day.tempMinC === null
                                    ? "—"
                                    : Math.round(day.tempMinC),
                              })}
                            </p>
                            <p className="px-2 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                              {t("home.householdWeatherPrecip", {
                                mm:
                                  day.precipitationMm === null
                                    ? "—"
                                    : Number(day.precipitationMm.toFixed(1)),
                                prob:
                                  day.precipitationProbabilityPercent === null
                                    ? "—"
                                    : Math.round(
                                        day.precipitationProbabilityPercent,
                                      ),
                              })}
                            </p>
                            <p className="px-2 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                              {t("home.householdWeatherWind", {
                                min:
                                  day.windSpeedKmh === null &&
                                  day.windGustKmh === null
                                    ? "—"
                                    : Math.min(
                                          day.windSpeedKmh ??
                                            Number.POSITIVE_INFINITY,
                                          day.windGustKmh ??
                                            Number.POSITIVE_INFINITY,
                                        ) === Number.POSITIVE_INFINITY
                                      ? "—"
                                      : Math.round(
                                          Math.min(
                                            day.windSpeedKmh ??
                                              Number.POSITIVE_INFINITY,
                                            day.windGustKmh ??
                                              Number.POSITIVE_INFINITY,
                                          ),
                                        ),
                                max:
                                  day.windSpeedKmh === null &&
                                  day.windGustKmh === null
                                    ? "—"
                                    : Math.max(
                                        day.windSpeedKmh ?? 0,
                                        day.windGustKmh ?? 0,
                                      ),
                                dir: getWindDirectionLabel(
                                  day.windDirectionDeg,
                                ),
                              })}
                            </p>
                          </div>
                        ))}
                      </HouseholdWeatherDailyPreview>
                    ) : null}
                    <HouseholdWeatherPlot
                      hint={t("home.householdWeatherChartHint")}
                      isMobile={isMobileBucketComposer}
                      legendButtonLabel={t("home.householdWeatherLegendButton")}
                      legendItems={weatherLegendItems}
                      onToggleLegendItem={toggleWeatherLegendDataset}
                    >
                      <div
                        ref={weatherChartContainerRef}
                        className="h-64 rounded-lg  overflow-hidden border border-slate-200/90 bg-white/80 dark:border-slate-700/90 dark:bg-slate-900/70"
                        onDoubleClick={zoomOutWeatherChart}
                        onTouchEndCapture={onWeatherChartTouchEndCapture}
                      >
                        <Chart
                          ref={weatherChartRef}
                          type="bar"
                          data={householdWeatherChartData}
                          options={householdWeatherChartOptions}
                        />
                      </div>
                    </HouseholdWeatherPlot>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Dialog
            open={isLiveShareDialogOpen}
            onOpenChange={(open) => {
              if (liveShareStatus === "starting") return;
              setIsLiveShareDialogOpen(open);
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {t("home.householdMapLiveShareStart")}
                </DialogTitle>
                <DialogDescription>
                  {t("home.householdMapLiveShareDialogDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>{t("home.householdMapLiveShareDurationLabel")}</Label>
                  <Select
                    value={String(liveShareDurationMinutes)}
                    onValueChange={(value) =>
                      setLiveShareDurationMinutes(Number(value))
                    }
                    disabled={liveShareStatus === "starting"}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={t(
                          "home.householdMapLiveShareDurationLabel",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {LIVE_LOCATION_DURATION_OPTIONS.map((minutes) => (
                        <SelectItem
                          key={`live-duration-dialog-${minutes}`}
                          value={String(minutes)}
                        >
                          {t("home.householdMapLiveShareMinutes", { minutes })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsLiveShareDialogOpen(false)}
                    disabled={liveShareStatus === "starting"}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={onConfirmStartLiveShare}
                    disabled={liveShareStatus === "starting"}
                  >
                    {t("home.householdMapLiveShareStart")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isWhiteboardFullscreenOpen}
            onOpenChange={(open) => {
              if (!open) closeWhiteboardFullscreen();
            }}
          >
            <DialogContent className="inset-0 left-0 top-0 flex h-[100dvh] w-[100vw] max-w-none -translate-x-0 -translate-y-0 flex-col overflow-hidden rounded-none border-0 p-0 [padding-bottom:var(--safe-area-bottom)] [padding-left:var(--safe-area-left)] [padding-right:var(--safe-area-right)] [padding-top:var(--safe-area-top)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <DialogTitle>{t("home.whiteboardTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("home.whiteboardDescription")}
                  </DialogDescription>
                  {whiteboardOnlineMembers.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        {t("home.whiteboardOnlineNow", {
                          count: whiteboardOnlineMembers.length,
                        })}
                      </span>
                      {whiteboardOnlineMembers.slice(0, 10).map((member) => (
                        <span
                          key={`wb-online-full-${member.user_id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {memberLabel(member.user_id)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {whiteboardStatusIndicator}
                  <span className="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:inline">
                    {whiteboardStatusLabel}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-200/80 dark:text-brand-100 dark:hover:bg-slate-800"
                    onClick={closeWhiteboardFullscreen}
                    aria-label={t("common.close")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center border border-brand-100 bg-white/70 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                      {t("common.loading")}
                    </div>
                  }
                >
                  <ExcalidrawBoardLazy
                    sceneJson={whiteboardDraft}
                    onSceneChange={(nextValue) => {
                      setWhiteboardDraft(nextValue);
                    }}
                    className="border border-brand-100 bg-white dark:border-slate-700"
                    height={1600}
                    fullHeight
                  />
                </Suspense>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isMapFullscreenOpen}
            onOpenChange={(open) => {
              if (!open) closeMapFullscreen();
            }}
          >
            <DialogContent className="inset-0 left-0 top-0 flex h-[100dvh] w-[100vw] max-w-none -translate-x-0 -translate-y-0 flex-col overflow-hidden rounded-none border-0 p-0 [padding-bottom:var(--safe-area-bottom)] [padding-left:var(--safe-area-left)] [padding-right:var(--safe-area-right)] [padding-top:var(--safe-area-top)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <DialogTitle>{t("home.householdMapTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("home.householdMapDescription")}
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-200/80 dark:text-brand-100 dark:hover:bg-slate-800"
                  onClick={closeMapFullscreen}
                  aria-label={t("common.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1">
                {renderHouseholdMapSurface(
                  "relative h-full overflow-hidden border-brand-100 dark:border-slate-700",
                  true,
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <Dialog
        open={mapDeleteConfirm !== null}
        onOpenChange={(open) => {
          if (open) return;
          cancelMapDeletion();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("home.householdMapDeleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {mapDeleteConfirm && mapDeleteConfirm.removedMarkers.length === 1
                ? t("home.householdMapDeleteConfirmDescriptionOne")
                : t("home.householdMapDeleteConfirmDescriptionMany", {
                    count: mapDeleteConfirm?.removedMarkers.length ?? 0
                  })}
            </DialogDescription>
          </DialogHeader>
          {mapDeleteConfirm?.removedMarkers?.length ? (
            <div className="max-h-44 space-y-1 overflow-auto rounded-md border border-slate-200/80 bg-slate-50/70 p-2 text-xs dark:border-slate-700/80 dark:bg-slate-900/60">
              {mapDeleteConfirm.removedMarkers.slice(0, 8).map((marker) => (
                <p key={`remove-preview-${marker.id}`} className="truncate">
                  {getMarkerEmoji(marker.icon)} {marker.title}
                </p>
              ))}
              {mapDeleteConfirm.removedMarkers.length > 8 ? (
                <p className="text-slate-500 dark:text-slate-400">
                  +{mapDeleteConfirm.removedMarkers.length - 8}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={cancelMapDeletion}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
              onClick={confirmMapDeletion}
            >
              {t("home.householdMapDeleteConfirmAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingMarkerDraft !== null}
        onOpenChange={(open) => {
          if (!open && !editingMarkerSaving) {
            setEditingMarkerDraft(null);
            setEditingMarkerError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("home.householdMapMarkerEditTitle")}</DialogTitle>
            <DialogDescription>
              {t("home.householdMapMarkerEditDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("home.householdMapMarkerIconLabel")}</Label>
              <Select
                value={editingMarkerDraft?.icon ?? "star"}
                onValueChange={(value) =>
                  setEditingMarkerDraft((current) =>
                    current
                      ? {
                          ...current,
                          icon: value as HouseholdMapMarkerIcon,
                        }
                      : current,
                  )
                }
                disabled={editingMarkerSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_MARKER_ICON_OPTIONS.map((option) => (
                    <SelectItem
                      key={`marker-edit-icon-${option.id}`}
                      value={option.id}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{getMarkerEmoji(option.id)}</span>
                        <span>{t(option.labelKey as never)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("home.householdMapMarkerTitleLabel")}</Label>
              <Input
                value={editingMarkerDraft?.title ?? ""}
                onChange={(event) =>
                  setEditingMarkerDraft((current) =>
                    current
                      ? {
                          ...current,
                          title: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder={t("home.householdMapMarkerTitlePlaceholder")}
                disabled={editingMarkerSaving}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("home.householdMapMarkerDescriptionLabel")}</Label>
              <Input
                value={editingMarkerDraft?.description ?? ""}
                onChange={(event) =>
                  setEditingMarkerDraft((current) =>
                    current
                      ? {
                          ...current,
                          description: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder={t("home.householdMapMarkerDescriptionPlaceholder")}
                disabled={editingMarkerSaving}
              />
            </div>
            {editingMarkerMeta ? markerHistoryNode(editingMarkerMeta) : null}
            {editingMarkerError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {editingMarkerError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingMarkerDraft(null);
                  setEditingMarkerError(null);
                }}
                disabled={editingMarkerSaving}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void saveEditedMarker()}
                disabled={editingMarkerSaving}
              >
                {editingMarkerSaving
                  ? t("home.householdMapPoiOverrideSaving")
                  : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingCompleteTask !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCompleteTask(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="absolute right-3 top-3 h-8 w-8 p-0"
            onClick={() => setPendingCompleteTask(null)}
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </Button>
          <DialogHeader>
            <DialogTitle>{t("tasks.confirmCompleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("tasks.confirmCompleteDescription", {
                title: pendingCompleteTask?.title ?? t("tasks.fallbackTitle"),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingCompleteTask(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void onConfirmCompleteTask()}
            >
              {t("tasks.confirmCompleteAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
