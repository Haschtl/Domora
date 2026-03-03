import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
  Tooltip as ChartTooltip,
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
  CircleDot,
  ExternalLink,
  House,
  Loader2,
  Map as MapIcon,
  Mountain,
  LocateFixed,
  Moon,
  Pencil,
  Receipt,
  Route,
  Ruler,
  Satellite,
  Search,
  SlidersHorizontal,
  Sun,
  ShoppingCart,
  Wallet,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import {
  type JsxComponentDescriptor,
  type JsxEditorProps,
  type MDXEditorMethods,
  useLexicalNodeRemove,
} from "@mdxeditor/editor";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  Rectangle,
  TileLayer,
  Tooltip as LeafletTooltip,
} from "react-leaflet";
import { createTrianglifyBannerBackground } from "../../lib/banner";
import {
  formatDateOnly,
  formatDateTime,
  formatShortDay,
  getLastMonthRange,
} from "../../lib/date";
import { suggestCategoryLabel } from "../../lib/category-heuristics";
import {
  getHouseholdLiveLocations,
  getHouseholdReachability,
  getHouseholdRoute,
  getNearbyPois,
  type ReachabilityGeoJson,
  type RouteGeoJson,
  startHouseholdLiveLocationShare,
  stopHouseholdLiveLocationShare,
  updateHouseholdLiveLocationShare,
} from "../../lib/api";
import { createMemberLabelGetter } from "../../lib/member-label";
import {
  createDiceBearAvatarDataUri,
  getMemberAvatarSeed,
} from "../../lib/avatar";
import { calculateBalancesByMember } from "../../lib/finance-math";
import { getMemberOfMonth } from "../../lib/task-leaderboard";
import { isMemberOnVacation } from "../../lib/vacation-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { MemberAvatar } from "../../components/member-avatar";
const ExcalidrawBoardLazy = lazy(() =>
  import("../../components/excalidraw-board").then((module) => ({
    default: module.ExcalidrawBoard,
  })),
);
import { ErrorBoundary } from "../../components/error-boundary";
import type {
  BucketItem,
  CashAuditRequest,
  FinanceEntry,
  HouseholdEvent,
  HouseholdLiveLocation,
  HouseholdMember,
  HouseholdMemberVacation,
  NearbyPoi,
  PoiCategory,
  HouseholdMapMarker,
  HouseholdMapMarkerIcon,
  UpdateHouseholdInput,
  TaskCompletion,
  TaskItem,
} from "../../lib/types";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  buildMonthGrid,
  dayKey,
  startOfMonth,
} from "../../features/tasks-calendar";
import {
  HouseholdCalendarWidget,
  HouseholdWhiteboardWidget,
} from "../../features/components/widgets";
import { FileExplorer } from "../../features/components/file-explorer";
import { queryKeys } from "../../lib/query-keys";
import { supabase } from "../../lib/supabase";
import {
  type LandingWidgetKey,
  canEditLandingByRole,
  getEffectiveLandingMarkdown,
  getSavedLandingMarkdown,
} from "../../features/home-landing.utils";
import {
  type HomeCalendarEntry,
  type HomeCalendarVacationEntry,
  type HomeCalendarVacationSpan,
  MAX_CALENDAR_TOOLTIP_ITEMS,
} from "./modules/calendar";
import {
  LANDING_WIDGET_COMPONENTS,
  convertEditorJsxToLandingTokens,
  convertLandingTokensToEditorJsx,
  getWidgetOrderFromMdastNode,
  insertTextAroundWidget,
  moveWidgetInMarkdown,
  splitLandingContentSegments,
  widgetTokenFromKey,
} from "./modules/landing-page";
import { LandingWidgetEditorShell } from "./modules/landing-page-editor-shell";
import {
  type MapMeasureMode,
  type MapMeasureResult,
  type MapMobilityLayerToggles,
  type MapReachabilityMode,
  type MapSearchResult,
  type MapSearchViewportBounds,
  type MapSearchZoomRequest,
  type MapStyleId,
  type MapWeatherLayerToggles,
  type ManualMarkerFilterMode,
  ADDRESS_GEOCODE_DEBOUNCE_MS,
  BIKE_NETWORK_ATTRIBUTION,
  BIKE_NETWORK_TILE_URL,
  DEFAULT_MANUAL_MARKER_COLOR,
  DEFAULT_MAP_CENTER,
  GEOCODE_CACHE_TTL_MS,
  GEOCODE_NEGATIVE_CACHE_TTL_MS,
  LIVE_LOCATION_DURATION_OPTIONS,
  MANUAL_MARKER_ICON_OPTIONS,
  MAP_STYLE_OPTIONS,
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_WITH_ADDRESS,
  MAP_ZOOM_WITH_ADDRESS_FALLBACK,
  MIN_ADDRESS_LENGTH_FOR_GEOCODE,
  POI_CATEGORY_OPTIONS,
  POI_CLUSTER_GRID_PX_HIGH_ZOOM,
  POI_CLUSTER_GRID_PX_LOW_ZOOM,
  POI_CLUSTER_MIN_ZOOM,
  POI_RADIUS_METERS,
  REACHABILITY_MINUTES_DEFAULT,
  REACHABILITY_OPTIONS,
  TRAFFIC_LAYER_CACHE_TTL_MS,
  TRAFFIC_LAYER_FETCH_CONCURRENCY,
  TRAFFIC_LAYER_MAX_INCIDENTS,
  TRAFFIC_LAYER_MAX_ROADS_PER_CYCLE,
  TRAFFIC_LAYER_REFRESH_MS,
  TRANSIT_LAYER_DEPARTURE_LIMIT,
  TRANSIT_LAYER_FETCH_BACKOFF_MS,
  TRANSIT_LAYER_FETCH_RETRIES,
  TRANSIT_LAYER_RADIUS_METERS,
  TRANSIT_LAYER_REFRESH_MS,
  TRANSIT_LAYER_STOP_LIMIT,
  readPersistedMapSettings,
  writePersistedMapSettings,
} from "./modules/map";
import {
  type DomoraLeafletLayer,
  type LocateControlHandle,
  AddressMapView,
  DwdTimeDimensionBridge,
  FullscreenMapViewportBridge,
  GeomanEditorBridge,
  GeomanMeasureBridge,
  LocateControlBridge,
  MapClosePopupBridge,
  MapInlineFullscreenBridge,
  MapOverlayDismissBridge,
  MapSearchZoomBridge,
  MapZoomBridge,
  QuickPinDropBridge,
  ReachabilityFitBoundsBridge,
  ReachabilityLayerBridge,
  RecenterMapOnRequest,
  RouteFitBoundsBridge,
  RouteLayerBridge,
  RouteTargetPickBridge,
  calculatePolygonAreaSqm,
  calculatePolylineDistanceMetersFromLatLngs,
  createMarkerId,
  formatAreaShort,
  formatDistanceCompact,
  formatDistanceShort,
  isClosedVectorPath,
  normalizeMarkerColor,
} from "./modules/map-bridges";
import { MAX_WHITEBOARD_BYTES } from "./modules/whiteboard";
import {
  StaticWeatherCalendarIcon,
  WeatherDailyForecast,
  WeatherForecastGraph,
  WeatherPanelContent,
  WeatherProvider,
  WeatherTodayIcon,
} from "./modules/weather-section";
import { BucketList } from "./modules/bucketList";
import { useWorkspace } from "../../context/workspace-context";
import { useMarkdownComponents } from "../../features/components/markdown";

const MXEditorLazy = lazy(() =>
  import("../../components/mx-editor").then((module) => ({
    default: module.MXEditor,
  })),
);

interface HomePageProps {
  section?: "summary" | "bucket" | "feed";
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
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ChartTooltip,
  Legend,
  Filler,
  zoomPlugin,
);

let leafletMarkerConfigured = false;
const ensureLeafletMarkerIcon = () => {
  if (leafletMarkerConfigured) return;
  leafletMarkerConfigured = true;
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })
    ._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2xUrl,
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl,
  });
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
const getManualMarkerIcon = (
  icon: HouseholdMapMarkerIcon,
  color?: string | null,
) => {
  const normalizedColor = normalizeMarkerColor(color);
  const cacheKey = `${icon}|${normalizedColor}`;
  const cached = markerDivIconCache.get(cacheKey);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-marker-icon",
    html: `<div style="position:relative;width:34px;height:44px;display:flex;align-items:flex-start;justify-content:center"><div style="background:${normalizedColor};border:2px solid #fff;color:#fff;width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.35)">${getMarkerEmoji(icon)}</div><div style="position:absolute;top:27px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:13px solid ${normalizedColor};filter:drop-shadow(0 2px 4px rgba(0,0,0,.28))"></div></div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40],
  });
  markerDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};

const escapeHtmlAttr = (value: string) => value.replace(/"/g, "&quot;");
const escapeHtmlText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    popupAnchor: [0, -32],
  });
  liveLocationUserIconCache.set(cacheKey, divIcon);
  return divIcon;
};

const getHouseholdMarkerCenter = (
  marker: HouseholdMapMarker,
): [number, number] | null => {
  switch (marker.type) {
    case "point":
      return [marker.lat, marker.lon];
    case "vector":
      return marker.points.length > 0
        ? [marker.points[0]!.lat, marker.points[0]!.lon]
        : null;
    case "circle":
      return [marker.center.lat, marker.center.lon];
    case "rectangle":
      return [
        (marker.bounds.south + marker.bounds.north) / 2,
        (marker.bounds.west + marker.bounds.east) / 2,
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

const getMarkerIconFromPoiCategory = (
  category: PoiCategory,
): HouseholdMapMarkerIcon => {
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
    popupAnchor: [0, -23],
  });
  poiDivIconCache.set(category, divIcon);
  return divIcon;
};
const poiClusterDivIconCache = new Map<string, L.DivIcon>();
const getPoiClusterMarkerIcon = (count: number) => {
  const cacheKey = String(Math.max(1, Math.min(999, Math.round(count))));
  const cached = poiClusterDivIconCache.get(cacheKey);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-poi-cluster-icon",
    html: `<div style="background:#0f172a;border:2px solid #fff;color:#fff;min-width:30px;height:30px;padding:0 8px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.35)">${escapeHtmlText(cacheKey)}</div>`,
    iconSize: [36, 30],
    iconAnchor: [18, 30],
    popupAnchor: [0, -26],
  });
  poiClusterDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};
type RenderMapPopupActionsFn = (args: {
  lat: number;
  lon: number;
  onEdit?: () => void;
  editLabelKey?:
    | "home.householdMapMarkerEditAction"
    | "home.householdMapQuickPinCreate";
}) => ReactNode;

type BucketMapEntry = {
  item: BucketItem;
  lat: number;
  lon: number;
  label: string;
};

const BucketMapMarker = memo(
  ({
    entry,
    userId,
    busy,
    onToggleBucketDateVote,
    formatSuggestedDate,
    renderMapPopupActions,
  }: {
    entry: BucketMapEntry;
    userId: string;
    busy: boolean;
    onToggleBucketDateVote: (
      item: BucketItem,
      suggestedDate: string,
      voted: boolean,
    ) => Promise<void>;
    formatSuggestedDate: (value: string) => string;
    renderMapPopupActions: RenderMapPopupActionsFn;
  }) => {
    const { t } = useTranslation();
    const [popupHydrated, setPopupHydrated] = useState(false);
    const item = entry.item;
    return (
      <Marker
        position={[entry.lat, entry.lon]}
        icon={getBucketMapMarkerIcon()}
        pmIgnore
        eventHandlers={{
          popupopen: () => {
            setPopupHydrated(true);
          },
        }}
      >
        <Popup>
          {!popupHydrated ? (
            <div className="space-y-1">
              <p className="font-semibold">🪣 {item.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                {entry.label}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold">🪣 {item.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                {entry.label}
              </p>
              {item.description_markdown.trim().length > 0 ? (
                <div className="prose prose-xs max-w-none text-xs dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {item.description_markdown}
                  </ReactMarkdown>
                </div>
              ) : null}
              {item.suggested_dates.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("home.bucketSuggestedDatesTitle")}
                  </p>
                  <ul className="space-y-1">
                    {item.suggested_dates.map((dateValue) => {
                      const voters = item.votes_by_date[dateValue] ?? [];
                      const hasVoted = voters.includes(userId);
                      return (
                        <li
                          key={`bucket-map-vote-${item.id}-${dateValue}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 dark:border-slate-700 dark:bg-slate-800/70"
                        >
                          <span className="text-[11px] text-slate-700 dark:text-slate-300">
                            {formatSuggestedDate(dateValue)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t("home.bucketVotes", { count: voters.length })}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant={hasVoted ? "default" : "outline"}
                              className="h-6 px-2 text-[10px]"
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
              {renderMapPopupActions({
                lat: entry.lat,
                lon: entry.lon,
              })}
            </div>
          )}
        </Popup>
      </Marker>
    );
  },
);
BucketMapMarker.displayName = "BucketMapMarker";

const PoiMapMarker = memo(
  ({
    poi,
    isHouseholdOwner,
    activePoiEditorId,
    setActivePoiEditorId,
    poiOverrideDrafts,
    poiOverrideMarkersByRef,
    setPoiOverrideDrafts,
    poiOverrideSavingId,
    onSavePoiOverride,
    renderMapPopupActions,
  }: {
    poi: NearbyPoi;
    isHouseholdOwner: boolean;
    activePoiEditorId: string | null;
    setActivePoiEditorId: (
      updater: string | null | ((current: string | null) => string | null),
    ) => void;
    poiOverrideDrafts: Record<string, { title: string; description: string }>;
    poiOverrideMarkersByRef: Map<string, HouseholdMapMarker>;
    setPoiOverrideDrafts: (
      updater: (
        current: Record<string, { title: string; description: string }>,
      ) => Record<string, { title: string; description: string }>,
    ) => void;
    poiOverrideSavingId: string | null;
    onSavePoiOverride: (poi: NearbyPoi) => Promise<void>;
    renderMapPopupActions: RenderMapPopupActionsFn;
  }) => {
    const { t } = useTranslation();
    const [popupHydrated, setPopupHydrated] = useState(false);
    return (
      <Marker
        position={[poi.lat, poi.lon]}
        icon={getPoiMarkerIcon(poi.category)}
        pmIgnore
        eventHandlers={{
          popupopen: () => {
            setPopupHydrated(true);
          },
        }}
      >
        <Popup>
          {!popupHydrated ? (
            <div className="space-y-1">
              <p className="font-semibold">
                {getPoiEmoji(poi.category)}{" "}
                {poi.name ?? t("home.householdMapPoiUnnamed")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                {t(`home.householdMapPoiCategory.${poi.category}` as never)}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold">
                {getPoiEmoji(poi.category)}{" "}
                {poi.name ?? t("home.householdMapPoiUnnamed")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                {t(`home.householdMapPoiCategory.${poi.category}` as never)}
              </p>
              {typeof poi.tags["addr:street"] === "string" ? (
                <p className="text-xs">
                  {poi.tags["addr:street"]}
                  {typeof poi.tags["addr:housenumber"] === "string"
                    ? ` ${poi.tags["addr:housenumber"]}`
                    : ""}
                </p>
              ) : null}
              {renderMapPopupActions({
                lat: poi.lat,
                lon: poi.lon,
                onEdit: isHouseholdOwner
                  ? () =>
                      setActivePoiEditorId((current) =>
                        current === poi.id ? null : poi.id,
                      )
                  : undefined,
              })}
              {activePoiEditorId === poi.id ? (
                <div className="space-y-1 pt-1">
                  <Input
                    value={
                      poiOverrideDrafts[poi.id]?.title ??
                      poiOverrideMarkersByRef.get(poi.id)?.title ??
                      poi.name ??
                      ""
                    }
                    onChange={(event) =>
                      setPoiOverrideDrafts((current) => ({
                        ...current,
                        [poi.id]: {
                          title: event.target.value,
                          description:
                            current[poi.id]?.description ??
                            poiOverrideMarkersByRef.get(poi.id)?.description ??
                            "",
                        },
                      }))
                    }
                    placeholder={t(
                      "home.householdMapPoiOverrideTitlePlaceholder",
                    )}
                  />
                  <Input
                    value={
                      poiOverrideDrafts[poi.id]?.description ??
                      poiOverrideMarkersByRef.get(poi.id)?.description ??
                      ""
                    }
                    onChange={(event) =>
                      setPoiOverrideDrafts((current) => ({
                        ...current,
                        [poi.id]: {
                          title:
                            current[poi.id]?.title ??
                            poiOverrideMarkersByRef.get(poi.id)?.title ??
                            poi.name ??
                            "",
                          description: event.target.value,
                        },
                      }))
                    }
                    placeholder={t(
                      "home.householdMapPoiOverrideDescriptionPlaceholder",
                    )}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full"
                    onClick={() => {
                      void onSavePoiOverride(poi);
                    }}
                    disabled={
                      !isHouseholdOwner || poiOverrideSavingId === poi.id
                    }
                  >
                    {poiOverrideSavingId === poi.id
                      ? t("home.householdMapPoiOverrideSaving")
                      : t("home.householdMapPoiOverrideSave")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </Popup>
      </Marker>
    );
  },
);
PoiMapMarker.displayName = "PoiMapMarker";

const ManualMarkerPopup = memo(
  ({
    marker,
    isHouseholdOwner,
    openMarkerEdit,
    renderMapPopupActions,
  }: {
    marker: HouseholdMapMarker;
    isHouseholdOwner: boolean;
    openMarkerEdit: (marker: HouseholdMapMarker) => void;
    renderMapPopupActions: RenderMapPopupActionsFn;
  }) => {
    const { t } = useTranslation();
    const [popupHydrated, setPopupHydrated] = useState(false);

    const center = useMemo(() => getHouseholdMarkerCenter(marker), [marker]);
    const markerGeometry = useMemo(() => {
      let summary: { area: string; perimeter: string } | null = null;
      let circleCompact: string | null = null;

      if (marker.type === "circle") {
        const radius = Math.max(0, marker.radius_meters);
        const diameter = radius * 2;
        const perimeter = 2 * Math.PI * radius;
        const area = Math.PI * radius * radius;
        summary = {
          area: formatAreaShort(area),
          perimeter: formatDistanceShort(perimeter),
        };
        circleCompact = `⌀ ${formatDistanceCompact(diameter)} (r=${formatDistanceCompact(radius)})`;
      } else if (marker.type === "rectangle") {
        const southWest = L.latLng(marker.bounds.south, marker.bounds.west);
        const southEast = L.latLng(marker.bounds.south, marker.bounds.east);
        const northWest = L.latLng(marker.bounds.north, marker.bounds.west);
        const width = southWest.distanceTo(southEast);
        const height = southWest.distanceTo(northWest);
        const perimeter = Math.max(0, 2 * (width + height));
        const area = Math.max(0, width * height);
        summary = {
          area: formatAreaShort(area),
          perimeter: formatDistanceShort(perimeter),
        };
      } else if (marker.type === "vector") {
        const latLngPoints = marker.points.map((point) =>
          L.latLng(point.lat, point.lon),
        );
        if (isClosedVectorPath(latLngPoints)) {
          const first = latLngPoints[0];
          const last = latLngPoints[latLngPoints.length - 1];
          const closeDistance = first && last ? first.distanceTo(last) : 0;
          if (first && last) {
            const baseLength =
              calculatePolylineDistanceMetersFromLatLngs(latLngPoints);
            const perimeter =
              closeDistance > 0.001 ? baseLength + closeDistance : baseLength;
            const area = calculatePolygonAreaSqm(latLngPoints);
            summary = {
              area: formatAreaShort(area),
              perimeter: formatDistanceShort(perimeter),
            };
          }
        }
      }

      return { summary, circleCompact };
    }, [marker]);

    return (
      <Popup
        eventHandlers={{
          add: () => setPopupHydrated(true),
        }}
      >
        {!popupHydrated ? (
          <div className="space-y-1">
            <p className="font-semibold">
              {getMarkerEmoji(marker.icon)} {marker.title}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-semibold">
              {getMarkerEmoji(marker.icon)} {marker.title}
            </p>
            {marker.description ? (
              <div className="prose prose-xs max-w-none text-xs dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {marker.description}
                </ReactMarkdown>
              </div>
            ) : null}
            {marker.image_b64 ? (
              <img
                src={marker.image_b64}
                alt={marker.title}
                className="max-h-32 w-full rounded object-cover"
              />
            ) : null}
            {markerGeometry.summary ? (
              <div className="mt-0.5 space-y-0.5 border-t border-slate-200 pt-0.5 text-[11px] leading-tight text-slate-700 dark:border-slate-700 dark:text-slate-300">
                <p>
                  {t("home.householdMapMarkerMetricArea")}:{" "}
                  {markerGeometry.summary.area} ·{" "}
                  {t("home.householdMapMarkerMetricPerimeter")}:{" "}
                  {markerGeometry.summary.perimeter}
                </p>
                {markerGeometry.circleCompact ? (
                  <p>{markerGeometry.circleCompact}</p>
                ) : null}
              </div>
            ) : null}
            {center
              ? renderMapPopupActions({
                  lat: center[0],
                  lon: center[1],
                  onEdit: isHouseholdOwner
                    ? () => openMarkerEdit(marker)
                    : undefined,
                })
              : null}
          </div>
        )}
      </Popup>
    );
  },
);
ManualMarkerPopup.displayName = "ManualMarkerPopup";

const bucketMapDivIconCache = new Map<string, L.DivIcon>();
const getBucketMapMarkerIcon = () => {
  const cacheKey = "default";
  const cached = bucketMapDivIconCache.get(cacheKey);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-bucket-icon",
    html: '<div style="position:relative;width:30px;height:38px;display:flex;align-items:flex-start;justify-content:center"><div style="background:#2563eb;border:2px solid #fff;color:#fff;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.33)">🪣</div><div style="position:absolute;top:21px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:11px solid #2563eb;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))"></div></div>',
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });
  bucketMapDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};

const searchDivIconCache = new Map<string, L.DivIcon>();
const getSearchResultMarkerIcon = () => {
  const cacheKey = "default";
  const cached = searchDivIconCache.get(cacheKey);
  if (cached) return cached;
  const divIcon = L.divIcon({
    className: "domora-map-search-icon",
    html: '<div style="position:relative;width:28px;height:36px;display:flex;align-items:flex-start;justify-content:center"><div style="background:#1d4ed8;border:2px solid #fff;color:#fff;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.33)">🔎</div><div style="position:absolute;top:21px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:11px solid #1d4ed8;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))"></div></div>',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
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
    popupAnchor: [0, -32],
  });
  routePointDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};
const mobilityMarkerDivIconCache = new Map<string, L.DivIcon>();
const getMobilityMarkerIcon = (tone: "transit" | "traffic") => {
  const cacheKey = tone;
  const cached = mobilityMarkerDivIconCache.get(cacheKey);
  if (cached) return cached;
  const color = tone === "transit" ? "#0f766e" : "#b91c1c";
  const innerHtml =
    tone === "transit"
      ? '<div style="background:#facc15;border:2px solid #065f46;color:#065f46;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.33)">H</div>'
      : '<div style="background:#b91c1c;border:2px solid #fff;color:#fff;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.33)">🚗</div>';
  const divIcon = L.divIcon({
    className: "domora-map-mobility-icon",
    html: `<div style="position:relative;width:28px;height:36px;display:flex;align-items:flex-start;justify-content:center">${innerHtml}<div style="position:absolute;top:21px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:11px solid ${color};filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))"></div></div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -30],
  });
  mobilityMarkerDivIconCache.set(cacheKey, divIcon);
  return divIcon;
};
const parseTrafficCoordinate = (value: unknown): [number, number] | null => {
  if (!value) return null;
  if (typeof value === "string") {
    const parts = value.split(",").map((entry) => Number(entry.trim()));
    if (
      parts.length >= 2 &&
      Number.isFinite(parts[0]) &&
      Number.isFinite(parts[1])
    ) {
      return [parts[0]!, parts[1]!];
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    const candidate = value as {
      lat?: unknown;
      long?: unknown;
      lon?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      coordinates?: unknown;
    };
    const lat = Number(candidate.lat ?? candidate.latitude);
    const lon = Number(candidate.long ?? candidate.lon ?? candidate.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return [lat, lon];
    }
    if (
      Array.isArray(candidate.coordinates) &&
      candidate.coordinates.length >= 2
    ) {
      if (Array.isArray(candidate.coordinates[0])) {
        const firstPair = candidate.coordinates[0] as unknown[];
        const maybeLon = Number(firstPair[0]);
        const maybeLat = Number(firstPair[1]);
        if (Number.isFinite(maybeLat) && Number.isFinite(maybeLon)) {
          return [maybeLat, maybeLon];
        }
      }
      const maybeLon = Number(candidate.coordinates[0]);
      const maybeLat = Number(candidate.coordinates[1]);
      if (Number.isFinite(maybeLat) && Number.isFinite(maybeLon)) {
        return [maybeLat, maybeLon];
      }
    }
  }
  return null;
};
const parseTrafficIncident = (
  road: string,
  raw: unknown,
): TrafficLiveIncident | null => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const coordinate =
    parseTrafficCoordinate(item.coordinate) ??
    parseTrafficCoordinate(item.point) ??
    parseTrafficCoordinate(item.extent) ??
    parseTrafficCoordinate(item.geometry);
  if (!coordinate) return null;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) return null;
  const subtitle =
    typeof item.subtitle === "string" ? item.subtitle.trim() : "";
  const averageSpeedRaw = Number(item.averageSpeed);
  const averageSpeedKmh = Number.isFinite(averageSpeedRaw)
    ? Math.round(averageSpeedRaw)
    : null;
  const incidentIdRaw =
    typeof item.identifier === "string" ? item.identifier.trim() : "";
  const fallbackId = `${road}:${coordinate[0].toFixed(5)}:${coordinate[1].toFixed(5)}:${title}`;
  const updatedAtIso =
    typeof item.startTimestamp === "string" &&
    item.startTimestamp.trim().length > 0
      ? item.startTimestamp
      : null;
  return {
    id: incidentIdRaw || fallbackId,
    road,
    title,
    subtitle,
    lat: coordinate[0],
    lon: coordinate[1],
    abnormalTrafficType:
      typeof item.abnormalTrafficType === "string"
        ? item.abnormalTrafficType
        : null,
    averageSpeedKmh,
    updatedAtIso,
  };
};

type RouteSummary = {
  anchor: [number, number];
  linePoints: Array<{ lat: number; lon: number }>;
  durationSeconds: number | null;
  distanceMeters: number | null;
  travelType: string | null;
  segmentCount: number;
};

type ReachabilitySummary = {
  anchor: [number, number];
  boundaryPoints: Array<{ lat: number; lon: number }>;
  areaSqm: number | null;
  maxRadiusMeters: number | null;
  polygonCount: number;
  pointCount: number;
};
type GeocodeCandidateResult = {
  lat: number;
  lon: number;
  label: string;
} | null;
type MapPoiDisplayEntry =
  | {
      type: "poi";
      poi: NearbyPoi;
    }
  | {
      type: "cluster";
      id: string;
      lat: number;
      lon: number;
      count: number;
      pois: NearbyPoi[];
      categoryCounts: Partial<Record<PoiCategory, number>>;
    };
type TransitLiveDeparture = {
  id: string;
  lineName: string;
  direction: string;
  departureIso: string | null;
  plannedIso: string | null;
  delaySeconds: number | null;
};
type TransitLiveStop = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number | null;
  departures: TransitLiveDeparture[];
};
type TrafficLiveIncident = {
  id: string;
  road: string;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  abnormalTrafficType: string | null;
  averageSpeedKmh: number | null;
  updatedAtIso: string | null;
};

const geocodeCandidateCache = new Map<
  string,
  { value: GeocodeCandidateResult; expiresAt: number }
>();
const geocodeCandidateInflight = new Map<
  string,
  Promise<GeocodeCandidateResult>
>();
const delayMs = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
const fetchJsonWithRetry = async <T,>(
  url: string,
  init: RequestInit,
  retries = 0,
  backoffMs = 250,
) => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return (await response.json()) as T;
      }
      const isRetryable =
        response.status === 429 ||
        response.status === 503 ||
        response.status >= 500;
      if (!isRetryable || attempt >= retries) {
        throw new Error(`http_${response.status}`);
      }
      await delayMs(backoffMs * (attempt + 1));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("fetch_failed");
      if (attempt >= retries) break;
      await delayMs(backoffMs * (attempt + 1));
    }
  }
  throw lastError ?? new Error("fetch_failed");
};
const trafficRoadsCache = {
  roads: [] as string[],
  fetchedAt: 0,
};
const trafficWarningCache = new Map<
  string,
  { fetchedAt: number; incidents: TrafficLiveIncident[] }
>();

const extractReachabilitySummary = (
  geojson: ReachabilityGeoJson | null,
): ReachabilitySummary | null => {
  if (!geojson) return null;

  const polygons: Array<Array<{ lat: number; lon: number }>> = [];

  for (const feature of geojson.features) {
    if (feature.geometry.type === "Polygon") {
      const rings = feature.geometry.coordinates as number[][][];
      const outerRing = rings[0] ?? [];
      const points = outerRing
        .map((pair) => ({ lon: Number(pair[0]), lat: Number(pair[1]) }))
        .filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon),
        );
      if (points.length >= 3) {
        polygons.push(points);
      }
    }
    if (feature.geometry.type === "MultiPolygon") {
      const polyList = feature.geometry.coordinates as number[][][][];
      for (const polygon of polyList) {
        const outerRing = polygon[0] ?? [];
        const points = outerRing
          .map((pair) => ({ lon: Number(pair[0]), lat: Number(pair[1]) }))
          .filter(
            (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon),
          );
        if (points.length >= 3) {
          polygons.push(points);
        }
      }
    }
  }

  if (polygons.length === 0) return null;

  let largestPolygon: Array<{ lat: number; lon: number }> | null = null;
  let largestAreaSqm = -1;
  let totalAreaSqm = 0;
  let pointCount = 0;

  for (const polygon of polygons) {
    pointCount += polygon.length;
    const latLngs = polygon.map((point) => L.latLng(point.lat, point.lon));
    const area = calculatePolygonAreaSqm(latLngs);
    totalAreaSqm += area;
    if (area > largestAreaSqm) {
      largestAreaSqm = area;
      largestPolygon = polygon;
    }
  }

  if (!largestPolygon || largestPolygon.length < 3) return null;

  const sum = largestPolygon.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lon: acc.lon + point.lon,
    }),
    { lat: 0, lon: 0 },
  );
  const anchor: [number, number] = [
    sum.lat / largestPolygon.length,
    sum.lon / largestPolygon.length,
  ];

  const anchorLatLng = L.latLng(anchor[0], anchor[1]);
  let maxRadiusMeters = 0;
  for (const point of largestPolygon) {
    const distance = anchorLatLng.distanceTo(L.latLng(point.lat, point.lon));
    if (distance > maxRadiusMeters) {
      maxRadiusMeters = distance;
    }
  }

  return {
    anchor,
    boundaryPoints: largestPolygon,
    areaSqm: totalAreaSqm > 0 ? totalAreaSqm : null,
    maxRadiusMeters: maxRadiusMeters > 0 ? maxRadiusMeters : null,
    polygonCount: polygons.length,
    pointCount,
  };
};

const extractRouteSummary = (
  geojson: RouteGeoJson | null,
): RouteSummary | null => {
  if (!geojson) return null;

  let anchor: [number, number] | null = null;
  const linePoints: Array<{ lat: number; lon: number }> = [];
  let durationSeconds: number | null = null;
  let distanceMeters: number | null = null;
  let travelType: string | null = null;
  let segmentCount = 0;

  for (const feature of geojson.features) {
    const properties = feature.properties as
      | { travelTime?: unknown; length?: unknown; travelType?: unknown }
      | undefined;
    if (
      durationSeconds === null &&
      properties &&
      Number.isFinite(Number(properties.travelTime))
    ) {
      durationSeconds = Number(properties.travelTime);
    }
    if (
      distanceMeters === null &&
      properties &&
      Number.isFinite(Number(properties.length))
    ) {
      distanceMeters = Number(properties.length);
    }
    if (
      travelType === null &&
      properties &&
      typeof properties.travelType === "string"
    ) {
      travelType = properties.travelType;
    }

    if (feature.geometry.type === "LineString") {
      const coords = feature.geometry.coordinates as number[][];
      if (coords.length >= 2) {
        segmentCount += coords.length - 1;
      }
      for (const pair of coords) {
        const lon = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        linePoints.push({ lat, lon });
      }
    }
    if (feature.geometry.type === "MultiLineString") {
      const lines = feature.geometry.coordinates as number[][][];
      for (const line of lines) {
        if (line.length >= 2) {
          segmentCount += line.length - 1;
        }
        for (const pair of line) {
          const lon = Number(pair[0]);
          const lat = Number(pair[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          linePoints.push({ lat, lon });
        }
      }
    }
  }

  if (linePoints.length >= 2 && distanceMeters === null) {
    let sum = 0;
    for (let index = 1; index < linePoints.length; index += 1) {
      const prev = linePoints[index - 1]!;
      const next = linePoints[index]!;
      sum += L.latLng(prev.lat, prev.lon).distanceTo(
        L.latLng(next.lat, next.lon),
      );
    }
    distanceMeters = sum;
  }

  if (linePoints.length > 0) {
    const midIndex = Math.floor(linePoints.length / 2);
    const mid = linePoints[midIndex]!;
    anchor = [mid.lat, mid.lon];
  }
  if (!anchor || linePoints.length < 2) return null;

  return {
    anchor,
    linePoints,
    durationSeconds,
    distanceMeters,
    travelType,
    segmentCount,
  };
};

const geocodeAddressCandidate = async (query: string, signal?: AbortSignal) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return null;
  const cacheKey = normalizedQuery.toLowerCase();
  const now = Date.now();
  const cached = geocodeCandidateCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = geocodeCandidateInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(normalizedQuery)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      },
    );
    if (!response.ok) throw new Error("geocode_failed");
    const payload = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const first = payload[0];
    const lat = first?.lat ? Number(first.lat) : Number.NaN;
    const lon = first?.lon ? Number(first.lon) : Number.NaN;
    const result: GeocodeCandidateResult =
      Number.isFinite(lat) && Number.isFinite(lon)
        ? {
            lat,
            lon,
            label: first?.display_name?.trim() || normalizedQuery,
          }
        : null;
    const ttl = result ? GEOCODE_CACHE_TTL_MS : GEOCODE_NEGATIVE_CACHE_TTL_MS;
    geocodeCandidateCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + ttl,
    });
    return result;
  })();

  geocodeCandidateInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    geocodeCandidateInflight.delete(cacheKey);
  }
};

const projectToWorldPixel = (lat: number, lon: number, zoom: number) => {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
};

const mapMeasureAnchorIcon = L.divIcon({
  className: "domora-measure-anchor-icon",
  html: "",
  iconSize: [1, 1],
  iconAnchor: [0, 0],
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

const getTravelModeGlyph = (mode: MapReachabilityMode) => {
  switch (mode) {
    case "walk":
      return "🚶";
    case "bike":
      return "🚲";
    case "car":
      return "🚗";
    case "transit":
      return "🚆";
    default:
      return "🧭";
  }
};

const getWindDirectionLabel = (degrees: number | null) => {
  if (typeof degrees !== "number" || !Number.isFinite(degrees)) return "—";
  const normalized = ((degrees % 360) + 360) % 360;
  const labels = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const index = Math.round(normalized / 45) % 8;
  return labels[index] ?? "—";
};

const formatTransitDepartureTimeLabel = (iso: string, language: string) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const base = new Intl.DateTimeFormat(language, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
  return language.toLowerCase().startsWith("de") ? `${base} Uhr` : base;
};

export const HomePage = ({
  section = "summary",
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
}: HomePageProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    onToggleBucketDateVote,
    households,activeHousehold:household,
    onUpdateHomeMarkdown,
    setActiveHousehold,
    onUpdateHouseholdWhiteboard,
    onUpdateHousehold,
    onCompleteTask,
  } = useWorkspace();

  if (!household){
    throw Error("No household")
  }
  const onSelectHousehold = useCallback(
    (householdId:string) => {
      const next = households.find((entry) => entry.id === householdId);
      if (next) setActiveHousehold(next);
    },
    [households, setActiveHousehold],
  );
  const featureFlags = useMemo(
    () => ({
      bucket: household.feature_bucket_enabled ?? true,
      shopping: household.feature_shopping_enabled ?? true,
      tasks: household.feature_tasks_enabled ?? true,
      finances: household.feature_finances_enabled ?? true,
    }),
    [household],
  );
  const landingInsertOptions = useMemo(
    () => [
      ...(featureFlags.tasks
        ? [
            {
              label: t("home.widgetTasksDue"),
              value: widgetTokenFromKey("tasks-overview"),
            },
            {
              label: t("home.widgetTasksForYou"),
              value: widgetTokenFromKey("tasks-for-you"),
            },
          ]
        : []),
      ...(featureFlags.finances
        ? [
            {
              label: t("home.widgetYourBalance"),
              value: widgetTokenFromKey("your-balance"),
            },
            {
              label: t("home.widgetHouseholdBalance"),
              value: widgetTokenFromKey("household-balance"),
            },
          ]
        : []),
      {
        label: t("home.widgetRecentActivity"),
        value: widgetTokenFromKey("recent-activity"),
      },
      ...(featureFlags.bucket
        ? [
            {
              label: t("home.widgetBucketShortList"),
              value: widgetTokenFromKey("bucket-short-list"),
            },
          ]
        : []),
      ...(featureFlags.tasks
        ? [
            {
              label: t("home.widgetMemberOfMonth"),
              value: widgetTokenFromKey("member-of-month"),
            },
            {
              label: t("home.widgetFairness"),
              value: widgetTokenFromKey("fairness-score"),
            },
            {
              label: t("home.widgetReliability"),
              value: widgetTokenFromKey("reliability-score"),
            },
            {
              label: t("home.widgetFairnessByMember"),
              value: widgetTokenFromKey("fairness-by-member"),
            },
            {
              label: t("home.widgetReliabilityByMember"),
              value: widgetTokenFromKey("reliability-by-member"),
            },
          ]
        : []),
      ...(featureFlags.finances
        ? [
            {
              label: t("home.widgetExpensesByMonth"),
              value: widgetTokenFromKey("expenses-by-month"),
            },
          ]
        : []),
      {
        label: t("home.calendarTitle"),
        value: widgetTokenFromKey("household-calendar"),
      },
      {
        label: t("home.householdWeatherDailyWidgetTitle"),
        value: widgetTokenFromKey("household-weather-daily"),
      },
      {
        label: t("home.householdWeatherPlotWidgetTitle"),
        value: widgetTokenFromKey("household-weather-plot"),
      },
      {
        label: t("home.whiteboardTitle"),
        value: widgetTokenFromKey("household-whiteboard"),
      },
      {
        label: t("home.householdMapTitle"),
        value: widgetTokenFromKey("household-map"),
      },
    ],
    [featureFlags, t],
  );
  const landingInsertOptionsForEditor = useMemo(
    () =>
      landingInsertOptions.map((option) => ({
        ...option,
        value: convertLandingTokensToEditorJsx(option.value),
      })),
    [landingInsertOptions],
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
        "{{widget:tasks-overview}}",
      ].join("\n"),
    [household.name, t],
  );
  const showSummary = section === "summary";
  const showBucket = section === "bucket" && featureFlags.bucket;
  const showFeed = section === "feed";
  const [calendarMonthDate, setCalendarMonthDate] = useState(() =>
    startOfMonth(new Date()),
  );
  const [openCalendarTooltipDay, setOpenCalendarTooltipDay] = useState<
    string | null
  >(null);
  const [isCalendarCoarsePointer, setIsCalendarCoarsePointer] = useState(false);
  const [isCalendarMobile, setIsCalendarMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 639px)").matches
      : false,
  );
  const [calendarFilters, setCalendarFilters] = useState(() => ({
    cleaning: true,
    tasksCompleted: true,
    finances: true,
    bucket: true,
    shopping: false,
    cashAudits: true,
    vacations: true,
  }));
  const [isMobileBucketComposer, setIsMobileBucketComposer] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 639px)").matches
      : false,
  );
  const landingEditorRef = useRef<MDXEditorMethods | null>(null);
  const [isEditingLanding, setIsEditingLanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCompleteTask, setPendingCompleteTask] =
    useState<TaskItem | null>(null);


  const onConfirmCompleteTask = useCallback(async () => {
    if (!pendingCompleteTask) return;
    await onCompleteTask(pendingCompleteTask);
    setPendingCompleteTask(null);
  }, [onCompleteTask, pendingCompleteTask]);

  const savedMarkdown = getSavedLandingMarkdown(
    household.landing_page_markdown,
  );
  const effectiveMarkdown = getEffectiveLandingMarkdown(
    savedMarkdown,
    defaultLandingMarkdown,
  );
  const [markdownDraft, setMarkdownDraft] = useState(effectiveMarkdown);
  const [whiteboardDraft, setWhiteboardDraft] = useState(whiteboardSceneJson);
  const [whiteboardError, setWhiteboardError] = useState<string | null>(null);
  const [whiteboardStatus, setWhiteboardStatus] = useState<
    "idle" | "saving" | "saved" | "unsaved" | "error"
  >("idle");
  const [addressMapCenter, setAddressMapCenter] = useState<
    [number, number] | null
  >(null);
  const [addressMapLabel, setAddressMapLabel] = useState<string | null>(null);
  const [mapRecenterRequestToken, setMapRecenterRequestToken] = useState(0);
  const [myLocationCenter, setMyLocationCenter] = useState<
    [number, number] | null
  >(null);
  const [myLocationRecenterRequestToken, setMyLocationRecenterRequestToken] =
    useState(0);
  const [myLocationStatus, setMyLocationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [myLocationError, setMyLocationError] = useState<string | null>(null);
  const [whiteboardOnlineUserIds, setWhiteboardOnlineUserIds] = useState<
    string[]
  >([]);
  const [liveShareDurationMinutes, setLiveShareDurationMinutes] =
    useState<number>(15);
  const [isLiveShareDialogOpen, setIsLiveShareDialogOpen] = useState(false);
  const [isWeatherFullscreenOpen, setIsWeatherFullscreenOpen] = useState(false);
  const [headerSlideIndex, setHeaderSlideIndex] = useState<0 | 1>(0);
  const [liveShareStatus, setLiveShareStatus] = useState<
    "idle" | "starting" | "active" | "stopping" | "error"
  >("idle");
  const [liveShareError, setLiveShareError] = useState<string | null>(null);
  const [poiOverrideDrafts, setPoiOverrideDrafts] = useState<
    Record<string, { title: string; description: string }>
  >({});
  const [poiOverrideSavingId, setPoiOverrideSavingId] = useState<string | null>(
    null,
  );
  const [poiOverrideError, setPoiOverrideError] = useState<string | null>(null);
  const [activePoiEditorId, setActivePoiEditorId] = useState<string | null>(
    null,
  );
  const [editingMarkerDraft, setEditingMarkerDraft] = useState<{
    id: string;
    title: string;
    description: string;
    icon: HouseholdMapMarkerIcon;
    color: string;
  } | null>(null);
  const [editingMarkerError, setEditingMarkerError] = useState<string | null>(
    null,
  );
  const [editingMarkerSaving, setEditingMarkerSaving] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleId>("street");
  const [isMapSettingsHydrated, setIsMapSettingsHydrated] = useState(false);
  const [mapWeatherLayers, setMapWeatherLayers] =
    useState<MapWeatherLayerToggles>({
      radar: true,
      warnings: true,
      lightning: false,
    });
  const [mapMobilityLayers, setMapMobilityLayers] =
    useState<MapMobilityLayerToggles>({
      transitLive: false,
      bikeNetwork: false,
      trafficLive: false,
    });
  const [mapMeasureMode, setMapMeasureMode] = useState<MapMeasureMode | null>(
    null,
  );
  const [mapMeasureResult, setMapMeasureResult] = useState<string | null>(null);
  const [mapMeasureResultAnchor, setMapMeasureResultAnchor] = useState<
    [number, number] | null
  >(null);
  const [mapMeasureClearToken, setMapMeasureClearToken] = useState(0);
  const [mapRenderVersion, setMapRenderVersion] = useState(0);
  const [mapDeleteConfirm, setMapDeleteConfirm] = useState<{
    nextMarkers: HouseholdMapMarker[];
    removedMarkers: HouseholdMapMarker[];
  } | null>(null);
  const [mapTravelMode, setMapTravelMode] =
    useState<MapReachabilityMode>("bike");
  const [mapReachabilityMinutes, setMapReachabilityMinutes] = useState<number>(
    REACHABILITY_MINUTES_DEFAULT,
  );
  const [mapReachabilityGeoJson, setMapReachabilityGeoJson] =
    useState<ReachabilityGeoJson | null>(null);
  const [mapReachabilityLoading, setMapReachabilityLoading] = useState(false);
  const [mapReachabilityError, setMapReachabilityError] = useState<
    string | null
  >(null);
  const [, setMapReachabilitySaveError] = useState<string | null>(null);
  const [, setMapReachabilitySavedAt] = useState<number | null>(null);
  const [mapReachabilitySaving, setMapReachabilitySaving] = useState(false);
  const [mapReachabilityPanelOpen, setMapReachabilityPanelOpen] =
    useState(false);
  const [mapReachabilityOrigin, setMapReachabilityOrigin] = useState<
    [number, number] | null
  >(null);
  const [mapReachabilityOriginManual, setMapReachabilityOriginManual] =
    useState(false);
  const [mapReachabilityPickOriginActive, setMapReachabilityPickOriginActive] =
    useState(false);
  const [mapReachabilityFitRequestToken, setMapReachabilityFitRequestToken] =
    useState(0);
  const [mapGeomanControlsOpen, setMapGeomanControlsOpen] = useState(false);
  const [mapRoutePanelOpen, setMapRoutePanelOpen] = useState(false);
  const [mapRouteMaxMinutes, setMapRouteMaxMinutes] = useState<number | null>(
    null,
  );
  const [mapRouteOriginManual, setMapRouteOriginManual] = useState<
    [number, number] | null
  >(null);
  const [mapRouteTarget, setMapRouteTarget] = useState<[number, number] | null>(
    null,
  );
  const [mapRoutePickOriginActive, setMapRoutePickOriginActive] =
    useState(false);
  const [mapRoutePickTargetActive, setMapRoutePickTargetActive] =
    useState(false);
  const [mapRouteGeoJson, setMapRouteGeoJson] = useState<RouteGeoJson | null>(
    null,
  );
  const [mapRouteLoading, setMapRouteLoading] = useState(false);
  const [mapRouteError, setMapRouteError] = useState<string | null>(null);
  const [mapRouteSaveError, setMapRouteSaveError] = useState<string | null>(
    null,
  );
  const [mapRouteSaving, setMapRouteSaving] = useState(false);
  const [mapRouteFitRequestToken, setMapRouteFitRequestToken] = useState(0);
  const [mapRouteTooltipOpenToken, setMapRouteTooltipOpenToken] = useState(0);
  const [mapClosePopupRequestToken, setMapClosePopupRequestToken] = useState(0);
  const [mapQuickPin, setMapQuickPin] = useState<[number, number] | null>(null);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<MapSearchResult[]>(
    [],
  );
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchError, setMapSearchError] = useState<string | null>(null);
  const [mapSearchInputFocused, setMapSearchInputFocused] = useState(false);
  const [mapSearchViewportBounds, setMapSearchViewportBounds] =
    useState<MapSearchViewportBounds | null>(null);
  const [mapSearchZoomRequest, setMapSearchZoomRequest] =
    useState<MapSearchZoomRequest | null>(null);
  const [mapViewportZoom, setMapViewportZoom] = useState(MAP_ZOOM_DEFAULT);
  const [transitDialogStop, setTransitDialogStop] =
    useState<TransitLiveStop | null>(null);
  const [manualMarkerFilterMode, setManualMarkerFilterMode] =
    useState<ManualMarkerFilterMode>("all");
  const [manualMarkerFilterMemberId, setManualMarkerFilterMemberId] =
    useState<string>("");
  const [poiCategoriesEnabled, setPoiCategoriesEnabled] = useState<
    Record<PoiCategory, boolean>
  >({
    restaurant: false,
    shop: false,
    supermarket: false,
    fuel: false,
  });
  const whiteboardSaveTimerRef = useRef<number | null>(null);
  const headerSwiperRef = useRef<HTMLDivElement | null>(null);
  const headerLastInteractionAtRef = useRef<number>(Date.now());
  const mapMarkerSaveTimerRef = useRef<number | null>(null);
  const pendingMapMarkerSaveRef = useRef<HouseholdMapMarker[] | null>(null);
  const locateControlRef = useRef<LocateControlHandle | null>(null);
  const myLocationRequestTokenRef = useRef(0);
  const myLocationFallbackTimerRef = useRef<number | null>(null);
  const quickPinMarkerRef = useRef<L.Marker | null>(null);
  const liveShareHeartbeatTimerRef = useRef<number | null>(null);
  const liveShareExpiresAtRef = useRef<string | null>(null);
  const lastSavedWhiteboardRef = useRef(whiteboardSceneJson);

  useEffect(() => {
    setIsMapSettingsHydrated(false);
    const persisted = readPersistedMapSettings(household.id);
    if (!persisted) {
      setIsMapSettingsHydrated(true);
      return;
    }

    if (
      persisted.mapStyle === "street" ||
      persisted.mapStyle === "nature" ||
      persisted.mapStyle === "satellite" ||
      persisted.mapStyle === "light" ||
      persisted.mapStyle === "dark"
    ) {
      setMapStyle(persisted.mapStyle);
    }

    if (
      persisted.mapTravelMode === "walk" ||
      persisted.mapTravelMode === "bike" ||
      persisted.mapTravelMode === "car" ||
      persisted.mapTravelMode === "transit"
    ) {
      setMapTravelMode(persisted.mapTravelMode);
    }

    if (
      persisted.mapWeatherLayers &&
      typeof persisted.mapWeatherLayers === "object"
    ) {
      setMapWeatherLayers({
        radar: Boolean(persisted.mapWeatherLayers.radar),
        warnings: Boolean(persisted.mapWeatherLayers.warnings),
        lightning: Boolean(persisted.mapWeatherLayers.lightning),
      });
    }

    if (
      persisted.mapMobilityLayers &&
      typeof persisted.mapMobilityLayers === "object"
    ) {
      setMapMobilityLayers({
        transitLive: Boolean(persisted.mapMobilityLayers.transitLive),
        bikeNetwork: Boolean(persisted.mapMobilityLayers.bikeNetwork),
        trafficLive: Boolean(persisted.mapMobilityLayers.trafficLive),
      });
    }

    if (
      persisted.manualMarkerFilterMode === "all" ||
      persisted.manualMarkerFilterMode === "mine" ||
      persisted.manualMarkerFilterMode === "member" ||
      persisted.manualMarkerFilterMode === "none"
    ) {
      setManualMarkerFilterMode(persisted.manualMarkerFilterMode);
    }

    if (typeof persisted.manualMarkerFilterMemberId === "string") {
      setManualMarkerFilterMemberId(persisted.manualMarkerFilterMemberId);
    }

    if (
      persisted.poiCategoriesEnabled &&
      typeof persisted.poiCategoriesEnabled === "object"
    ) {
      const persistedPoi = persisted.poiCategoriesEnabled as Partial<
        Record<PoiCategory, unknown>
      >;
      setPoiCategoriesEnabled({
        restaurant:
          typeof persistedPoi.restaurant === "boolean"
            ? persistedPoi.restaurant
            : false,
        shop:
          typeof persistedPoi.shop === "boolean" ? persistedPoi.shop : false,
        supermarket:
          typeof persistedPoi.supermarket === "boolean"
            ? persistedPoi.supermarket
            : false,
        fuel:
          typeof persistedPoi.fuel === "boolean" ? persistedPoi.fuel : false,
      });
    }

    setIsMapSettingsHydrated(true);
  }, [household.id]);

  useEffect(() => {
    if (!isMapSettingsHydrated) return;
    writePersistedMapSettings(household.id, {
      mapStyle,
      mapTravelMode,
      mapWeatherLayers,
      mapMobilityLayers,
      manualMarkerFilterMode,
      manualMarkerFilterMemberId,
      poiCategoriesEnabled,
    });
  }, [
    household.id,
    isMapSettingsHydrated,
    manualMarkerFilterMemberId,
    manualMarkerFilterMode,
    mapMobilityLayers,
    mapStyle,
    mapTravelMode,
    mapWeatherLayers,
    poiCategoriesEnabled,
  ]);

  const isWhiteboardFullscreenOpen =
    location.pathname === "/home/summary/whiteboard";
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
    () =>
      householdImageUrl
        ? `url("${householdImageUrl}")`
        : createTrianglifyBannerBackground(household.name),
    [household.name, householdImageUrl],
  );
  const language = i18n.resolvedLanguage ?? i18n.language;
  const addressInput = household.address.trim();
  const weatherLocationLabel = useMemo(() => {
    const source = (addressMapLabel ?? addressInput).trim();
    if (!source) return "";
    const cityFromPostalPattern =
      source.match(/\b\d{4,5}\s+([^,\d][^,]*)/u)?.[1]?.trim() ?? "";
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
      .find(
        (part) => /\p{L}/u.test(part) && !/\d/.test(part) && part.length > 1,
      );
    if (alphaOnlyPart) return alphaOnlyPart;
    return "";
  }, [addressInput, addressMapLabel]);
  const householdWeatherTitle = weatherLocationLabel
    ? t("home.householdWeatherTitleWithLocation", {
        location: weatherLocationLabel,
      })
    : t("home.householdWeatherTitle");
  const firstManualMarkerCenter = useMemo(() => {
    for (const marker of household.household_map_markers) {
      const center = getHouseholdMarkerCenter(marker);
      if (center) return center;
    }
    return null;
  }, [household.household_map_markers]);
  const mapCenter =
    addressMapCenter ?? firstManualMarkerCenter ?? DEFAULT_MAP_CENTER;
  const mapHasPin = Boolean(addressMapCenter);
  const poiQueryCenter = addressMapCenter ?? firstManualMarkerCenter ?? null;
  const hasPoiQueryCenter = Boolean(poiQueryCenter);
  const mapZoom = mapHasPin
    ? MAP_ZOOM_WITH_ADDRESS
    : addressInput
      ? MAP_ZOOM_WITH_ADDRESS_FALLBACK
      : MAP_ZOOM_DEFAULT;
  const selectedPoiCategories = useMemo(
    () =>
      POI_CATEGORY_OPTIONS.map((entry) => entry.id).filter(
        (category) => poiCategoriesEnabled[category],
      ),
    [poiCategoriesEnabled],
  );
  const activeMapStyle = useMemo(
    () =>
      MAP_STYLE_OPTIONS.find((option) => option.id === mapStyle) ??
      MAP_STYLE_OPTIONS[0],
    [mapStyle],
  );
  const mapMemberLabel = useCallback(
    (memberId: string) => {
      const member = members.find((entry) => entry.user_id === memberId);
      const display = member?.display_name?.trim();
      if (display) return display;
      return memberId;
    },
    [members],
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
    [members],
  );
  const filteredHouseholdMarkers = useMemo(() => {
    if (manualMarkerFilterMode === "none") return [] as HouseholdMapMarker[];
    if (manualMarkerFilterMode === "mine") {
      return household.household_map_markers.filter(
        (marker) => marker.created_by === userId,
      );
    }
    if (manualMarkerFilterMode === "member") {
      if (!manualMarkerFilterMemberId) return [] as HouseholdMapMarker[];
      return household.household_map_markers.filter(
        (marker) => marker.created_by === manualMarkerFilterMemberId,
      );
    }
    return household.household_map_markers;
  }, [
    household.household_map_markers,
    manualMarkerFilterMemberId,
    manualMarkerFilterMode,
    userId,
  ]);
  const memberOptionsForMarkerFilter = useMemo(
    () =>
      members
        .map((member) => ({
          id: member.user_id,
          label: mapMemberLabel(member.user_id),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [mapMemberLabel, members],
  );
  useEffect(() => {
    if (manualMarkerFilterMode !== "member") return;
    if (memberOptionsForMarkerFilter.length === 0) {
      if (manualMarkerFilterMemberId !== "") {
        setManualMarkerFilterMemberId("");
      }
      return;
    }
    const exists = memberOptionsForMarkerFilter.some(
      (option) => option.id === manualMarkerFilterMemberId,
    );
    if (!exists) {
      setManualMarkerFilterMemberId(memberOptionsForMarkerFilter[0]!.id);
    }
  }, [
    manualMarkerFilterMemberId,
    manualMarkerFilterMode,
    memberOptionsForMarkerFilter,
  ]);
  const applyMapSearchResult = useCallback((result: MapSearchResult) => {
    setMapSearchZoomRequest({
      token: Date.now(),
      lat: result.lat,
      lon: result.lon,
      bounds: result.bounds,
    });
  }, []);
  const handleMapZoomChange = useCallback((nextZoom: number) => {
    setMapViewportZoom((current) =>
      Math.abs(current - nextZoom) < 0.001 ? current : nextZoom,
    );
  }, []);
  const handleMapSearchViewportBoundsChange = useCallback(
    (nextBounds: MapSearchViewportBounds) => {
      setMapSearchViewportBounds((current) => {
        if (!current) return nextBounds;
        const epsilon = 1e-5;
        const isSame =
          Math.abs(current.south - nextBounds.south) < epsilon &&
          Math.abs(current.west - nextBounds.west) < epsilon &&
          Math.abs(current.north - nextBounds.north) < epsilon &&
          Math.abs(current.east - nextBounds.east) < epsilon;
        return isSame ? current : nextBounds;
      });
    },
    [],
  );

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
            viewbox: `${mapSearchViewportBounds.west},${mapSearchViewportBounds.north},${mapSearchViewportBounds.east},${mapSearchViewportBounds.south}`,
          });
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?${params.toString()}`,
            {
              method: "GET",
              headers: { Accept: "application/json" },
              signal: controller.signal,
            },
          );
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
              const bbox = Array.isArray(entry.boundingbox)
                ? entry.boundingbox
                : null;
              const bounds =
                bbox && bbox.length === 4
                  ? {
                      south: Number(bbox[0]),
                      north: Number(bbox[1]),
                      west: Number(bbox[2]),
                      east: Number(bbox[3]),
                    }
                  : null;
              return {
                id: String(entry.place_id ?? `${lat}:${lon}`),
                label:
                  entry.display_name?.trim() ||
                  `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                lat,
                lon,
                bounds:
                  bounds &&
                  Number.isFinite(bounds.south) &&
                  Number.isFinite(bounds.north) &&
                  Number.isFinite(bounds.west) &&
                  Number.isFinite(bounds.east)
                    ? bounds
                    : null,
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
      setMapRoutePickOriginActive(false);
      setMapRoutePickTargetActive(false);
      setTransitDialogStop(null);
    }
  }, [isMapFullscreenOpen]);

  useEffect(() => {
    if (!mapQuickPin) return;
    const timeout = window.setTimeout(() => {
      quickPinMarkerRef.current?.openPopup();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [mapQuickPin]);
  const nearbyPoiQuery = useQuery({
    queryKey: [
      "map-poi",
      household.id,
      hasPoiQueryCenter ? poiQueryCenter?.[0] : null,
      hasPoiQueryCenter ? poiQueryCenter?.[1] : null,
      POI_RADIUS_METERS,
      selectedPoiCategories,
    ],
    queryFn: () =>
      getNearbyPois({
        householdId: household.id,
        lat: poiQueryCenter![0],
        lon: poiQueryCenter![1],
        radiusMeters: POI_RADIUS_METERS,
        categories: selectedPoiCategories,
      }),
    enabled: hasPoiQueryCenter && selectedPoiCategories.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const nearbyPois = (nearbyPoiQuery.data?.rows ?? []) as NearbyPoi[];
  const mapPoiDisplayEntries = useMemo<MapPoiDisplayEntry[]>(() => {
    if (nearbyPois.length === 0) return [];
    if (mapViewportZoom >= POI_CLUSTER_MIN_ZOOM || nearbyPois.length <= 1) {
      return nearbyPois.map((poi) => ({ type: "poi", poi }));
    }

    const gridSizePx =
      mapViewportZoom < 12
        ? POI_CLUSTER_GRID_PX_LOW_ZOOM
        : POI_CLUSTER_GRID_PX_HIGH_ZOOM;
    const groups = new Map<string, NearbyPoi[]>();

    for (const poi of nearbyPois) {
      const projected = projectToWorldPixel(poi.lat, poi.lon, mapViewportZoom);
      const key = `${Math.floor(projected.x / gridSizePx)}:${Math.floor(projected.y / gridSizePx)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(poi);
      } else {
        groups.set(key, [poi]);
      }
    }

    const entries: MapPoiDisplayEntry[] = [];
    for (const [groupKey, groupPois] of groups.entries()) {
      if (groupPois.length === 1) {
        entries.push({ type: "poi", poi: groupPois[0]! });
        continue;
      }

      const centroid = groupPois.reduce(
        (acc, poi) => ({ lat: acc.lat + poi.lat, lon: acc.lon + poi.lon }),
        { lat: 0, lon: 0 },
      );
      const categoryCounts = groupPois.reduce(
        (acc, poi) => {
          acc[poi.category] = (acc[poi.category] ?? 0) + 1;
          return acc;
        },
        {} as Partial<Record<PoiCategory, number>>,
      );

      entries.push({
        type: "cluster",
        id: `poi-cluster:${groupKey}`,
        lat: centroid.lat / groupPois.length,
        lon: centroid.lon / groupPois.length,
        count: groupPois.length,
        pois: groupPois,
        categoryCounts,
      });
    }

    return entries;
  }, [mapViewportZoom, nearbyPois]);
  const hasGermanMapCenter =
    mapCenter[0] >= 47 &&
    mapCenter[0] <= 56 &&
    mapCenter[1] >= 5 &&
    mapCenter[1] <= 16;
  const transitLiveQuery = useQuery({
    queryKey: [
      "map-transit-live",
      household.id,
      mapMobilityLayers.transitLive ? mapCenter[0].toFixed(3) : null,
      mapMobilityLayers.transitLive ? mapCenter[1].toFixed(3) : null,
    ],
    enabled: mapMobilityLayers.transitLive,
    staleTime: Math.floor(TRANSIT_LAYER_REFRESH_MS * 0.5),
    refetchInterval: TRANSIT_LAYER_REFRESH_MS,
    queryFn: async () => {
      const nearbyParams = new URLSearchParams({
        latitude: String(mapCenter[0]),
        longitude: String(mapCenter[1]),
        distance: String(TRANSIT_LAYER_RADIUS_METERS),
        results: String(TRANSIT_LAYER_STOP_LIMIT),
      });
      const nearbyPayload = await fetchJsonWithRetry<unknown>(
        `https://v6.db.transport.rest/locations/nearby?${nearbyParams.toString()}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
        TRANSIT_LAYER_FETCH_RETRIES,
        TRANSIT_LAYER_FETCH_BACKOFF_MS,
      );
      const nearbyRows = Array.isArray(nearbyPayload) ? nearbyPayload : [];
      const parsedStops = nearbyRows
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const candidate = entry as {
            id?: unknown;
            name?: unknown;
            location?: { latitude?: unknown; longitude?: unknown };
            distance?: unknown;
          };
          const id =
            typeof candidate.id === "string" ? candidate.id.trim() : "";
          const name =
            typeof candidate.name === "string" ? candidate.name.trim() : "";
          const lat = Number(candidate.location?.latitude);
          const lon = Number(candidate.location?.longitude);
          if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon))
            return null;
          const distance = Number(candidate.distance);
          return {
            id,
            name,
            lat,
            lon,
            distanceMeters: Number.isFinite(distance)
              ? Math.round(distance)
              : null,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            id: string;
            name: string;
            lat: number;
            lon: number;
            distanceMeters: number | null;
          } => Boolean(entry),
        );
      const stopById = new Map<
        string,
        {
          id: string;
          name: string;
          lat: number;
          lon: number;
          distanceMeters: number | null;
        }
      >();
      for (const stop of parsedStops) {
        const existing = stopById.get(stop.id);
        if (!existing) {
          stopById.set(stop.id, stop);
          continue;
        }
        const currentDistance = stop.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const existingDistance =
          existing.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        if (currentDistance < existingDistance) {
          stopById.set(stop.id, stop);
        }
      }
      const stops = Array.from(stopById.values());
      if (stops.length === 0) return [] as TransitLiveStop[];

      const stopsWithDepartures = await Promise.all(
        stops.map(async (stop) => {
          try {
            const departuresParams = new URLSearchParams({
              duration: "60",
              results: String(TRANSIT_LAYER_DEPARTURE_LIMIT),
            });
            const departuresPayload = await fetchJsonWithRetry<{
              departures?: unknown[];
            }>(
              `https://v6.db.transport.rest/stops/${encodeURIComponent(stop.id)}/departures?${departuresParams.toString()}`,
              {
                method: "GET",
                headers: { Accept: "application/json" },
              },
              1,
              TRANSIT_LAYER_FETCH_BACKOFF_MS,
            );
            const departures = (
              Array.isArray(departuresPayload.departures)
                ? departuresPayload.departures
                : []
            )
              .map((departureRaw) => {
                if (!departureRaw || typeof departureRaw !== "object")
                  return null;
                const departure = departureRaw as {
                  tripId?: unknown;
                  when?: unknown;
                  plannedWhen?: unknown;
                  delay?: unknown;
                  direction?: unknown;
                  line?: { name?: unknown; productName?: unknown };
                };
                const tripId =
                  typeof departure.tripId === "string" ? departure.tripId : "";
                const lineNameRaw =
                  typeof departure.line?.name === "string"
                    ? departure.line.name
                    : typeof departure.line?.productName === "string"
                      ? departure.line.productName
                      : "";
                const direction =
                  typeof departure.direction === "string"
                    ? departure.direction.trim()
                    : "";
                if (!lineNameRaw) return null;
                const delay = Number(departure.delay);
                const departureRef = String(
                  departure.when ?? departure.plannedWhen ?? "",
                );
                return {
                  id:
                    tripId ||
                    `${stop.id}:${lineNameRaw}:${direction}:${departureRef}`,
                  lineName: lineNameRaw.trim(),
                  direction,
                  departureIso:
                    typeof departure.when === "string" ? departure.when : null,
                  plannedIso:
                    typeof departure.plannedWhen === "string"
                      ? departure.plannedWhen
                      : null,
                  delaySeconds: Number.isFinite(delay)
                    ? Math.round(delay)
                    : null,
                } satisfies TransitLiveDeparture;
              })
              .filter((entry): entry is TransitLiveDeparture => Boolean(entry));
            const departureById = new Map<string, TransitLiveDeparture>();
            for (const departure of departures) {
              if (!departureById.has(departure.id)) {
                departureById.set(departure.id, departure);
              }
            }
            return {
              ...stop,
              departures: Array.from(departureById.values()),
            } satisfies TransitLiveStop;
          } catch {
            return null;
          }
        }),
      );

      return stopsWithDepartures
        .filter((entry): entry is TransitLiveStop => Boolean(entry))
        .sort((a, b) => {
          const distanceA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
          const distanceB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
          return distanceA - distanceB;
        });
    },
  });
  const trafficLiveQuery = useQuery({
    queryKey: [
      "map-traffic-live",
      household.id,
      mapMobilityLayers.trafficLive,
      hasGermanMapCenter,
    ],
    enabled: mapMobilityLayers.trafficLive && hasGermanMapCenter,
    staleTime: Math.floor(TRAFFIC_LAYER_REFRESH_MS * 0.5),
    refetchInterval: TRAFFIC_LAYER_REFRESH_MS,
    queryFn: async () => {
      const now = Date.now();
      if (
        trafficRoadsCache.fetchedAt + 24 * 60 * 60 * 1000 < now ||
        trafficRoadsCache.roads.length === 0
      ) {
        const roadsResponse = await fetch(
          "https://verkehr.autobahn.de/o/autobahn/",
          {
            method: "GET",
            headers: { Accept: "application/json" },
          },
        );
        if (!roadsResponse.ok) {
          throw new Error("traffic_roads_failed");
        }
        const roadsPayload = (await roadsResponse.json()) as {
          roads?: unknown[];
        };
        const roads = (
          Array.isArray(roadsPayload.roads) ? roadsPayload.roads : []
        )
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0);
        trafficRoadsCache.roads = Array.from(new Set(roads));
        trafficRoadsCache.fetchedAt = now;
      }
      const roads = trafficRoadsCache.roads;
      if (roads.length === 0) return [] as TrafficLiveIncident[];

      const cycleKey = Math.floor(now / TRAFFIC_LAYER_CACHE_TTL_MS);
      const offset = cycleKey % roads.length;
      const rotated = roads.slice(offset).concat(roads.slice(0, offset));
      const selectedRoads = rotated.slice(
        0,
        Math.min(TRAFFIC_LAYER_MAX_ROADS_PER_CYCLE, rotated.length),
      );
      const incidents: TrafficLiveIncident[] = [];

      for (
        let index = 0;
        index < selectedRoads.length;
        index += TRAFFIC_LAYER_FETCH_CONCURRENCY
      ) {
        const batch = selectedRoads.slice(
          index,
          index + TRAFFIC_LAYER_FETCH_CONCURRENCY,
        );
        const batchRows = await Promise.all(
          batch.map(async (road) => {
            const cached = trafficWarningCache.get(road);
            if (cached && cached.fetchedAt + TRAFFIC_LAYER_CACHE_TTL_MS > now) {
              return cached.incidents;
            }
            try {
              const response = await fetch(
                `https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/warning`,
                {
                  method: "GET",
                  headers: { Accept: "application/json" },
                },
              );
              if (!response.ok) {
                return [] as TrafficLiveIncident[];
              }
              const payload = (await response.json()) as {
                warning?: unknown[];
              };
              const rows = (
                Array.isArray(payload.warning) ? payload.warning : []
              )
                .map((entry) => parseTrafficIncident(road, entry))
                .filter((entry): entry is TrafficLiveIncident =>
                  Boolean(entry),
                );
              trafficWarningCache.set(road, {
                fetchedAt: Date.now(),
                incidents: rows,
              });
              return rows;
            } catch {
              return [] as TrafficLiveIncident[];
            }
          }),
        );
        for (const row of batchRows) {
          incidents.push(...row);
          if (incidents.length >= TRAFFIC_LAYER_MAX_INCIDENTS) {
            break;
          }
        }
        if (incidents.length >= TRAFFIC_LAYER_MAX_INCIDENTS) {
          break;
        }
      }

      const deduped = new Map<string, TrafficLiveIncident>();
      for (const incident of incidents) {
        if (!deduped.has(incident.id)) {
          deduped.set(incident.id, incident);
        }
      }
      return Array.from(deduped.values());
    },
  });
  const transitLiveStops = transitLiveQuery.data ?? [];
  const trafficLiveIncidents = trafficLiveQuery.data ?? [];
  const transitDialogDepartureGroups = useMemo(() => {
    if (!transitDialogStop)
      return [] as Array<{
        key: string;
        lineName: string;
        direction: string;
        departures: TransitLiveDeparture[];
        earliestTs: number;
      }>;
    const groups = new Map<
      string,
      {
        key: string;
        lineName: string;
        direction: string;
        departures: TransitLiveDeparture[];
      }
    >();
    for (const departure of transitDialogStop.departures) {
      const groupKey = `${departure.lineName}::${departure.direction}`;
      const existing = groups.get(groupKey);
      if (existing) {
        existing.departures.push(departure);
      } else {
        groups.set(groupKey, {
          key: groupKey,
          lineName: departure.lineName,
          direction: departure.direction,
          departures: [departure],
        });
      }
    }
    return Array.from(groups.values())
      .map((group) => {
        const sortedDepartures = [...group.departures].sort((a, b) => {
          const aIso = a.departureIso ?? a.plannedIso ?? "";
          const bIso = b.departureIso ?? b.plannedIso ?? "";
          const aTs = aIso
            ? new Date(aIso).getTime()
            : Number.POSITIVE_INFINITY;
          const bTs = bIso
            ? new Date(bIso).getTime()
            : Number.POSITIVE_INFINITY;
          return aTs - bTs;
        });
        const firstIso =
          sortedDepartures[0]?.departureIso ??
          sortedDepartures[0]?.plannedIso ??
          "";
        const earliestTs = firstIso
          ? new Date(firstIso).getTime()
          : Number.POSITIVE_INFINITY;
        return {
          ...group,
          departures: sortedDepartures,
          earliestTs,
        };
      })
      .sort((a, b) => a.earliestTs - b.earliestTs);
  }, [transitDialogStop]);

  const liveLocationsQuery = useQuery<HouseholdLiveLocation[]>({
    queryKey: queryKeys.householdLiveLocations(household.id),
    queryFn: () => getHouseholdLiveLocations(household.id),
    refetchInterval: 30_000,
  });
  const activeLiveLocations = liveLocationsQuery.data ?? [];
  const myActiveLiveLocation = useMemo(
    () => activeLiveLocations.find((entry) => entry.user_id === userId) ?? null,
    [activeLiveLocations, userId],
  );
  const otherActiveLiveLocations = useMemo(
    () => activeLiveLocations.filter((entry) => entry.user_id !== userId),
    [activeLiveLocations, userId],
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
      vacationFinancesExcludeEnabled:
        household.vacation_finances_exclude_enabled,
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
      householdMapMarkers: markers,
    }),
    [household],
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
        last_edited_at: nowIso,
      };
      const nextMarkers = household.household_map_markers.map((entry) =>
        entry.id === marker.id ? nextMarker : entry,
      );
      try {
        setPoiOverrideSavingId(marker.poi_ref);
        setPoiOverrideError(null);
        await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("app.unknownError");
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
      userId,
    ],
  );
  const openMarkerEdit = useCallback(
    (marker: HouseholdMapMarker) => {
      if (!isHouseholdOwner) return;
      setEditingMarkerError(null);
      setEditingMarkerDraft({
        id: marker.id,
        title: marker.title,
        description: marker.description,
        icon: marker.icon,
        color: normalizeMarkerColor(marker.color),
      });
    },
    [isHouseholdOwner],
  );
  const saveEditedMarker = useCallback(async () => {
    if (!editingMarkerDraft || !isHouseholdOwner) return;

    const title = editingMarkerDraft.title.trim();
    if (!title) {
      setEditingMarkerError(t("home.householdMapMarkerTitleRequired"));
      return;
    }

    const markerToUpdate = household.household_map_markers.find(
      (marker) => marker.id === editingMarkerDraft.id,
    );
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
      color: normalizeMarkerColor(editingMarkerDraft.color),
      last_edited_by: userId,
      last_edited_at: nowIso,
    };
    const nextMarkers = household.household_map_markers.map((marker) =>
      marker.id === updatedMarker.id ? updatedMarker : marker,
    );

    try {
      setEditingMarkerSaving(true);
      setEditingMarkerError(null);
      await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      setEditingMarkerDraft(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("app.unknownError");
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
    userId,
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
  }, [
    buildHouseholdUpdatePayload,
    household.household_map_markers,
    onUpdateHousehold,
  ]);

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
    [flushQueuedMapMarkerSave],
  );

  const onGeomanMarkersChanged = useCallback(
    (markers: HouseholdMapMarker[]) => {
      if (!isHouseholdOwner) return;

      const nextIds = new Set(markers.map((entry) => entry.id));
      const removedMarkers = household.household_map_markers.filter(
        (entry) => !nextIds.has(entry.id),
      );
      if (removedMarkers.length > 0) {
        setMapDeleteConfirm({ nextMarkers: markers, removedMarkers });
        return;
      }

      queueMapMarkerAutosave(markers);
    },
    [household.household_map_markers, isHouseholdOwner, queueMapMarkerAutosave],
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

  const onLocateControlReady = useCallback(
    (control: LocateControlHandle | null) => {
      locateControlRef.current = control;
    },
    [],
  );

  const clearMyLocationFallbackTimer = useCallback(() => {
    if (myLocationFallbackTimerRef.current !== null) {
      window.clearTimeout(myLocationFallbackTimerRef.current);
      myLocationFallbackTimerRef.current = null;
    }
  }, []);

  const getLocationErrorMessage = useCallback(
    (
      error: GeolocationPositionError | { code?: number } | null | undefined,
    ) => {
      const code = typeof error?.code === "number" ? error.code : 0;
      if (code === 1) return t("home.householdMapMyLocationDenied");
      if (code === 3) return t("home.householdMapMyLocationTimeout");
      return t("home.householdMapMyLocationError");
    },
    [t],
  );

  const onLocateControlFound = useCallback(
    (lat: number, lon: number) => {
      clearMyLocationFallbackTimer();
      setMyLocationCenter([lat, lon]);
      setMyLocationRecenterRequestToken((current) => current + 1);
      setMyLocationError(null);
      setMyLocationStatus("idle");
    },
    [clearMyLocationFallbackTimer],
  );

  const onLocateControlError = useCallback(() => {
    clearMyLocationFallbackTimer();
    setMyLocationStatus("error");
    setMyLocationError(t("home.householdMapMyLocationError"));
  }, [clearMyLocationFallbackTimer, t]);

  const requestMyLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setMyLocationStatus("error");
      setMyLocationError(t("home.householdMapMyLocationUnavailable"));
      return;
    }

    const requestToken = myLocationRequestTokenRef.current + 1;
    myLocationRequestTokenRef.current = requestToken;
    clearMyLocationFallbackTimer();

    const finishWithPosition = (position: GeolocationPosition) => {
      if (myLocationRequestTokenRef.current !== requestToken) return;
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setMyLocationStatus("error");
        setMyLocationError(t("home.householdMapMyLocationError"));
        return;
      }
      clearMyLocationFallbackTimer();
      setMyLocationCenter([lat, lon]);
      setMyLocationRecenterRequestToken((current) => current + 1);
      setMyLocationError(null);
      setMyLocationStatus("idle");
    };

    const finishWithError = (
      error: GeolocationPositionError | { code?: number } | null | undefined,
    ) => {
      if (myLocationRequestTokenRef.current !== requestToken) return;
      clearMyLocationFallbackTimer();
      setMyLocationStatus("error");
      setMyLocationError(getLocationErrorMessage(error));
    };

    const runLowAccuracyFallback = () => {
      navigator.geolocation.getCurrentPosition(
        finishWithPosition,
        (error) => finishWithError(error),
        {
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 300000,
        },
      );
    };

    setMyLocationStatus("loading");
    setMyLocationError(null);

    if (locateControlRef.current) {
      locateControlRef.current.start();
      myLocationFallbackTimerRef.current = window.setTimeout(() => {
        if (myLocationRequestTokenRef.current !== requestToken) return;
        runLowAccuracyFallback();
      }, 12000);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      finishWithPosition,
      (error) => {
        if (myLocationRequestTokenRef.current !== requestToken) return;
        if (error.code === 3) {
          runLowAccuracyFallback();
          return;
        }
        finishWithError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 60000,
      },
    );
  }, [clearMyLocationFallbackTimer, getLocationErrorMessage, t]);

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
        travelMode: mapTravelMode,
      });
      setMapReachabilityGeoJson(response.geojson);
      setMapReachabilityFitRequestToken(Date.now());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("home.householdMapReachabilityError");
      setMapReachabilityError(message);
    } finally {
      setMapReachabilityLoading(false);
    }
  }, [
    household.id,
    mapReachabilityMinutes,
    mapReachabilityOrigin,
    mapTravelMode,
    t,
  ]);

  const clearReachability = useCallback(() => {
    setMapReachabilityGeoJson(null);
    setMapReachabilityError(null);
    setMapReachabilityLoading(false);
    setMapReachabilityPickOriginActive(false);
    setMapReachabilitySaveError(null);
    setMapReachabilitySavedAt(null);
  }, []);

  const mapReachabilityColor = useMemo(() => {
    return "#f97316";
  }, []);

  const mapRouteAutoOrigin = useMemo<[number, number] | null>(() => {
    if (myLocationCenter) return myLocationCenter;
    if (addressMapCenter) return addressMapCenter;
    return null;
  }, [addressMapCenter, myLocationCenter]);
  const mapRouteOrigin = mapRouteOriginManual ?? mapRouteAutoOrigin;
  const mapRouteOriginLabel = useMemo(() => {
    if (mapRouteOriginManual) {
      return `${mapRouteOriginManual[0].toFixed(5)}, ${mapRouteOriginManual[1].toFixed(5)}`;
    }
    if (myLocationCenter) return t("home.householdMapMyLocation");
    if (addressInput.trim().length > 0) return addressInput.trim();
    return t("home.householdMapRouteNeedsOrigin");
  }, [addressInput, mapRouteOriginManual, myLocationCenter, t]);
  const mapRouteTargetLabel = useMemo(() => {
    if (!mapRouteTarget) return t("home.householdMapRouteNeedsTarget");
    return `${mapRouteTarget[0].toFixed(5)}, ${mapRouteTarget[1].toFixed(5)}`;
  }, [mapRouteTarget, t]);

  useEffect(() => {
    if (mapReachabilityOrigin) return;
    if (!mapRouteAutoOrigin) return;
    setMapReachabilityOrigin(mapRouteAutoOrigin);
    setMapReachabilityOriginManual(false);
  }, [mapReachabilityOrigin, mapRouteAutoOrigin]);

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
        maxMinutes: mapRouteMaxMinutes ?? undefined,
        travelMode: mapTravelMode,
      });
      setMapRouteGeoJson(response.geojson);
      setMapRouteFitRequestToken(Date.now());
      setMapRouteTooltipOpenToken((current) => current + 1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("home.householdMapRouteError");
      setMapRouteError(message);
    } finally {
      setMapRouteLoading(false);
    }
  }, [
    household.id,
    mapRouteMaxMinutes,
    mapRouteOrigin,
    mapRouteTarget,
    mapTravelMode,
    t,
  ]);

  const clearRoutePlanning = useCallback(() => {
    setMapRouteGeoJson(null);
    setMapRouteError(null);
    setMapRouteLoading(false);
  }, []);

  const runRouteToTarget = useCallback(
    async (target: [number, number], originSource: "home" | "me") => {
      const origin =
        originSource === "home" ? addressMapCenter : myLocationCenter;
      if (!origin) {
        if (originSource === "me") {
          requestMyLocation();
        }
        setMapRouteError(t("home.householdMapRouteNeedsOrigin"));
        return;
      }

      setMapRouteTarget(target);
      setMapRoutePickTargetActive(false);

      try {
        setMapRouteLoading(true);
        setMapRouteError(null);
        const response = await getHouseholdRoute({
          householdId: household.id,
          fromLat: origin[0],
          fromLon: origin[1],
          toLat: target[0],
          toLon: target[1],
          maxMinutes: mapRouteMaxMinutes ?? undefined,
          travelMode: mapTravelMode,
        });
        setMapRouteGeoJson(response.geojson);
        setMapRouteFitRequestToken(Date.now());
        setMapRouteTooltipOpenToken((current) => current + 1);
        setMapClosePopupRequestToken((current) => current + 1);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("home.householdMapRouteError");
        setMapRouteError(message);
      } finally {
        setMapRouteLoading(false);
      }
    },
    [
      addressMapCenter,
      household.id,
      mapRouteMaxMinutes,
      mapTravelMode,
      myLocationCenter,
      requestMyLocation,
      t,
    ],
  );

  const createManualMarkerAtQuickPin = useCallback(async () => {
    if (!mapQuickPin) return;
    if (!isHouseholdOwner) return;

    const nowIso = new Date().toISOString();
    const newMarker: HouseholdMapMarker = {
      id: createMarkerId(),
      type: "point",
      icon: "star",
      color: DEFAULT_MANUAL_MARKER_COLOR,
      title: t("home.householdMapMarkerPending"),
      description: "",
      image_b64: null,
      poi_ref: null,
      created_by: userId,
      created_at: nowIso,
      last_edited_by: userId,
      last_edited_at: nowIso,
      lat: Number(mapQuickPin[0].toFixed(6)),
      lon: Number(mapQuickPin[1].toFixed(6)),
    };

    try {
      const nextMarkers = [...household.household_map_markers, newMarker];
      await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      setMapQuickPin(null);
      setMapRenderVersion((current) => current + 1);
    } catch {
      // keep pin open so user can retry
    }
  }, [
    buildHouseholdUpdatePayload,
    household.household_map_markers,
    isHouseholdOwner,
    mapQuickPin,
    onUpdateHousehold,
    t,
    userId,
  ]);
  const createManualMarkerAtCoordinates = useCallback(
    async (
      lat: number,
      lon: number,
      options?: {
        openEditor?: boolean;
        initialTitle?: string;
        initialDescription?: string;
      },
    ) => {
      if (!isHouseholdOwner) return;
      const openEditor = options?.openEditor ?? true;
      const title =
        options?.initialTitle?.trim() || t("home.householdMapMarkerPending");
      const description = options?.initialDescription?.trim() ?? "";
      const nowIso = new Date().toISOString();
      const newMarker: HouseholdMapMarker = {
        id: createMarkerId(),
        type: "point",
        icon: "star",
        color: DEFAULT_MANUAL_MARKER_COLOR,
        title,
        description,
        image_b64: null,
        poi_ref: null,
        created_by: userId,
        created_at: nowIso,
        last_edited_by: userId,
        last_edited_at: nowIso,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      };

      try {
        const nextMarkers = [...household.household_map_markers, newMarker];
        await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
        setMapRenderVersion((current) => current + 1);
        if (openEditor) {
          setEditingMarkerError(null);
          setEditingMarkerDraft({
            id: newMarker.id,
            title,
            description,
            icon: newMarker.icon,
            color: newMarker.color,
          });
        }
      } catch {
        // ignore, popup stays open and user can retry
      }
    },
    [
      buildHouseholdUpdatePayload,
      household.household_map_markers,
      isHouseholdOwner,
      onUpdateHousehold,
      t,
      userId,
    ],
  );

  const mapRouteColor = useMemo(() => {
    switch (mapTravelMode) {
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
  }, [mapTravelMode]);

  const mapRouteSummary = useMemo(
    () => extractRouteSummary(mapRouteGeoJson),
    [mapRouteGeoJson],
  );
  const mapReachabilitySummary = useMemo(
    () => extractReachabilitySummary(mapReachabilityGeoJson),
    [mapReachabilityGeoJson],
  );

  const mapRouteModeLabel = useMemo(
    () =>
      t(
        (REACHABILITY_OPTIONS.find((option) => option.id === mapTravelMode)
          ?.labelKey ?? "home.householdMapRouteModeLabel") as never,
      ),
    [mapTravelMode, t],
  );
  const mapReachabilityAreaLabel = useMemo(() => {
    const area = mapReachabilitySummary?.areaSqm;
    if (!area || area <= 0) return t("home.householdMapRouteInfoUnknownValue");
    if (area >= 1_000_000) {
      return `${(area / 1_000_000).toFixed(2)} km²`;
    }
    return `${Math.round(area)} m²`;
  }, [mapReachabilitySummary, t]);
  const mapReachabilityRadiusLabel = useMemo(() => {
    const radius = mapReachabilitySummary?.maxRadiusMeters;
    if (!radius || radius <= 0)
      return t("home.householdMapRouteInfoUnknownValue");
    if (radius >= 1000) {
      return `${(radius / 1000).toFixed(1)} km`;
    }
    return `${Math.round(radius)} m`;
  }, [mapReachabilitySummary, t]);
  const mapReachabilityTooltipHtml = useMemo(() => {
    if (!mapReachabilitySummary) return null;
    const lines = [
      `${mapReachabilityMinutes} min · ${mapReachabilityAreaLabel}`,
      `${t("home.householdMapRouteInfoMode")}: ${mapRouteModeLabel}`,
      `${t("home.householdMapReachabilityInfoRadius")}: ${mapReachabilityRadiusLabel}`,
      `${t("home.householdMapReachabilityInfoPolygons")}: ${mapReachabilitySummary.polygonCount}`,
      `${t("home.householdMapReachabilityInfoPoints")}: ${mapReachabilitySummary.pointCount}`,
    ];
    const saveButtonHtml = `<button type="button" class="domora-route-tooltip-save domora-reachability-tooltip-save" ${
      mapReachabilitySaving || !isHouseholdOwner ? "disabled" : ""
    }>${escapeHtmlText(mapReachabilitySaving ? t("home.householdMapReachabilitySaving") : t("home.householdMapReachabilitySave"))}</button>`;
    return `<div class="domora-route-tooltip-inner">${lines
      .map(
        (line) =>
          `<div class="domora-route-tooltip-line">${escapeHtmlText(line)}</div>`,
      )
      .join(
        "",
      )}<div class="domora-route-tooltip-actions">${saveButtonHtml}</div></div>`;
  }, [
    isHouseholdOwner,
    mapReachabilityAreaLabel,
    mapReachabilityMinutes,
    mapReachabilityRadiusLabel,
    mapReachabilitySaving,
    mapReachabilitySummary,
    mapRouteModeLabel,
    t,
  ]);

  const mapRouteDurationLabel = useMemo(() => {
    if (
      !mapRouteSummary?.durationSeconds ||
      mapRouteSummary.durationSeconds <= 0
    ) {
      return t("home.householdMapRouteInfoUnknownValue");
    }
    if (mapRouteSummary.durationSeconds >= 3600) {
      return `${(mapRouteSummary.durationSeconds / 3600).toFixed(1)} h`;
    }
    return `${Math.max(1, Math.round(mapRouteSummary.durationSeconds / 60))} min`;
  }, [mapRouteSummary, t]);

  const mapRouteDistanceLabel = useMemo(() => {
    if (
      !mapRouteSummary?.distanceMeters ||
      mapRouteSummary.distanceMeters <= 0
    ) {
      return t("home.householdMapRouteInfoUnknownValue");
    }
    if (mapRouteSummary.distanceMeters >= 1000) {
      return `${(mapRouteSummary.distanceMeters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(mapRouteSummary.distanceMeters)} m`;
  }, [mapRouteSummary, t]);

  const mapRouteAverageSpeedLabel = useMemo(() => {
    if (
      !mapRouteSummary?.distanceMeters ||
      !mapRouteSummary.durationSeconds ||
      mapRouteSummary.durationSeconds <= 0
    ) {
      return t("home.householdMapRouteInfoUnknownValue");
    }
    const kmh =
      mapRouteSummary.distanceMeters /
      1000 /
      (mapRouteSummary.durationSeconds / 3600);
    if (!Number.isFinite(kmh) || kmh <= 0) {
      return t("home.householdMapRouteInfoUnknownValue");
    }
    return `${kmh.toFixed(1)} km/h`;
  }, [mapRouteSummary, t]);
  const mapRouteLineTooltipHtml = useMemo(() => {
    if (!mapRouteSummary) return null;
    const lines = [
      `${mapRouteDurationLabel} · ${mapRouteDistanceLabel}`,
      `${t("home.householdMapRouteInfoMode")}: ${mapRouteModeLabel}`,
      `${t("home.householdMapRouteInfoAverageSpeed")}: ${mapRouteAverageSpeedLabel}`,
      `${t("home.householdMapRouteInfoSegments")}: ${mapRouteSummary.segmentCount}`,
      `${t("home.householdMapRouteInfoPoints")}: ${mapRouteSummary.linePoints.length}`,
    ];
    const saveButtonHtml = `<button type="button" class="domora-route-tooltip-save" ${
      mapRouteSaving || !isHouseholdOwner ? "disabled" : ""
    }>${escapeHtmlText(mapRouteSaving ? t("home.householdMapRouteSaving") : t("home.householdMapRouteSave"))}</button>`;
    return `<div class="domora-route-tooltip-inner">${lines
      .map(
        (line) =>
          `<div class="domora-route-tooltip-line">${escapeHtmlText(line)}</div>`,
      )
      .join(
        "",
      )}<div class="domora-route-tooltip-actions">${saveButtonHtml}</div></div>`;
  }, [
    isHouseholdOwner,
    mapRouteAverageSpeedLabel,
    mapRouteDistanceLabel,
    mapRouteDurationLabel,
    mapRouteModeLabel,
    mapRouteSaving,
    mapRouteSummary,
    t,
  ]);

  const saveRouteToHouseholdMarkers = useCallback(async () => {
    if (!mapRouteSummary) return;
    if (!isHouseholdOwner) {
      setMapRouteSaveError(t("home.householdMapRouteSaveOwnerOnly"));
      return;
    }

    const nowIso = new Date().toISOString();
    const routeMarker: HouseholdMapMarker = {
      id: createMarkerId(),
      type: "vector",
      icon: "transit",
      color: mapRouteColor,
      title: t("home.householdMapRouteSavedDefaultTitle", {
        mode: mapRouteModeLabel,
      }),
      description: [
        `- ${t("home.householdMapRouteInfoMode")}: ${mapRouteModeLabel}`,
        `- ${t("home.householdMapRouteInfoDuration")}: ${mapRouteDurationLabel}`,
        `- ${t("home.householdMapRouteInfoDistance")}: ${mapRouteDistanceLabel}`,
      ].join("\n"),
      image_b64: null,
      poi_ref: null,
      created_by: userId,
      created_at: nowIso,
      last_edited_by: userId,
      last_edited_at: nowIso,
      points: mapRouteSummary.linePoints.map((point) => ({
        lat: Number(point.lat.toFixed(6)),
        lon: Number(point.lon.toFixed(6)),
      })),
    };

    try {
      setMapRouteSaving(true);
      setMapRouteSaveError(null);
      const nextMarkers = [...household.household_map_markers, routeMarker];
      await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      setMapRouteGeoJson(null);
      setMapRouteTarget(null);
      setMapRoutePickTargetActive(false);
      setMapRoutePanelOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("home.householdMapRouteSaveError");
      setMapRouteSaveError(message);
    } finally {
      setMapRouteSaving(false);
    }
  }, [
    buildHouseholdUpdatePayload,
    household.household_map_markers,
    isHouseholdOwner,
    mapRouteDistanceLabel,
    mapRouteDurationLabel,
    mapRouteColor,
    mapRouteModeLabel,
    mapRouteSummary,
    onUpdateHousehold,
    t,
    userId,
  ]);

  const saveReachabilityToHouseholdMarkers = useCallback(async () => {
    if (!mapReachabilitySummary) return;
    if (!isHouseholdOwner) {
      setMapReachabilitySaveError(
        t("home.householdMapReachabilitySaveOwnerOnly"),
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const closedPoints = [...mapReachabilitySummary.boundaryPoints];
    const first = closedPoints[0];
    const last = closedPoints[closedPoints.length - 1];
    if (first && last && (first.lat !== last.lat || first.lon !== last.lon)) {
      closedPoints.push(first);
    }

    const areaMarker: HouseholdMapMarker = {
      id: createMarkerId(),
      type: "vector",
      icon: "transit",
      color: mapRouteColor,
      title: t("home.householdMapReachabilitySavedDefaultTitle", {
        mode: mapRouteModeLabel,
        minutes: mapReachabilityMinutes,
      }),
      description: [
        `- ${t("home.householdMapRouteInfoMode")}: ${mapRouteModeLabel}`,
        `- ${t("home.householdMapReachabilityDurationLabel")}: ${mapReachabilityMinutes} min`,
        `- ${t("home.householdMapReachabilityInfoArea")}: ${mapReachabilityAreaLabel}`,
      ].join("\n"),
      image_b64: null,
      poi_ref: null,
      created_by: userId,
      created_at: nowIso,
      last_edited_by: userId,
      last_edited_at: nowIso,
      points: closedPoints.map((point) => ({
        lat: Number(point.lat.toFixed(6)),
        lon: Number(point.lon.toFixed(6)),
      })),
    };

    try {
      setMapReachabilitySaving(true);
      setMapReachabilitySaveError(null);
      const nextMarkers = [...household.household_map_markers, areaMarker];
      await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      setMapReachabilityGeoJson(null);
      setMapReachabilitySavedAt(Date.now());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("home.householdMapReachabilitySaveError");
      setMapReachabilitySaveError(message);
    } finally {
      setMapReachabilitySaving(false);
    }
  }, [
    buildHouseholdUpdatePayload,
    household.household_map_markers,
    isHouseholdOwner,
    mapReachabilityAreaLabel,
    mapReachabilityMinutes,
    mapReachabilitySummary,
    mapRouteColor,
    mapRouteModeLabel,
    onUpdateHousehold,
    t,
    userId,
  ]);

  useEffect(() => {
    setMapRouteSaveError(null);
  }, [mapRouteGeoJson]);

  useEffect(() => {
    if (!mapReachabilityGeoJson) return;
    setMapReachabilitySaveError(null);
    setMapReachabilitySavedAt(null);
  }, [mapReachabilityGeoJson]);

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
            maximumAge: 15000,
          },
        );
      }),
    [],
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
      const message =
        error instanceof Error ? error.message : t("app.unknownError");
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
        actorName,
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
              expiresAt,
            });
            void liveLocationsQuery.refetch();
          } catch {
            // Soft-fail heartbeat updates to avoid interrupting the active share.
          }
        })();
      }, 20_000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("app.unknownError");
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
    userId,
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
      const title = (
        draft?.title ??
        existing?.title ??
        poi.name ??
        t("home.householdMapPoiUnnamed")
      ).trim();
      if (!title) {
        setPoiOverrideError(t("home.householdMapPoiOverrideTitleRequired"));
        return;
      }

      const description = (
        draft?.description ??
        existing?.description ??
        ""
      ).trim();
      const nowIso = new Date().toISOString();
      const overrideMarker: HouseholdMapMarker = {
        id: existing?.id ?? `poi:${poi.id}`,
        type: "point",
        icon: getMarkerIconFromPoiCategory(poi.category),
        color: normalizeMarkerColor(existing?.color),
        title,
        description,
        image_b64: existing?.image_b64 ?? null,
        poi_ref: poi.id,
        created_by: existing?.created_by ?? userId,
        created_at: existing?.created_at ?? nowIso,
        last_edited_by: userId,
        last_edited_at: nowIso,
        lat: poi.lat,
        lon: poi.lon,
      };

      const nextMarkers = [
        ...household.household_map_markers.filter(
          (marker) =>
            marker.id !== overrideMarker.id && marker.poi_ref !== poi.id,
        ),
        overrideMarker,
      ];

      try {
        setPoiOverrideSavingId(poi.id);
        setPoiOverrideError(null);
        await onUpdateHousehold(buildHouseholdUpdatePayload(nextMarkers));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("app.unknownError");
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
      userId,
    ],
  );
  const markerHistoryNode = useCallback(
    (marker: HouseholdMapMarker) => (
      <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <p>
          {t("home.householdMapMarkerHistoryCreatedBy", {
            name: marker.created_by
              ? mapMemberLabel(marker.created_by)
              : t("common.memberFallback"),
            at: formatDateTime(marker.created_at, language, marker.created_at),
          })}
        </p>
        <p>
          {t("home.householdMapMarkerHistoryUpdatedBy", {
            name: marker.last_edited_by
              ? mapMemberLabel(marker.last_edited_by)
              : t("common.memberFallback"),
            at: formatDateTime(
              marker.last_edited_at,
              language,
              marker.last_edited_at,
            ),
          })}
        </p>
      </div>
    ),
    [language, mapMemberLabel, t],
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
        <a
          href={buildExternalMapsHref(lat, lon)}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t("home.householdMapOpen")}
        </a>
      </Button>
    ),
    [buildExternalMapsHref, t],
  );
  const renderMapPopupActions = useCallback(
    ({
      lat,
      lon,
      onEdit,
      editLabelKey,
    }: {
      lat: number;
      lon: number;
      onEdit?: () => void;
      editLabelKey?:
        | "home.householdMapMarkerEditAction"
        | "home.householdMapQuickPinCreate";
    }) => (
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start gap-1.5 px-2 text-xs leading-tight"
          onClick={() => {
            onEdit?.();
          }}
          disabled={!onEdit}
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          {t(editLabelKey ?? "home.householdMapMarkerEditAction")}
        </Button>
        <Button
          asChild
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start gap-1.5 px-2 text-xs leading-tight"
        >
          <a
            href={buildExternalMapsHref(lat, lon)}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            {t("home.householdMapOpen")}
          </a>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start gap-1.5 px-2 text-xs leading-tight"
          onClick={() => {
            void runRouteToTarget([lat, lon], "home");
          }}
        >
          <Route className="h-3.5 w-3.5 shrink-0" />
          {t("home.householdMapRouteFromHome")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start gap-1.5 px-2 text-xs leading-tight"
          onClick={() => {
            void runRouteToTarget([lat, lon], "me");
          }}
        >
          <Route className="h-3.5 w-3.5 shrink-0" />
          {t("home.householdMapRouteFromMe")}
        </Button>
      </div>
    ),
    [buildExternalMapsHref, runRouteToTarget, t],
  );
  const editingMarkerMeta = useMemo(
    () =>
      editingMarkerDraft
        ? (household.household_map_markers.find(
            (marker) => marker.id === editingMarkerDraft.id,
          ) ?? null)
        : null,
    [editingMarkerDraft, household.household_map_markers],
  );
  const onMeasuredWithGeoman = useCallback(
    (result: MapMeasureResult) => {
      if (
        result.mode === "distance" &&
        typeof result.distanceMeters === "number"
      ) {
        const value =
          result.distanceMeters >= 1000
            ? `${(result.distanceMeters / 1000).toFixed(2)} km`
            : `${Math.round(result.distanceMeters)} m`;
        setMapMeasureResult(
          t("home.householdMapMeasureResultDistance", { value }),
        );
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
    [t],
  );
  const clearMeasureResultAndLayer = useCallback(() => {
    setMapMeasureMode(null);
    setMapMeasureResult(null);
    setMapMeasureResultAnchor(null);
    setMapMeasureClearToken((current) => current + 1);
  }, []);
  const dismissMapPanelsOnMapClick = useCallback(() => {
    if (
      mapRoutePickOriginActive ||
      mapRoutePickTargetActive ||
      mapReachabilityPickOriginActive
    )
      return;
    setMapReachabilityPanelOpen(false);
    setMapRoutePanelOpen(false);
  }, [
    mapReachabilityPickOriginActive,
    mapRoutePickOriginActive,
    mapRoutePickTargetActive,
  ]);

  useEffect(() => {
    if (!isMapFullscreenOpen) {
      setMapGeomanControlsOpen(false);
    }
  }, [isMapFullscreenOpen]);
  const bucketAddressCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          bucketItems
            .map((item) => (item.address ?? "").trim())
            .filter(
              (address) => address.length >= MIN_ADDRESS_LENGTH_FOR_GEOCODE,
            ),
        ),
      ),
    [bucketItems],
  );

  const [bucketAddressGeocodes, setBucketAddressGeocodes] = useState<
    Record<string, { lat: number; lon: number; label: string } | null>
  >({});
  const bucketMapEntries = useMemo(
    () =>
      bucketItems.flatMap((item) => {
        const address = (item.address ?? "").trim();
        if (address.length < MIN_ADDRESS_LENGTH_FOR_GEOCODE) return [];
        const geocoded = bucketAddressGeocodes[address];
        if (!geocoded) return [];
        return [
          {
            item,
            lat: geocoded.lat,
            lon: geocoded.lon,
            label: geocoded.label,
          },
        ];
      }),
    [bucketAddressGeocodes, bucketItems],
  );
  const formatSuggestedDate = useMemo(
    () => (value: string) => {
      const parsed = new Date(`${value}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return value;
      return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
        parsed,
      );
    },
    [language],
  );

  const renderHouseholdMapSurface = useCallback(
    (containerClassName: string, isFullscreen: boolean) => (
      <div className={containerClassName}>
        <div className="absolute left-2 top-2 z-[1000] flex max-w-[min(320px,calc(100%-1rem))] flex-col items-start gap-1.5">
            {myActiveLiveLocation ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 border-slate-200/85 bg-white/95 p-0 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                onClick={() => {
                  void stopLiveLocationShareNow();
                }}
                disabled={liveShareStatus === "stopping"}
                aria-label={t("home.householdMapLiveShareStop")}
                title={t("home.householdMapLiveShareStop")}
              >
                {liveShareStatus === "stopping" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Satellite className="h-4 w-4" />
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 border-slate-200/85 bg-white/95 p-0 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                onClick={() => {
                  setIsLiveShareDialogOpen(true);
                }}
                disabled={liveShareStatus === "starting"}
                aria-label={t("home.householdMapLiveShareStart")}
                title={t("home.householdMapLiveShareStart")}
              >
                {liveShareStatus === "starting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Satellite className="h-4 w-4" />
                )}
              </Button>
            )}
            {myActiveLiveLocation ? (
              <p className="rounded-md border border-slate-200/85 bg-white/95 px-2 py-1 text-[11px] text-slate-500 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 dark:text-slate-400">
                {t("home.householdMapLiveShareActiveUntil", {
                  at: formatDateTime(
                    myActiveLiveLocation.expires_at,
                    language,
                    myActiveLiveLocation.expires_at,
                  ),
                })}
              </p>
            ) : null}
            {activeLiveLocations.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {activeLiveLocations.map((entry) => (
                  <span
                    key={`live-active-chip-${entry.user_id}`}
                    className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    {mapMemberLabel(entry.user_id)}
                  </span>
                ))}
              </div>
            ) : null}
            {liveShareError ? (
              <p className="rounded-md border border-rose-200/85 bg-white/95 px-2 py-1 text-[11px] text-rose-600 shadow-sm backdrop-blur dark:border-rose-900/80 dark:bg-slate-900/95 dark:text-rose-400">
                {liveShareError}
              </p>
            ) : null}
        </div>
        <div
          className={`absolute right-2 left-auto z-[1000] flex flex-col gap-2 ${isFullscreen ? "bottom-[7.5rem]" : "bottom-2"}`}
        >
          {isFullscreen && (mapMeasureMode || mapMeasureResult) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
              onClick={() => {
                clearMeasureResultAndLayer();
              }}
              aria-label={t("home.householdMapMeasureClear")}
              title={t("home.householdMapMeasureClear")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          {isFullscreen ? (
            <Button
              type="button"
              size="sm"
              variant={mapMeasureMode ? "default" : "outline"}
              className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
              onClick={() => {
                setMapMeasureResult(null);
                setMapMeasureResultAnchor(null);
                setMapMeasureClearToken((current) => current + 1);
                setMapMeasureMode((current) => (current ? null : "smart"));
              }}
              aria-label={t("home.householdMapMeasureLabel")}
              title={t("home.householdMapMeasureLabel")}
            >
              <Ruler className="h-4 w-4" />
            </Button>
          ) : null}
          {isFullscreen ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                onClick={() =>
                  setMapRecenterRequestToken((current) => current + 1)
                }
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
            </>
          ) : null}
        </div>
        {isFullscreen ? (
          <div className="absolute right-2 top-2 z-[1000] flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                  aria-label={t("home.householdMapTravelModeLabel")}
                  title={t("home.householdMapTravelModeLabel")}
                >
                  <span className="text-sm leading-none">
                    {getTravelModeGlyph(mapTravelMode)}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[170px]">
                {REACHABILITY_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={`global-travel-mode-${option.id}`}
                    checked={mapTravelMode === option.id}
                    onCheckedChange={(checked) => {
                      if (!checked) return;
                      setMapTravelMode(option.id);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{getTravelModeGlyph(option.id)}</span>
                      <span>{t(option.labelKey as never)}</span>
                    </span>
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
                  className="h-8 gap-2 border-slate-200/80 bg-white/95 px-2.5 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>
                    {t("home.calendarFilterAction")} (
                    {selectedPoiCategories.length})
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
                        [option.id]: Boolean(checked),
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
                <DropdownMenuLabel>
                  {t("home.householdMapManualFilterLabel")}
                </DropdownMenuLabel>
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
                <div className="hidden md:block">
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    {t("home.householdMapManualFilterByMember")}
                  </DropdownMenuLabel>
                  {memberOptionsForMarkerFilter.map((memberOption) => (
                    <DropdownMenuCheckboxItem
                      key={memberOption.id}
                      checked={
                        manualMarkerFilterMode === "member" &&
                        manualMarkerFilterMemberId === memberOption.id
                      }
                      onCheckedChange={(checked) => {
                        if (!checked) return;
                        setManualMarkerFilterMode("member");
                        setManualMarkerFilterMemberId(memberOption.id);
                      }}
                    >
                      {memberOption.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
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
                <DropdownMenuLabel>
                  {t("home.householdMapWeatherLayers")}
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={mapWeatherLayers.radar}
                  onCheckedChange={(checked) =>
                    setMapWeatherLayers((current) => ({
                      ...current,
                      radar: Boolean(checked),
                    }))
                  }
                >
                  {t("home.householdMapWeatherLayerRadar")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={mapWeatherLayers.warnings}
                  onCheckedChange={(checked) =>
                    setMapWeatherLayers((current) => ({
                      ...current,
                      warnings: Boolean(checked),
                    }))
                  }
                >
                  {t("home.householdMapWeatherLayerWarnings")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={mapWeatherLayers.lightning}
                  onCheckedChange={(checked) =>
                    setMapWeatherLayers((current) => ({
                      ...current,
                      lightning: Boolean(checked),
                    }))
                  }
                >
                  {t("home.householdMapWeatherLayerLightning")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  {t("home.householdMapMobilityLayers")}
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={mapMobilityLayers.transitLive}
                  onCheckedChange={(checked) =>
                    setMapMobilityLayers((current) => ({
                      ...current,
                      transitLive: Boolean(checked),
                    }))
                  }
                >
                  {t("home.householdMapMobilityLayerTransit")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={mapMobilityLayers.bikeNetwork}
                  onCheckedChange={(checked) =>
                    setMapMobilityLayers((current) => ({
                      ...current,
                      bikeNetwork: Boolean(checked),
                    }))
                  }
                >
                  {t("home.householdMapMobilityLayerBike")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={mapMobilityLayers.trafficLive}
                  onCheckedChange={(checked) =>
                    setMapMobilityLayers((current) => ({
                      ...current,
                      trafficLive: Boolean(checked),
                    }))
                  }
                >
                  {t("home.householdMapMobilityLayerTraffic")}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        {isFullscreen ? (
          <div className="absolute right-2 top-12 z-[1000] flex max-w-[280px] flex-col gap-1">
            {mapMobilityLayers.transitLive && transitLiveQuery.isLoading ? (
              <div className="rounded-md border border-slate-200/85 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 dark:text-slate-300">
                {t("home.householdMapMobilityTransitLoading")}
              </div>
            ) : null}
            {mapMobilityLayers.transitLive && transitLiveQuery.isError ? (
              <div className="rounded-md border border-rose-200/85 bg-rose-50/95 px-2 py-1 text-xs text-rose-700 shadow-sm backdrop-blur dark:border-rose-900/80 dark:bg-rose-950/70 dark:text-rose-200">
                {t("home.householdMapMobilityTransitError")}
              </div>
            ) : null}
            {mapMobilityLayers.transitLive &&
            !transitLiveQuery.isLoading &&
            !transitLiveQuery.isError &&
            transitLiveStops.length === 0 ? (
              <div className="rounded-md border border-slate-200/85 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 dark:text-slate-300">
                {t("home.householdMapMobilityTransitEmpty")}
              </div>
            ) : null}
            {mapMobilityLayers.trafficLive && !hasGermanMapCenter ? (
              <div className="rounded-md border border-amber-200/85 bg-amber-50/95 px-2 py-1 text-xs text-amber-700 shadow-sm backdrop-blur dark:border-amber-900/80 dark:bg-amber-950/60 dark:text-amber-200">
                {t("home.householdMapMobilityTrafficOutsideGermany")}
              </div>
            ) : null}
            {mapMobilityLayers.trafficLive &&
            hasGermanMapCenter &&
            trafficLiveQuery.isLoading ? (
              <div className="rounded-md border border-slate-200/85 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 dark:text-slate-300">
                {t("home.householdMapMobilityTrafficLoading")}
              </div>
            ) : null}
            {mapMobilityLayers.trafficLive &&
            hasGermanMapCenter &&
            trafficLiveQuery.isError ? (
              <div className="rounded-md border border-rose-200/85 bg-rose-50/95 px-2 py-1 text-xs text-rose-700 shadow-sm backdrop-blur dark:border-rose-900/80 dark:bg-rose-950/70 dark:text-rose-200">
                {t("home.householdMapMobilityTrafficError")}
              </div>
            ) : null}
            {mapMobilityLayers.trafficLive &&
            hasGermanMapCenter &&
            !trafficLiveQuery.isLoading &&
            !trafficLiveQuery.isError &&
            trafficLiveIncidents.length === 0 ? (
              <div className="rounded-md border border-slate-200/85 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 dark:text-slate-300">
                {t("home.householdMapMobilityTrafficEmpty")}
              </div>
            ) : null}
          </div>
        ) : null}
        {isFullscreen ? (
          <div className="absolute bottom-[7.5rem] left-2 right-auto z-[1000] flex flex-col gap-2">
            {isHouseholdOwner ? (
              <Button
                type="button"
                size="sm"
                variant={mapGeomanControlsOpen ? "default" : "outline"}
                className="h-8 w-8 border-slate-200/80 bg-white/95 p-0 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95"
                onClick={() => {
                  setMapGeomanControlsOpen((current) => !current);
                }}
                aria-label={t("home.householdMapEditTools")}
                title={t("home.householdMapEditTools")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
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
              <CircleDot className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <MapContainer
          key={`household-map-${isFullscreen ? "fullscreen" : "inline"}-${mapRenderVersion}`}
          className="domora-map-surface"
          center={mapCenter}
          zoom={mapZoom}
          zoomControl={false}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <GeomanEditorBridge
            enabled={isHouseholdOwner && isFullscreen && mapGeomanControlsOpen}
            suppressCreate={Boolean(mapMeasureMode)}
            userId={userId}
            defaultTitle={t("home.householdMapMarkerPending")}
            onMarkersChange={onGeomanMarkersChanged}
            resolveMarkerIcon={getManualMarkerIcon}
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
            enabled={
              isFullscreen ||
              mapWeatherLayers.radar ||
              mapWeatherLayers.warnings ||
              mapWeatherLayers.lightning
            }
            layers={mapWeatherLayers}
            showTimelineControl={isFullscreen}
          />
          <RouteTargetPickBridge
            enabled={
              isFullscreen && mapRoutePanelOpen && mapRoutePickOriginActive
            }
            onPick={(lat, lon) => {
              setMapRouteOriginManual([lat, lon]);
              setMapRoutePickOriginActive(false);
            }}
          />
          <RouteTargetPickBridge
            enabled={
              isFullscreen && mapRoutePanelOpen && mapRoutePickTargetActive
            }
            onPick={(lat, lon) => {
              setMapRouteTarget([lat, lon]);
              setMapRoutePickTargetActive(false);
            }}
          />
          <RouteTargetPickBridge
            enabled={
              isFullscreen &&
              mapReachabilityPanelOpen &&
              mapReachabilityPickOriginActive
            }
            onPick={(lat, lon) => {
              setMapReachabilityOrigin([lat, lon]);
              setMapReachabilityOriginManual(true);
              setMapReachabilityPickOriginActive(false);
              setMapReachabilityError(null);
            }}
          />
          <QuickPinDropBridge
            enabled={
              isFullscreen &&
              !mapRoutePickOriginActive &&
              !mapRoutePickTargetActive &&
              !mapReachabilityPickOriginActive &&
              mapMeasureMode === null
            }
            onDrop={(lat, lon) => {
              setMapQuickPin([lat, lon]);
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
          <MapInlineFullscreenBridge
            enabled={!isFullscreen}
            onOpen={openMapFullscreen}
          />
          <RouteLayerBridge
            geojson={mapRouteGeoJson}
            color={mapRouteColor}
            tooltipHtml={mapRouteLineTooltipHtml}
            onSaveRoute={
              mapRouteSummary
                ? () => {
                    void saveRouteToHouseholdMarkers();
                  }
                : null
            }
            openTooltipToken={mapRouteTooltipOpenToken}
          />
          <RouteFitBoundsBridge
            geojson={mapRouteGeoJson}
            requestToken={mapRouteFitRequestToken}
          />
          <ReachabilityLayerBridge
            geojson={mapReachabilityGeoJson}
            color={mapReachabilityColor}
            tooltipHtml={mapReachabilityTooltipHtml}
            onSaveReachability={
              mapReachabilitySummary
                ? () => {
                    void saveReachabilityToHouseholdMarkers();
                  }
                : null
            }
          />
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
            enabled={
              isFullscreen &&
              (mapSearchInputFocused || mapSearchQuery.trim().length >= 2)
            }
            onBoundsChange={handleMapSearchViewportBoundsChange}
          />
          <MapSearchZoomBridge request={mapSearchZoomRequest} />
          <MapZoomBridge onZoomChange={handleMapZoomChange} />
          <MapClosePopupBridge requestToken={mapClosePopupRequestToken} />
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
          {mapMobilityLayers.bikeNetwork ? (
            <TileLayer
              key="bike-network-layer"
              attribution={BIKE_NETWORK_ATTRIBUTION}
              url={BIKE_NETWORK_TILE_URL}
              subdomains="abc"
              maxZoom={20}
              opacity={0.75}
              updateWhenIdle={false}
              updateWhenZooming
              keepBuffer={3}
            />
          ) : null}
          {mapMobilityLayers.transitLive
            ? transitLiveStops.map((stop) => (
                <Marker
                  key={`transit-stop-${stop.id}`}
                  position={[stop.lat, stop.lon]}
                  icon={getMobilityMarkerIcon("transit")}
                  eventHandlers={{
                    click: () => {
                      setTransitDialogStop(stop);
                    },
                  }}
                  pmIgnore
                />
              ))
            : null}
          {mapMobilityLayers.trafficLive
            ? trafficLiveIncidents.map((incident) => (
                <Marker
                  key={`traffic-incident-${incident.id}`}
                  position={[incident.lat, incident.lon]}
                  icon={getMobilityMarkerIcon("traffic")}
                  pmIgnore
                >
                  <Popup>
                    <div className="space-y-1.5">
                      <p className="font-semibold">{incident.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">
                        {incident.road}
                        {incident.subtitle ? ` · ${incident.subtitle}` : ""}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">
                        {incident.abnormalTrafficType ??
                          t("home.householdMapRouteInfoUnknownValue")}
                        {incident.averageSpeedKmh !== null
                          ? ` · ${t("home.householdMapMobilityAvgSpeed", { speed: incident.averageSpeedKmh })}`
                          : ""}
                      </p>
                      {incident.updatedAtIso ? (
                        <p className="text-xs text-slate-500 dark:text-slate-300">
                          {t("home.householdMapMobilityUpdatedAt", {
                            at: formatDateTime(
                              incident.updatedAtIso,
                              language,
                              incident.updatedAtIso,
                            ),
                          })}
                        </p>
                      ) : null}
                      {renderOpenInMapsButton(incident.lat, incident.lon)}
                    </div>
                  </Popup>
                </Marker>
              ))
            : null}
          {mapHasPin ? (
            <Marker
              position={mapCenter}
              icon={getManualMarkerIcon("home")}
              pmIgnore
            >
              <LeafletTooltip interactive>
                <div
                  className="min-w-[180px] rounded-md border border-white/30 bg-white/92 p-2 text-slate-900 shadow-md dark:border-slate-600/70 dark:bg-slate-900/90 dark:text-slate-100"
                  style={
                    isFullscreen && householdImageUrl
                      ? {
                          backgroundImage: `linear-gradient(rgba(2,6,23,0.45), rgba(2,6,23,0.45)), url("${householdImageUrl}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          color: "#f8fafc",
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
                  {renderOpenInMapsButton(
                    myLocationCenter[0],
                    myLocationCenter[1],
                  )}
                </div>
              </Popup>
            </Marker>
          ) : null}
          {otherActiveLiveLocations.map((entry) => (
            <Marker
              key={`live-location-${entry.user_id}`}
              position={[entry.lat, entry.lon]}
              icon={getLiveLocationUserIcon(
                getMemberAvatarForMap(entry.user_id),
              )}
              pmIgnore
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold">
                    {t("home.householdMapLiveLocationUser", {
                      name: mapMemberLabel(entry.user_id),
                    })}
                  </p>
                  <p className="text-xs">
                    {t("home.householdMapLiveLocationUntil", {
                      at: formatDateTime(
                        entry.expires_at,
                        language,
                        entry.expires_at,
                      ),
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
              zIndexOffset={-1000}
              pmIgnore
            >
              <Popup>
                <div className="space-y-1">
                  <p className="text-xs font-semibold">
                    {t("home.householdMapRouteTarget")}
                  </p>
                  {renderOpenInMapsButton(mapRouteTarget[0], mapRouteTarget[1])}
                </div>
              </Popup>
            </Marker>
          ) : null}
          {mapQuickPin ? (
            <Marker
              key={`quick-pin-${mapQuickPin[0]}-${mapQuickPin[1]}`}
              position={mapQuickPin}
              icon={getRoutePointMarkerIcon("#475569")}
              ref={(marker) => {
                quickPinMarkerRef.current = marker;
              }}
              pmIgnore
            >
              <Popup>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        void createManualMarkerAtQuickPin();
                      }}
                      disabled={!isHouseholdOwner}
                    >
                      {t("home.householdMapQuickPinCreate")}
                    </Button>
                    {renderOpenInMapsButton(mapQuickPin[0], mapQuickPin[1])}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        void runRouteToTarget(
                          [mapQuickPin[0], mapQuickPin[1]],
                          "home",
                        );
                      }}
                    >
                      {t("home.householdMapRouteFromHome")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        void runRouteToTarget(
                          [mapQuickPin[0], mapQuickPin[1]],
                          "me",
                        );
                      }}
                    >
                      {t("home.householdMapRouteFromMe")}
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null}
          {isFullscreen &&
          mapReachabilityOrigin &&
          mapReachabilityOriginManual ? (
            <Marker
              key={`reachability-origin-${mapReachabilityOrigin[0]}-${mapReachabilityOrigin[1]}`}
              position={mapReachabilityOrigin}
              icon={getRoutePointMarkerIcon(mapReachabilityColor)}
              pmIgnore
            >
              <Popup>
                <div className="space-y-1">
                  <p className="text-xs font-semibold">
                    {t("home.householdMapReachabilityOriginLabel")}
                  </p>
                  {renderOpenInMapsButton(
                    mapReachabilityOrigin[0],
                    mapReachabilityOrigin[1],
                  )}
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
                      {renderMapPopupActions({
                        lat: result.lat,
                        lon: result.lon,
                        editLabelKey: "home.householdMapQuickPinCreate",
                        onEdit: isHouseholdOwner
                          ? () => {
                              const segments = result.label
                                .split(",")
                                .map((part) => part.trim())
                                .filter(Boolean);
                              const initialTitle = segments[0] || result.label;
                              const initialDescription =
                                segments.length > 1
                                  ? segments.slice(1).join(", ")
                                  : result.label;
                              void createManualMarkerAtCoordinates(
                                result.lat,
                                result.lon,
                                {
                                  initialTitle,
                                  initialDescription,
                                },
                              );
                            }
                          : undefined,
                      })}
                    </div>
                  </Popup>
                </Marker>
              ))
            : null}
          {bucketMapEntries.map((entry) => (
            <BucketMapMarker
              key={`bucket-map-${entry.item.id}`}
              entry={entry}
              userId={userId}
              busy={busy}
              onToggleBucketDateVote={onToggleBucketDateVote}
              formatSuggestedDate={formatSuggestedDate}
              renderMapPopupActions={renderMapPopupActions}
            />
          ))}
          {filteredHouseholdMarkers.map((marker, markerIndex) => {
            const markerRenderKey = `${marker.type}:${marker.id}:${markerIndex}`;
            if (marker.type === "point") {
              return (
                <Marker
                  key={markerRenderKey}
                  position={[marker.lat, marker.lon]}
                  icon={getManualMarkerIcon(marker.icon, marker.color)}
                  pmIgnore={!isHouseholdOwner}
                  eventHandlers={{
                    add: (event) => {
                      (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                    },
                  }}
                >
                  {marker.poi_ref ? (
                    <Popup>
                      <div className="space-y-2">
                        <p className="font-semibold">
                          {getMarkerEmoji(marker.icon)} {marker.title}
                        </p>
                        {renderMapPopupActions({
                          lat: marker.lat,
                          lon: marker.lon,
                          onEdit: isHouseholdOwner
                            ? () =>
                                setActivePoiEditorId((current) =>
                                  current === marker.poi_ref
                                    ? null
                                    : (marker.poi_ref ?? null),
                                )
                            : undefined,
                        })}
                        {activePoiEditorId === marker.poi_ref ? (
                          <>
                            <Input
                              value={
                                poiOverrideDrafts[marker.poi_ref]?.title ??
                                marker.title
                              }
                              onChange={(event) =>
                                setPoiOverrideDrafts((current) => ({
                                  ...current,
                                  [marker.poi_ref!]: {
                                    title: event.target.value,
                                    description:
                                      current[marker.poi_ref!]?.description ??
                                      marker.description,
                                  },
                                }))
                              }
                              placeholder={t(
                                "home.householdMapPoiOverrideTitlePlaceholder",
                              )}
                            />
                            <Input
                              value={
                                poiOverrideDrafts[marker.poi_ref]
                                  ?.description ?? marker.description
                              }
                              onChange={(event) =>
                                setPoiOverrideDrafts((current) => ({
                                  ...current,
                                  [marker.poi_ref!]: {
                                    title:
                                      current[marker.poi_ref!]?.title ??
                                      marker.title,
                                    description: event.target.value,
                                  },
                                }))
                              }
                              placeholder={t(
                                "home.householdMapPoiOverrideDescriptionPlaceholder",
                              )}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 w-full"
                              onClick={() => {
                                void onSaveExistingPoiOverride(marker);
                              }}
                              disabled={
                                !isHouseholdOwner ||
                                poiOverrideSavingId === marker.poi_ref
                              }
                            >
                              {poiOverrideSavingId === marker.poi_ref
                                ? t("home.householdMapPoiOverrideSaving")
                                : t("home.householdMapPoiOverrideSave")}
                            </Button>
                          </>
                        ) : null}
                        {marker.image_b64 ? (
                          <img
                            src={marker.image_b64}
                            alt={marker.title}
                            className="max-h-32 w-full rounded object-cover"
                          />
                        ) : null}
                        {marker.description ? (
                          <div className="prose prose-xs max-w-none text-xs dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {marker.description}
                            </ReactMarkdown>
                          </div>
                        ) : null}
                      </div>
                    </Popup>
                  ) : (
                    <ManualMarkerPopup
                      marker={marker}
                      isHouseholdOwner={isHouseholdOwner}
                      openMarkerEdit={openMarkerEdit}
                      renderMapPopupActions={renderMapPopupActions}
                    />
                  )}
                </Marker>
              );
            }

            if (marker.type === "vector") {
              const positions = marker.points.map(
                (point) => [point.lat, point.lon] as [number, number],
              );
              const isClosedVector = isClosedVectorPath(
                marker.points.map((point) => L.latLng(point.lat, point.lon)),
              );
              const markerStrokeColor = normalizeMarkerColor(marker.color);
              if (isClosedVector) {
                return (
                  <Polygon
                    key={markerRenderKey}
                    positions={positions}
                    pathOptions={{
                      color: markerStrokeColor,
                      weight: 3,
                      opacity: 0.9,
                      fillColor: markerStrokeColor,
                      fillOpacity: 0.18,
                    }}
                    pmIgnore={!isHouseholdOwner}
                    eventHandlers={{
                      add: (event) => {
                        (event.target as DomoraLeafletLayer)._domoraMeta =
                          marker;
                      },
                    }}
                  >
                    <ManualMarkerPopup
                      marker={marker}
                      isHouseholdOwner={isHouseholdOwner}
                      openMarkerEdit={openMarkerEdit}
                      renderMapPopupActions={renderMapPopupActions}
                    />
                  </Polygon>
                );
              }

              return (
                <Polyline
                  key={markerRenderKey}
                  positions={positions}
                  pathOptions={{
                    color: markerStrokeColor,
                    weight: 5,
                    opacity: 0.85,
                  }}
                  pmIgnore={!isHouseholdOwner}
                  eventHandlers={{
                    add: (event) => {
                      (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                    },
                  }}
                >
                  <ManualMarkerPopup
                    marker={marker}
                    isHouseholdOwner={isHouseholdOwner}
                    openMarkerEdit={openMarkerEdit}
                    renderMapPopupActions={renderMapPopupActions}
                  />
                </Polyline>
              );
            }

            if (marker.type === "circle") {
              const markerStrokeColor = normalizeMarkerColor(marker.color);
              return (
                <Circle
                  key={markerRenderKey}
                  center={[marker.center.lat, marker.center.lon]}
                  radius={marker.radius_meters}
                  pathOptions={{
                    color: markerStrokeColor,
                    fillColor: markerStrokeColor,
                    fillOpacity: 0.2,
                    weight: 3,
                  }}
                  pmIgnore={!isHouseholdOwner}
                  eventHandlers={{
                    add: (event) => {
                      (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                    },
                  }}
                >
                  <ManualMarkerPopup
                    marker={marker}
                    isHouseholdOwner={isHouseholdOwner}
                    openMarkerEdit={openMarkerEdit}
                    renderMapPopupActions={renderMapPopupActions}
                  />
                </Circle>
              );
            }

            const markerStrokeColor = normalizeMarkerColor(marker.color);
            return (
              <Rectangle
                key={markerRenderKey}
                bounds={[
                  [marker.bounds.south, marker.bounds.west],
                  [marker.bounds.north, marker.bounds.east],
                ]}
                pathOptions={{
                  color: markerStrokeColor,
                  fillColor: markerStrokeColor,
                  fillOpacity: 0.2,
                  weight: 3,
                }}
                pmIgnore={!isHouseholdOwner}
                eventHandlers={{
                  add: (event) => {
                    (event.target as DomoraLeafletLayer)._domoraMeta = marker;
                  },
                }}
              >
                <ManualMarkerPopup
                  marker={marker}
                  isHouseholdOwner={isHouseholdOwner}
                  openMarkerEdit={openMarkerEdit}
                  renderMapPopupActions={renderMapPopupActions}
                />
              </Rectangle>
            );
          })}
          {mapPoiDisplayEntries.map((entry) =>
            entry.type === "cluster" ? (
              <Marker
                key={entry.id}
                position={[entry.lat, entry.lon]}
                icon={getPoiClusterMarkerIcon(entry.count)}
                pmIgnore
                eventHandlers={{
                  click: (event) => {
                    const marker = event.target as L.Marker;
                    const markerMap = (marker as unknown as { _map?: L.Map })
                      ._map;
                    if (!markerMap) return;
                    markerMap.setView(
                      marker.getLatLng(),
                      Math.min(markerMap.getZoom() + 2, 19),
                      { animate: true },
                    );
                  },
                }}
              >
                <Popup>
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {t("home.householdMapPoiCount", { count: entry.count })}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-300">
                      {Object.entries(entry.categoryCounts)
                        .map(
                          ([category, count]) =>
                            `${getPoiEmoji(category as PoiCategory)} ${count}`,
                        )
                        .join(" · ")}
                    </p>
                    <div className="max-h-28 space-y-0.5 overflow-auto text-xs text-slate-700 dark:text-slate-300">
                      {entry.pois.slice(0, 8).map((poi) => (
                        <p key={`poi-cluster-item-${entry.id}-${poi.id}`}>
                          {getPoiEmoji(poi.category)}{" "}
                          {poi.name ?? t("home.householdMapPoiUnnamed")}
                        </p>
                      ))}
                      {entry.pois.length > 8 ? (
                        <p className="text-slate-500 dark:text-slate-400">
                          +{entry.pois.length - 8}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ) : (
              <PoiMapMarker
                key={entry.poi.id}
                poi={entry.poi}
                isHouseholdOwner={isHouseholdOwner}
                activePoiEditorId={activePoiEditorId}
                setActivePoiEditorId={setActivePoiEditorId}
                poiOverrideDrafts={poiOverrideDrafts}
                poiOverrideMarkersByRef={poiOverrideMarkersByRef}
                setPoiOverrideDrafts={setPoiOverrideDrafts}
                poiOverrideSavingId={poiOverrideSavingId}
                onSavePoiOverride={onSavePoiOverride}
                renderMapPopupActions={renderMapPopupActions}
              />
            ),
          )}
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
                <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("home.householdMapSearchLoading")}
                </p>
              ) : null}
              {mapSearchInputFocused && !mapSearchLoading && mapSearchError ? (
                <p className="pt-1 text-xs text-rose-600 dark:text-rose-400">
                  {mapSearchError}
                </p>
              ) : null}
              {mapSearchInputFocused &&
              !mapSearchLoading &&
              !mapSearchError &&
              mapSearchQuery.trim().length >= 2 &&
              mapSearchResults.length === 0 ? (
                <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("home.householdMapSearchEmpty")}
                </p>
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
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t("home.householdMapReachabilityInfoTitle")}
              </p>
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
                    setMapReachabilityMinutes(
                      Math.max(1, Math.min(180, Math.round(parsed))),
                    );
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {mapReachabilityOrigin
                  ? t("home.householdMapReachabilityOriginReady", {
                      lat: mapReachabilityOrigin[0].toFixed(5),
                      lon: mapReachabilityOrigin[1].toFixed(5),
                    })
                  : t("home.householdMapReachabilityNeedsOrigin")}
              </div>
              <Button
                type="button"
                size="sm"
                variant={
                  mapReachabilityPickOriginActive ? "default" : "outline"
                }
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
                  {!mapReachabilityLoading ? (
                    <span className="mr-1 text-sm leading-none">
                      {getTravelModeGlyph(mapTravelMode)}
                    </span>
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
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {mapReachabilityError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {isFullscreen && mapRoutePanelOpen ? (
          <div className="absolute bottom-2 left-2 right-2 z-[1100] rounded-xl border border-slate-200/85 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/95 sm:bottom-[11rem] sm:left-auto sm:w-[min(340px,calc(100%-1rem))]">
            <div className="grid grid-cols-1 gap-2">
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
                  value={
                    mapRouteMaxMinutes === null
                      ? ""
                      : String(mapRouteMaxMinutes)
                  }
                  placeholder={t("home.householdMapRouteMaxDurationAuto")}
                  onChange={(event) => {
                    if (event.target.value.trim() === "") {
                      setMapRouteMaxMinutes(null);
                      return;
                    }
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    setMapRouteMaxMinutes(
                      Math.max(1, Math.min(240, Math.round(parsed))),
                    );
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-slate-200/80 px-2 py-1 dark:border-slate-700/80">
                  <span className="truncate">
                    <span className="font-medium">
                      {t("home.householdMapRouteStart")}:
                    </span>{" "}
                    {mapRouteOriginLabel}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={mapRoutePickOriginActive ? "default" : "outline"}
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => {
                      setMapRoutePickOriginActive((current) => !current);
                    }}
                    aria-label={
                      mapRoutePickOriginActive
                        ? t("home.householdMapRoutePickTargetActive")
                        : t("home.householdMapRoutePickOrigin")
                    }
                  >
                    <CircleDot className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-slate-200/80 px-2 py-1 dark:border-slate-700/80">
                  <span className="truncate">
                    <span className="font-medium">
                      {t("home.householdMapRouteTarget")}:
                    </span>{" "}
                    {mapRouteTargetLabel}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={mapRoutePickTargetActive ? "default" : "outline"}
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => {
                      setMapRoutePickTargetActive((current) => !current);
                    }}
                    aria-label={
                      mapRoutePickTargetActive
                        ? t("home.householdMapRoutePickTargetActive")
                        : t("home.householdMapRoutePickTarget")
                    }
                  >
                    <CircleDot className="h-3.5 w-3.5" />
                  </Button>
                </span>
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
                  {mapRouteLoading ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {!mapRouteLoading ? (
                    <span className="mr-1 text-sm leading-none">
                      {getTravelModeGlyph(mapTravelMode)}
                    </span>
                  ) : null}
                  {t("home.householdMapRouteRun")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    clearRoutePlanning();
                    setMapRoutePickOriginActive(false);
                    setMapRouteTarget(null);
                    setMapRoutePickTargetActive(false);
                  }}
                  disabled={mapRouteLoading && !mapRouteGeoJson}
                >
                  {t("home.householdMapRouteClear")}
                </Button>
              </div>
              {mapRouteError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {mapRouteError}
                </p>
              ) : null}
              {mapRouteSaveError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {mapRouteSaveError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <Dialog
          open={transitDialogStop !== null}
          onOpenChange={(open) => {
            if (!open) setTransitDialogStop(null);
          }}
        >
          <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {transitDialogStop?.name ??
                  t("home.householdMapMobilityLayerTransit")}
              </DialogTitle>
              <DialogDescription>
                {transitDialogStop?.distanceMeters !== null && transitDialogStop
                  ? t("home.householdMapMobilityDistance", {
                      meters: transitDialogStop.distanceMeters,
                    })
                  : t("home.householdMapMobilityLayerTransit")}
              </DialogDescription>
            </DialogHeader>
            {transitDialogStop ? (
              <div className="min-h-0 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {transitDialogDepartureGroups.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {t("home.householdMapMobilityTransitNoDepartures")}
                  </p>
                ) : (
                  transitDialogDepartureGroups.map((group) => {
                    return (
                      <div
                        key={`transit-dialog-group-${transitDialogStop.id}-${group.key}`}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                      >
                        <p className="font-medium">
                          {group.lineName}
                          {group.direction ? ` → ${group.direction}` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {group.departures.map((departure) => {
                            const departureAt =
                              departure.departureIso ?? departure.plannedIso;
                            return (
                              <span
                                key={`transit-dialog-time-${transitDialogStop.id}-${group.key}-${departure.id}`}
                                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                {departureAt
                                  ? formatTransitDepartureTimeLabel(
                                      departureAt,
                                      language,
                                    )
                                  : t("home.householdMapRouteInfoUnknownValue")}
                                {typeof departure.delaySeconds === "number" &&
                                departure.delaySeconds !== 0
                                  ? ` · ${departure.delaySeconds > 0 ? "+" : ""}${Math.round(departure.delaySeconds / 60)} min`
                                  : ""}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
                <div className="pt-1">
                  {renderOpenInMapsButton(
                    transitDialogStop.lat,
                    transitDialogStop.lon,
                  )}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
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
      mapRouteTooltipOpenToken,
      mapClosePopupRequestToken,
      mapRouteDistanceLabel,
      mapRouteLoading,
      mapRouteMaxMinutes,
      mapRouteModeLabel,
      mapRouteOrigin,
      mapRouteOriginLabel,
      mapRoutePanelOpen,
      mapRoutePickOriginActive,
      mapRoutePickTargetActive,
      mapRouteSaveError,
      mapRouteSaving,
      mapRouteSummary,
      mapRouteTarget,
      mapRouteTargetLabel,
      mapRouteDurationLabel,
      mapRouteAverageSpeedLabel,
      mapTravelMode,
      mapWeatherLayers,
      mapMobilityLayers,
      mapGeomanControlsOpen,
      dismissMapPanelsOnMapClick,
      mapReachabilityColor,
      mapReachabilityError,
      mapReachabilityFitRequestToken,
      mapReachabilityGeoJson,
      mapReachabilityLoading,
      mapReachabilityAreaLabel,
      mapReachabilityMinutes,
      mapReachabilityOrigin,
      mapReachabilityPickOriginActive,
      mapReachabilityPanelOpen,
      mapReachabilityRadiusLabel,
      mapReachabilitySaving,
      mapReachabilitySummary,
      bucketMapEntries,
      busy,
      mapSearchError,
      mapSearchInputFocused,
      mapSearchLoading,
      mapSearchQuery,
      mapSearchResults,
      mapSearchZoomRequest,
      handleMapZoomChange,
      memberOptionsForMarkerFilter,
      activePoiEditorId,
      isHouseholdOwner,
      renderOpenInMapsButton,
      renderMapPopupActions,
      mapMemberLabel,
      mapQuickPin,
      myLocationCenter,
      myLocationRecenterRequestToken,
      myLocationStatus,
      otherActiveLiveLocations,
      mapPoiDisplayEntries,
      transitDialogStop,
      transitDialogDepartureGroups,
      transitLiveStops,
      transitLiveQuery.isLoading,
      transitLiveQuery.isError,
      trafficLiveIncidents,
      trafficLiveQuery.isLoading,
      trafficLiveQuery.isError,
      hasGermanMapCenter,
      onGeomanMarkersChanged,
      onLocateControlError,
      onLocateControlFound,
      onLocateControlReady,
      onMeasuredWithGeoman,
      runRouteToTarget,
      saveRouteToHouseholdMarkers,
      saveReachabilityToHouseholdMarkers,
      createManualMarkerAtQuickPin,
      createManualMarkerAtCoordinates,
      clearMeasureResultAndLayer,
      clearReachability,
      clearRoutePlanning,
      cancelMapDeletion,
      confirmMapDeletion,
      applyMapSearchResult,
      onSaveExistingPoiOverride,
      onSavePoiOverride,
      openMarkerEdit,
      onToggleBucketDateVote,
      poiOverrideDrafts,
      poiOverrideMarkersByRef,
      poiOverrideSavingId,
      formatSuggestedDate,
      requestMyLocation,
      runReachability,
      runRoutePlanning,
      selectedPoiCategories.length,
      isHouseholdOwner,
      language,
      t,
      userId,
    ],
  );

  useEffect(() => {
    ensureLeafletMarkerIcon();
  }, []);

  useEffect(() => {
    return () => {
      if (myLocationFallbackTimerRef.current !== null) {
        window.clearTimeout(myLocationFallbackTimerRef.current);
        myLocationFallbackTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`whiteboard-online-${household.id}`, {
      config: { presence: { key: userId } },
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
        online_at: new Date().toISOString(),
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

  useEffect(
    () => () => {
      if (mapMarkerSaveTimerRef.current !== null) {
        window.clearTimeout(mapMarkerSaveTimerRef.current);
      }
      if (liveShareHeartbeatTimerRef.current !== null) {
        window.clearInterval(liveShareHeartbeatTimerRef.current);
      }
    },
    [],
  );

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
          const result = await geocodeAddressCandidate(
            query,
            controller.signal,
          );
          if (!result) return;
          if (!active) return;
          setAddressMapCenter([result.lat, result.lon]);
          setAddressMapLabel(result.label);
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
  useEffect(() => {
    const unresolved = bucketAddressCandidates.filter(
      (address) => !(address in bucketAddressGeocodes),
    );
    if (unresolved.length === 0) return;

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        const resolvedEntries = await Promise.all(
          unresolved.map(async (address) => {
            try {
              const result = await geocodeAddressCandidate(
                address,
                controller.signal,
              );
              return [address, result] as const;
            } catch {
              if (controller.signal.aborted) return [address, null] as const;
              return [address, null] as const;
            }
          }),
        );
        if (!active || controller.signal.aborted) return;
        setBucketAddressGeocodes((current) => {
          const next = { ...current };
          for (const [address, result] of resolvedEntries) {
            next[address] = result;
          }
          return next;
        });
      })();
    }, ADDRESS_GEOCODE_DEBOUNCE_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [bucketAddressCandidates, bucketAddressGeocodes]);
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
          accusative: t("common.youAccusative"),
        },
        fallbackLabel: t("common.memberFallback"),
      }),
    [members, t, userId],
  );
  const whiteboardOnlineMembers = useMemo(
    () =>
      members.filter((member) =>
        whiteboardOnlineUserIds.includes(member.user_id),
      ),
    [members, whiteboardOnlineUserIds],
  );
  const dueTasksCount = useMemo(() => {
    const now = Date.now();
    return tasks.filter(
      (task) =>
        task.is_active && !task.done && new Date(task.due_at).getTime() <= now,
    ).length;
  }, [tasks]);
  const dueTasksForYou = useMemo(() => {
    const now = Date.now();
    return tasks.filter(
      (task) =>
        task.is_active &&
        !task.done &&
        task.assignee_id === userId &&
        new Date(task.due_at).getTime() <= now,
    );
  }, [tasks, userId]);
  const openTasksCount = useMemo(
    () => tasks.filter((task) => task.is_active && !task.done).length,
    [tasks],
  );
  const lastCashAuditAt = useMemo(() => {
    if (cashAuditRequests.length === 0) return null;
    return (
      [...cashAuditRequests]
        .map((entry) => entry.created_at)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
      null
    );
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
    () =>
      calculateBalancesByMember(
        settlementEntries,
        members.map((entry) => entry.user_id),
      ),
    [members, settlementEntries],
  );
  const yourBalance = useMemo(
    () =>
      financeBalances.find((entry) => entry.memberId === userId)?.balance ?? 0,
    [financeBalances, userId],
  );
  const householdOpenBalance = useMemo(
    () =>
      financeBalances
        .filter((entry) => entry.balance > 0)
        .reduce((sum, entry) => sum + entry.balance, 0),
    [financeBalances],
  );
  const formatMoney = useMemo(
    () => (amount: number) =>
      new Intl.NumberFormat(language, {
        style: "currency",
        currency: household.currency || "EUR",
      }).format(amount),
    [household.currency, language],
  );
  const monthlyExpenseRows = useMemo(() => {
    const byMonth = new Map<
      string,
      { total: number; categories: Map<string, number> }
    >();
    financeEntries.forEach((entry) => {
      const day = entry.entry_date || entry.created_at.slice(0, 10);
      const month = day.slice(0, 7);
      const bucket = byMonth.get(month) ?? {
        total: 0,
        categories: new Map<string, number>(),
      };
      bucket.total += entry.amount;
      const currentCategoryTotal = bucket.categories.get(entry.category) ?? 0;
      bucket.categories.set(
        entry.category,
        currentCategoryTotal + entry.amount,
      );
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
    (memberId: string | null) =>
      memberId ? memberLabel(memberId) : t("common.memberFallback"),
    [memberLabel, t],
  );
  const calendarWeekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2026, 0, 5));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(language, { weekday: "short" }).format(
        new Date(monday.getTime() + index * 86400000),
      ),
    );
  }, [language]);
  const calendarMonthCells = useMemo(
    () => buildMonthGrid(calendarMonthDate),
    [calendarMonthDate],
  );
  const calendarMonthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }).format(calendarMonthDate),
    [calendarMonthDate, language],
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
      start: new Date(
        firstDate.getFullYear(),
        firstDate.getMonth(),
        firstDate.getDate(),
      ),
      end: new Date(
        lastDate.getFullYear(),
        lastDate.getMonth(),
        lastDate.getDate(),
      ),
    };
  }, [calendarMonthCells]);
  const visibleCalendarDayKeys = useMemo(
    () => new Set(calendarMonthCells.map((cell) => dayKey(cell.date))),
    [calendarMonthCells],
  );
  const calendarVacationRanges = useMemo<HomeCalendarVacationEntry[]>(() => {
    const ranges: HomeCalendarVacationEntry[] = [];
    memberVacations.forEach((vacation) => {
      ranges.push({
        id: vacation.id,
        userId: vacation.user_id,
        startDate: vacation.start_date,
        endDate: vacation.end_date,
        note: vacation.note ?? null,
      });
    });
    const vacationEvents = householdEvents
      .filter(
        (event) =>
          event.event_type === "vacation_mode_enabled" ||
          event.event_type === "vacation_mode_disabled",
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
        manual: true,
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
        manual: true,
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
        vacations: [],
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
      return /(?:\bputz|\breinig|\bclean|\bwisch|\bbad\b|\bkueche\b|\bküche\b|\bfenster\b|\bboden\b)/.test(
        normalized,
      );
    };
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
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
        const status = isOverdue
          ? "overdue"
          : dueKey === todayKey
            ? "due"
            : "upcoming";
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
            ensureEntry(nextKey).cleaningDueTasks.push({
              task,
              status: nextStatus,
            });
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
          at: entry.created_at,
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
    addDays,
  ]);
  const getCalendarCounts = useCallback(
    (entry: HomeCalendarEntry | undefined) => {
      const showCleaning = calendarFilters.cleaning && featureFlags.tasks;
      const showTasksCompleted =
        calendarFilters.tasksCompleted && featureFlags.tasks;
      const showFinances = calendarFilters.finances && featureFlags.finances;
      const showCashAudits =
        calendarFilters.cashAudits && featureFlags.finances;
      const showBucketVotes = calendarFilters.bucket && featureFlags.bucket;
      const showShopping = calendarFilters.shopping && featureFlags.shopping;
      const showVacations = calendarFilters.vacations;

      const cleaningDueTasks = showCleaning
        ? (entry?.cleaningDueTasks ?? [])
        : [];
      const cleaningCount = cleaningDueTasks.length;
      const criticalCleaningCount = cleaningDueTasks.filter(
        (taskEntry) => taskEntry.status !== "upcoming",
      ).length;
      const completionCount = showTasksCompleted
        ? (entry?.taskCompletions.length ?? 0)
        : 0;
      const financeCount = showFinances
        ? (entry?.financeEntries.length ?? 0)
        : 0;
      const cashAuditCount = showCashAudits
        ? (entry?.cashAudits.length ?? 0)
        : 0;
      const bucketCount = showBucketVotes
        ? (entry?.bucketVotes.length ?? 0)
        : 0;
      const shoppingCount = showShopping
        ? (entry?.shoppingEntries.length ?? 0)
        : 0;
      const vacationCount = showVacations ? (entry?.vacations.length ?? 0) : 0;
      const totalCount =
        cleaningCount +
        completionCount +
        financeCount +
        cashAuditCount +
        bucketCount +
        shoppingCount +
        vacationCount;

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
        showVacations,
      };
    },
    [calendarFilters, featureFlags],
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
      const rangeStart =
        start.getTime() < visibleStart.getTime() ? visibleStart : start;
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
    visibleCalendarDayKeys,
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
        rows: [] as Array<{
          memberId: string;
          score: number;
          completions: number;
        }>,
      };
    }

    const completionsByUser = new Map<string, number>();
    taskCompletions.forEach((entry) => {
      completionsByUser.set(
        entry.user_id,
        (completionsByUser.get(entry.user_id) ?? 0) + 1,
      );
    });
    const totalCompletions = memberIds.reduce(
      (sum, memberId) => sum + (completionsByUser.get(memberId) ?? 0),
      0,
    );
    const expected =
      totalCompletions > 0 ? totalCompletions / memberIds.length : 0;

    const rows = memberIds.map((memberId) => {
      const completions = completionsByUser.get(memberId) ?? 0;
      if (expected <= 0) {
        return { memberId, score: 100, completions };
      }
      const deviation = Math.abs(completions - expected) / expected;
      const score = Math.max(0, Math.round((1 - Math.min(1, deviation)) * 100));
      return { memberId, score, completions };
    });

    const overallScore =
      rows.length > 0
        ? Math.round(
            rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
          )
        : 100;
    return { overallScore, rows: rows.sort((a, b) => b.score - a.score) };
  }, [members, taskCompletions]);
  const taskReliability = useMemo(() => {
    const memberIds = [...new Set(members.map((entry) => entry.user_id))];
    if (memberIds.length === 0) {
      return {
        overallScore: 100,
        rows: [] as Array<{
          memberId: string;
          score: number;
          averageDelayMinutes: number;
        }>,
      };
    }

    const delaysByUser = new Map<string, { total: number; count: number }>();
    taskCompletions.forEach((entry) => {
      const current = delaysByUser.get(entry.user_id) ?? { total: 0, count: 0 };
      delaysByUser.set(entry.user_id, {
        total: current.total + Math.max(0, entry.delay_minutes ?? 0),
        count: current.count + 1,
      });
    });

    const rows = memberIds.map((memberId) => {
      const stats = delaysByUser.get(memberId) ?? { total: 0, count: 0 };
      const averageDelayMinutes =
        stats.count > 0 ? stats.total / stats.count : 0;
      return { memberId, averageDelayMinutes, score: 100 };
    });

    const maxAverageDelay = Math.max(
      0,
      ...rows.map((row) => row.averageDelayMinutes),
    );
    rows.forEach((row) => {
      if (maxAverageDelay <= 0) {
        row.score = 100;
      } else {
        const ratio = row.averageDelayMinutes / maxAverageDelay;
        row.score = Math.max(0, Math.round((1 - Math.min(1, ratio)) * 100));
      }
    });

    const overallScore =
      rows.length > 0
        ? Math.round(
            rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
          )
        : 100;
    return {
      overallScore,
      rows: rows.sort((a, b) => b.score - a.score),
    };
  }, [members, taskCompletions]);
  const lastMonthRange = useMemo(() => getLastMonthRange(), []);
  const memberOfMonth = useMemo(
    () => getMemberOfMonth(taskCompletions, lastMonthRange),
    [lastMonthRange, taskCompletions],
  );
  const memberOfMonthProfile = useMemo(
    () =>
      memberOfMonth
        ? (members.find((entry) => entry.user_id === memberOfMonth.userId) ??
          null)
        : null,
    [memberOfMonth, members],
  );
  const memberOfMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }).format(lastMonthRange.start),
    [language, lastMonthRange],
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
              task: String(payload.title ?? t("tasks.fallbackTitle")),
            }),
            navigateTo: "/tasks/overview",
          };
        }

        if (entry.event_type === "task_skipped") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
            text: t("home.activityTaskSkipped", {
              user: labelForUserId(entry.actor_user_id),
              task: String(payload.title ?? t("tasks.fallbackTitle")),
            }),
            navigateTo: "/tasks/overview",
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
              rating: String(payload.rating ?? ""),
            }),
            navigateTo: "/tasks/overview",
          };
        }

        if (entry.event_type === "shopping_completed") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "shopping",
            text: t("home.activityShoppingCompleted", {
              item: String(payload.title ?? ""),
              user: labelForUserId(entry.actor_user_id),
            }),
          };
        }

        if (entry.event_type === "finance_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityFinanceCreated", {
              name: String(payload.description ?? ""),
              amount: Number(payload.amount ?? 0).toFixed(2),
            }),
          };
        }

        if (entry.event_type === "cash_audit_requested") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityCashAudit", {
              user: labelForUserId(entry.actor_user_id),
            }),
          };
        }

        if (entry.event_type === "admin_hint") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: String(
              payload.message ?? t("home.activityAdminHintFallback"),
            ),
          };
        }

        if (entry.event_type === "pimpers_reset") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityPimpersReset", {
              user: labelForUserId(entry.actor_user_id),
              total: Number(payload.total_reset ?? 0),
            }),
          };
        }

        if (entry.event_type === "vacation_mode_enabled") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityVacationEnabled", {
              user: labelForUserId(entry.actor_user_id),
            }),
          };
        }

        if (entry.event_type === "vacation_mode_disabled") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityVacationDisabled", {
              user: labelForUserId(entry.actor_user_id),
            }),
          };
        }

        if (entry.event_type === "rent_updated") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityRentUpdated", {
              user: labelForUserId(entry.actor_user_id),
            }),
          };
        }

        if (entry.event_type === "contract_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityContractCreated", {
              name: String(
                payload.contractName ?? t("finances.subscriptionListTitle"),
              ),
            }),
          };
        }

        if (entry.event_type === "contract_updated") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityContractUpdated", {
              name: String(
                payload.contractName ?? t("finances.subscriptionListTitle"),
              ),
            }),
          };
        }

        if (entry.event_type === "contract_deleted") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "finance",
            text: t("home.activityContractDeleted", {
              name: String(
                payload.contractName ?? t("finances.subscriptionListTitle"),
              ),
            }),
          };
        }

        if (entry.event_type === "member_joined") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityMemberJoined", {
              user: labelForUserId(
                entry.subject_user_id ?? entry.actor_user_id,
              ),
            }),
          };
        }

        if (entry.event_type === "member_left") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityMemberLeft", {
              user: labelForUserId(
                entry.subject_user_id ?? entry.actor_user_id,
              ),
            }),
          };
        }

        if (entry.event_type === "live_location_started") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "audit",
            text: t("home.activityLiveLocationStarted", {
              user: labelForUserId(entry.actor_user_id),
              minutes: Number(payload.durationMinutes ?? 0),
            }),
            navigateTo: "/home/summary",
          };
        }

        if (entry.event_type === "one_off_claim_created") {
          return {
            id: `event-${entry.id}`,
            at: entry.created_at,
            icon: "task",
            text: t("tasks.oneOffTaskRequestedBy", {
              user: labelForUserId(entry.actor_user_id),
            }),
            navigateTo: "/tasks/overview",
          };
        }

        return {
          id: `event-${entry.id}`,
          at: entry.created_at,
          icon: "audit",
          text: t("home.activityRoleChanged", {
            user: labelForUserId(entry.subject_user_id),
            role: String(payload.nextRole ?? ""),
          }),
        };
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [householdEvents, labelForUserId, t]);
  const markdownComponents=useMarkdownComponents()
  const landingContentSegments = useMemo(
    () => splitLandingContentSegments(effectiveMarkdown),
    [effectiveMarkdown],
  );
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
  const showSummaryCalendarCard =
    !landingWidgetKeySet.has("household-calendar");
  const showSummaryWhiteboardCard = !landingWidgetKeySet.has(
    "household-whiteboard",
  );
  const showSummaryMapCard =
    hasHouseholdAddress && !landingWidgetKeySet.has("household-map");
  const weatherProviderProps = useMemo(
    () => ({
      householdId: household.id,
      address: household.address ?? "",
      language,
    }),
    [household.address, household.id, language],
  );

  const renderHouseholdCalendarCard = (
    withTopMargin: boolean,
    showTitle: boolean,
  ) => (
    <Card
      className={`${withTopMargin ? "mt-6 " : ""}rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100`}
    >
      <HouseholdCalendarWidget
        title={
          showTitle ? (
            t("home.calendarTitle")
          ) : (
            <span className="sr-only">{t("home.calendarTitle")}</span>
          )
        }
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
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
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
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
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
                  checked={calendarFilters.tasksCompleted && featureFlags.tasks}
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
                  checked={calendarFilters.finances && featureFlags.finances}
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
                  checked={calendarFilters.cashAudits && featureFlags.finances}
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
                  checked={calendarFilters.shopping && featureFlags.shopping}
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
              const showVacationSpans =
                calendarFilters.vacations && vacationSpans.length > 0;
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
                        <span className="inline-flex items-center justify-center">
                          <StaticWeatherCalendarIcon date={cellDayKey} />
                        </span>
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
                              {renderDenseStack(financeCount, "bg-amber-500")}
                              {renderDenseStack(cashAuditCount, "bg-slate-500")}
                              {renderDenseStack(bucketCount, "bg-indigo-500")}
                              {renderDenseStack(shoppingCount, "bg-cyan-500")}
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
                                    span.manual
                                      ? "bg-violet-400"
                                      : "bg-violet-500"
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
                        date: formatShortDay(cellDayKey, language, cellDayKey),
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
                                  {labelForUserId(taskEntry.task.assignee_id)}
                                </li>
                              ))}
                          </ul>
                          {cleaningCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {t("home.calendarMore", {
                                count:
                                  cleaningCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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
                          {completionCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {t("home.calendarMore", {
                                count:
                                  completionCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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
                                  financeCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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
                                    user: labelForUserId(audit.requested_by),
                                  })}
                                </li>
                              ))}
                          </ul>
                          {cashAuditCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {t("home.calendarMore", {
                                count:
                                  cashAuditCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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
                                    {formatDateOnly(
                                      vacation.startDate,
                                      language,
                                      vacation.startDate,
                                    )}{" "}
                                    –{" "}
                                    {formatDateOnly(
                                      vacation.endDate,
                                      language,
                                      vacation.endDate,
                                    )}
                                  </span>
                                  {vacation.note ? ` · ${vacation.note}` : ""}
                                </li>
                              ))}
                          </ul>
                          {vacationCount > MAX_CALENDAR_TOOLTIP_ITEMS ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {t("home.calendarMore", {
                                count:
                                  vacationCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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
                                  shoppingCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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
                                count: bucketCount - MAX_CALENDAR_TOOLTIP_ITEMS,
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

    const bucketShortList = useMemo(
      () =>
        bucketItems
          .filter((entry) => !entry.done)
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
          .slice(0, 5),
      [bucketItems],
    );

      const openBucketItemsCount = useMemo(
        () => bucketItems.filter((entry) => !entry.done).length,
        [bucketItems],
      );

  const renderLandingWidget = useCallback(
    (key: LandingWidgetKey) => {
      if (key === "tasks-overview") {
        if (!featureFlags.tasks) return null;
        return (
          <button
            type="button"
            className="w-full rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-left transition hover:bg-brand-100/70 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            onClick={() => void navigate({ to: "/tasks/overview" })}
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetTasksDue")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {dueTasksCount}
            </p>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetTasksForYou")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {dueTasksForYou.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetTasksForYouHint")}
            </p>
            {dueTasksForYou.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {dueTasksForYou.slice(0, 3).map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1 dark:bg-slate-950/60"
                  >
                    <span className="truncate text-xs text-slate-600 dark:text-slate-300">
                      {task.title}
                    </span>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetYourBalance")}
            </p>
            <p
              className={`mt-1 text-lg font-semibold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
            >
              {formatMoney(yourBalance)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetBalanceSinceAudit")}
            </p>
          </button>
        );
      }

      if (key === "household-balance") {
        if (!featureFlags.finances) return null;
        return (
          <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetHouseholdBalance")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {formatMoney(householdOpenBalance)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetHouseholdBalanceHint")}
            </p>
          </div>
        );
      }

      if (key === "recent-activity") {
        return (
          <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t("home.widgetRecentActivity")}
            </p>
            {recentActivity.length > 0 ? (
              <ul className="space-y-1">
                {recentActivity.slice(0, 4).map((entry) => (
                  <li
                    key={entry.id}
                    className="truncate text-xs text-slate-600 dark:text-slate-300"
                  >
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("home.activityEmpty")}
              </p>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetBucketShortList")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {openBucketItemsCount}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetBucketShortListHint")}
            </p>
            {bucketShortList.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {bucketShortList.map((entry) => (
                  <li
                    key={entry.id}
                    className="truncate text-xs text-slate-600 dark:text-slate-300"
                  >
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetMemberOfMonth")}
            </p>
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
                          memberOfMonthProfile?.display_name,
                        ),
                        memberOfMonthProfile?.user_color,
                      )
                    }
                    alt={memberLabel(memberOfMonth.userId)}
                    isVacation={
                      memberOfMonthProfile
                        ? isMemberOnVacation(
                            memberOfMonthProfile.user_id,
                            memberVacations,
                            todayIso,
                            memberOfMonthProfile.vacation_mode,
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
                      {t("tasks.pimpersValue", {
                        count: memberOfMonth.totalPimpers,
                      })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("home.widgetMemberOfMonthDelay", {
                    minutes: Math.round(memberOfMonth.averageDelayMinutes),
                  })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t("home.widgetMemberOfMonthEmpty")}
              </p>
            )}
          </div>
        );
      }

      if (key === "fairness-score") {
        if (!featureFlags.tasks) return null;
        return (
          <div className="rounded-xl border border-brand-100 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetFairness")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {taskFairness.overallScore} / 100
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetFairnessHint")}
            </p>
          </div>
        );
      }

      if (key === "reliability-score") {
        if (!featureFlags.tasks) return null;
        return (
          <div className="rounded-xl border border-brand-100 bg-emerald-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetReliability")}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {taskReliability.overallScore} / 100
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("home.widgetReliabilityHint")}
            </p>
          </div>
        );
      }

      if (key === "expenses-by-month") {
        if (!featureFlags.finances) return null;
        return monthlyExpenseRows.length > 0 ? (
          <div className="rounded-xl border border-brand-100 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t("home.widgetExpensesByMonth")}
            </p>
            <ul className="space-y-2">
              {monthlyExpenseRows.map((entry) => (
                <li
                  key={entry.month}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-slate-700 dark:text-slate-300">
                      {entry.month}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {entry.categories
                        .map(
                          (categoryRow) =>
                            `${categoryRow.category}: ${categoryRow.value.toFixed(2)} €`,
                        )
                        .join(" • ")}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {entry.total.toFixed(2)} €
                  </span>
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
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t("home.widgetFairnessByMember")}
            </p>
            <ul className="space-y-2">
              {taskFairness.rows.map((row) => (
                <li key={row.memberId} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">
                      {memberLabel(row.memberId)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {row.score} / 100 · {row.completions}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-1.5 rounded-full bg-brand-500"
                      style={{ width: `${row.score}%` }}
                    />
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
                    <span className="text-slate-700 dark:text-slate-300">
                      {memberLabel(row.memberId)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {row.score} / 100 · {Math.round(row.averageDelayMinutes)}m
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500"
                      style={{ width: `${row.score}%` }}
                    />
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
        return (
          <WeatherDailyForecast
            dayLimit={4}
            getWindDirectionLabel={getWindDirectionLabel}
          />
        );
      }

      if (key === "household-weather-plot") {
        return <WeatherForecastGraph isMobile={isMobileBucketComposer} />;
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
              <div className="flex h-[280px] items-center justify-center rounded-xl border border-brand-100 bg-white/70 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
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
                height={280}
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
              false,
            )}
          </div>
        );
      }

      return null;
    },
    [
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
      memberVacations,
      todayIso,
      navigate,
      busy,
      isMobileBucketComposer,
      openMapFullscreen,
      openWhiteboardFullscreen,
      renderHouseholdCalendarCard,
      renderHouseholdMapSurface,
      t,
      whiteboardDraft,
    ],
  );
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
                setMarkdownDraft((previous) =>
                  moveWidgetInMarkdown(
                    previous,
                    sourceWidgetIndex,
                    targetWidgetIndex,
                  ),
                );
              }}
              onInsertTextBefore={() => {
                setMarkdownDraft((previous) => {
                  const nextValue = insertTextAroundWidget(
                    previous,
                    widgetOrder,
                    "before",
                    insertTextPlaceholder,
                  );
                  landingEditorRef.current?.setMarkdown(
                    convertLandingTokensToEditorJsx(nextValue),
                  );
                  return nextValue;
                });
              }}
              onInsertTextAfter={() => {
                setMarkdownDraft((previous) => {
                  const nextValue = insertTextAroundWidget(
                    previous,
                    widgetOrder,
                    "after",
                    insertTextPlaceholder,
                  );
                  landingEditorRef.current?.setMarkdown(
                    convertLandingTokensToEditorJsx(nextValue),
                  );
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
          Editor: DescriptorEditor,
        };
      }),
    [
      insertTextAfterLabel,
      insertTextBeforeLabel,
      insertTextPlaceholder,
      renderLandingWidget,
      t,
    ],
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
      return (
        <Loader2 className="h-4 w-4 animate-spin text-brand-600 dark:text-brand-300" />
      );
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
    setMarkdownDraft(
      getEffectiveLandingMarkdown(
        getSavedLandingMarkdown(household.landing_page_markdown),
        defaultLandingMarkdown,
      ),
    );
    setIsEditingLanding(false);
  }, [defaultLandingMarkdown, household.id, household.landing_page_markdown]);
  useEffect(() => {
    setWhiteboardDraft(whiteboardSceneJson);
    lastSavedWhiteboardRef.current = whiteboardSceneJson;
    setWhiteboardStatus("idle");
    setWhiteboardError(null);
  }, [household.id, whiteboardSceneJson]);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsCalendarCoarsePointer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
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
          await onUpdateHouseholdWhiteboard(whiteboardDraft);
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
  }, [onUpdateHouseholdWhiteboard, t, whiteboardDraft]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const onChange = (event: MediaQueryListEvent) =>
      setIsMobileBucketComposer(event.matches);
    setIsMobileBucketComposer(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const container = headerSwiperRef.current;
    if (!container) return;

    const markActive = () => {
      headerLastInteractionAtRef.current = Date.now();
    };
    const syncIndexFromScroll = () => {
      const width = container.clientWidth;
      if (width <= 0) return;
      const nextIndex = Math.round(container.scrollLeft / width) === 0 ? 0 : 1;
      setHeaderSlideIndex(nextIndex);
      markActive();
    };

    container.addEventListener("pointerdown", markActive, { passive: true });
    container.addEventListener("wheel", markActive, { passive: true });
    container.addEventListener("touchstart", markActive, { passive: true });
    container.addEventListener("scroll", syncIndexFromScroll, { passive: true });

    const interval = window.setInterval(() => {
      if (Date.now() - headerLastInteractionAtRef.current < 10000) return;
      const nextIndex = headerSlideIndex === 0 ? 1 : 0;
      const targetLeft = nextIndex * container.clientWidth;
      container.scrollTo({ left: targetLeft, behavior: "smooth" });
      setHeaderSlideIndex(nextIndex);
      headerLastInteractionAtRef.current = Date.now();
    }, 1000);

    return () => {
      window.clearInterval(interval);
      container.removeEventListener("pointerdown", markActive);
      container.removeEventListener("wheel", markActive);
      container.removeEventListener("touchstart", markActive);
      container.removeEventListener("scroll", syncIndexFromScroll);
    };
  }, [headerSlideIndex]);

  return (
    <WeatherProvider {...weatherProviderProps}>
      <div className="space-y-4">
        {showSummary ? (
          <div className="relative z-0 isolate">
            <div className="relative z-0 overflow-hidden rounded-xl border border-brand-100 dark:border-slate-700">
              <div
                ref={headerSwiperRef}
                className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="min-h-34 sm:min-h-56  min-w-full snap-center">
                  <div
                    className="h-full min-h-34 sm:min-h-56 bg-cover bg-center"
                    style={{ backgroundImage: bannerBackgroundImage }}
                  />
                </div>
                <div className="min-h-34 sm:min-h-56 min-w-full snap-center ">
                  {showSummaryMapCard ? (
                    <div className="h-full min-h-34 sm:min-h-56 bg-white/90 text-slate-800 dark:bg-slate-800/60 dark:text-slate-100">
                      {renderHouseholdMapSurface(
                        "relative h-40 overflow-hidden rounded-lg border border-brand-100 dark:border-slate-700",
                        false,
                      )}
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
                    </div>
                  ) : (
                    <div
                      className="h-full min-h-34 sm:min-h-56 bg-cover bg-center"
                      style={{ backgroundImage: bannerBackgroundImage }}
                    />
                  )}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 z-[1900] bg-gradient-to-r from-slate-900/45 via-slate-900/25 to-slate-900/55" />
              <div className="pointer-events-none absolute inset-0 z-[2000]">
                <div className="pointer-events-auto absolute right-4 top-4">
                  <WeatherTodayIcon
                    onOpenFullscreen={() => setIsWeatherFullscreenOpen(true)}
                    title={householdWeatherTitle}
                  />
                </div>
                <div className="absolute bottom-4 left-4 right-4 min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-white/80 [text-shadow:0_2px_8px_rgba(0,0,0,0.65)]">
                    {userLabel ?? t("app.noUserLabel")}
                  </p>
                  <h1 className="mt-1 truncate text-2xl font-semibold text-white [text-shadow:0_3px_12px_rgba(0,0,0,0.75)] sm:text-3xl">
                    {household.name}
                  </h1>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showSummary ? (
          <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
            <CardContent className="relative">
              {households.length > 1 ? (
                <div className="mb-4 sm:max-w-[280px]">
                  <Select
                    value={household.id}
                    onValueChange={onSelectHousehold}
                  >
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
                        await onUpdateHomeMarkdown(markdownDraft);
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

        {showBucket ? <BucketList bucketItems={bucketItems} /> : null}

        {showFeed ? (
          <>
            {showSummaryCalendarCard
              ? renderHouseholdCalendarCard(false, true)
              : null}
            <Card className="rounded-xl border border-slate-300 bg-white/88 p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 mb-4">
              <CardHeader>
                <CardTitle>{t("home.activityTitle")}</CardTitle>
                <CardDescription>
                  {t("home.activityDescription")}
                </CardDescription>
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
          </>
        ) : null}

        {showSummary ? (
          <>
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
                        <div className="flex h-[280px] items-center justify-center rounded-xl border border-brand-100 bg-white/70 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
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
                          height={280}
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

            <div className="mt-6">
              <FileExplorer household={household} />
            </div>

            <Dialog
              open={isWeatherFullscreenOpen}
              onOpenChange={(open) => {
                setIsWeatherFullscreenOpen(open);
              }}
            >
              <DialogContent className="inset-0 left-0 top-0 flex h-[100dvh] w-[100vw] max-w-none -translate-x-0 -translate-y-0 flex-col overflow-hidden rounded-none border-0 p-0 [padding-bottom:var(--safe-area-bottom)] [padding-left:var(--safe-area-left)] [padding-right:var(--safe-area-right)] [padding-top:var(--safe-area-top)]">
                <div className="flex flex-1 flex-col bg-slate-50 dark:bg-slate-950">
                  <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="min-w-0">
                      <DialogTitle className="truncate">
                        {householdWeatherTitle}
                      </DialogTitle>
                      <DialogDescription>
                        {t("home.householdWeatherDescription")}
                      </DialogDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                      onClick={() => setIsWeatherFullscreenOpen(false)}
                      aria-label={t("common.close")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <WeatherPanelContent
                      // dayLimit={dayLimit}
                      getWindDirectionLabel={getWindDirectionLabel}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>

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
                    <Label>
                      {t("home.householdMapLiveShareDurationLabel")}
                    </Label>
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
                            {t("home.householdMapLiveShareMinutes", {
                              minutes,
                            })}
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
              <DialogTitle>
                {t("home.householdMapDeleteConfirmTitle")}
              </DialogTitle>
              <DialogDescription>
                {mapDeleteConfirm &&
                mapDeleteConfirm.removedMarkers.length === 1
                  ? t("home.householdMapDeleteConfirmDescriptionOne")
                  : t("home.householdMapDeleteConfirmDescriptionMany", {
                      count: mapDeleteConfirm?.removedMarkers.length ?? 0,
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
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelMapDeletion();
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  confirmMapDeletion();
                }}
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
                <Label>{t("home.householdMapMarkerColorLabel")}</Label>
                <Input
                  type="color"
                  value={normalizeMarkerColor(editingMarkerDraft?.color)}
                  onChange={(event) =>
                    setEditingMarkerDraft((current) =>
                      current
                        ? {
                            ...current,
                            color: normalizeMarkerColor(event.target.value),
                          }
                        : current,
                    )
                  }
                  disabled={editingMarkerSaving}
                  className="h-10 w-16 p-1"
                />
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
                  placeholder={t(
                    "home.householdMapMarkerDescriptionPlaceholder",
                  )}
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
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
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
    </WeatherProvider>
  );
};
