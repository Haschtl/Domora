import type { ReachabilityTravelMode } from "../../../lib/api";
import type { HouseholdMapMarkerIcon, PoiCategory } from "../../../lib/types";

export type MapStyleId = "street" | "nature" | "satellite" | "light" | "dark";

export type MapStyleOption = {
  id: MapStyleId;
  labelKey: string;
  tileUrl: string;
  attribution: string;
  subdomains?: string;
  maxZoom?: number;
};

export type MapWeatherLayerToggles = {
  radar: boolean;
  warnings: boolean;
  lightning: boolean;
};

export type MapMobilityLayerToggles = {
  transitLive: boolean;
  bikeNetwork: boolean;
  trafficLive: boolean;
};

export type ManualMarkerFilterMode = "all" | "mine" | "member" | "none";
export type MapMeasureMode = "smart";

export type MapMeasureResult = {
  mode: "distance" | "area";
  distanceMeters?: number;
  areaSqm?: number;
  anchor?: [number, number];
};

export type MapReachabilityMode = ReachabilityTravelMode;

export type MapSearchViewportBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type MapSearchResult = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  bounds: MapSearchViewportBounds | null;
};

export type MapSearchZoomRequest = {
  token: number;
  lat: number;
  lon: number;
  bounds: MapSearchViewportBounds | null;
};

export const DEFAULT_MAP_CENTER: [number, number] = [51.1657, 10.4515];
export const MAP_ZOOM_WITH_ADDRESS = 16;
export const MAP_ZOOM_WITH_ADDRESS_FALLBACK = 14;
export const MAP_ZOOM_DEFAULT = 5;
export const MIN_ADDRESS_LENGTH_FOR_GEOCODE = 5;
export const ADDRESS_GEOCODE_DEBOUNCE_MS = 650;
export const GEOCODE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const GEOCODE_NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
export const POI_RADIUS_METERS = 1500;
export const POI_CLUSTER_MIN_ZOOM = 16;
export const POI_CLUSTER_GRID_PX_LOW_ZOOM = 64;
export const POI_CLUSTER_GRID_PX_HIGH_ZOOM = 52;

export const POI_CATEGORY_OPTIONS: Array<{ id: PoiCategory; labelKey: string; emoji: string }> = [
  { id: "restaurant", labelKey: "home.householdMapPoiRestaurants", emoji: "🍽️" },
  { id: "shop", labelKey: "home.householdMapPoiShops", emoji: "🛍️" },
  { id: "supermarket", labelKey: "home.householdMapPoiSupermarkets", emoji: "🛒" },
  { id: "fuel", labelKey: "home.householdMapPoiFuel", emoji: "⛽" }
];

export const DEFAULT_MANUAL_MARKER_COLOR = "#0f766e";
export const MARKER_COLOR_HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const MANUAL_MARKER_ICON_OPTIONS: Array<{ id: HouseholdMapMarkerIcon; labelKey: string }> = [
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

export const LIVE_LOCATION_DURATION_OPTIONS = [5, 15, 30, 60] as const;
export const REACHABILITY_MINUTES_DEFAULT = 20;
export const MAP_SETTINGS_STORAGE_KEY_PREFIX = "domora:home-map-settings:v1";
export const TRANSIT_LAYER_RADIUS_METERS = 1500;
export const TRANSIT_LAYER_STOP_LIMIT = 10;
export const TRANSIT_LAYER_DEPARTURE_LIMIT = 3;
export const TRANSIT_LAYER_REFRESH_MS = 60 * 1000;
export const TRANSIT_LAYER_FETCH_RETRIES = 2;
export const TRANSIT_LAYER_FETCH_BACKOFF_MS = 450;
export const TRAFFIC_LAYER_CACHE_TTL_MS = 5 * 60 * 1000;
export const TRAFFIC_LAYER_REFRESH_MS = 3 * 60 * 1000;
export const TRAFFIC_LAYER_MAX_ROADS_PER_CYCLE = 200;
export const TRAFFIC_LAYER_FETCH_CONCURRENCY = 8;
export const TRAFFIC_LAYER_MAX_INCIDENTS = 120;

export const BIKE_NETWORK_TILE_URL = "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png";
export const BIKE_NETWORK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, style <a href="https://cyclosm.org/">CyclOSM</a>';

export const REACHABILITY_OPTIONS: Array<{ id: MapReachabilityMode; labelKey: string }> = [
  { id: "walk", labelKey: "home.householdMapReachabilityModeWalk" },
  { id: "bike", labelKey: "home.householdMapReachabilityModeBike" },
  { id: "car", labelKey: "home.householdMapReachabilityModeCar" },
  { id: "transit", labelKey: "home.householdMapReachabilityModeTransit" }
];

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
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

export type PersistedMapSettings = {
  mapStyle: MapStyleId;
  mapTravelMode: MapReachabilityMode;
  mapWeatherLayers: MapWeatherLayerToggles;
  mapMobilityLayers: MapMobilityLayerToggles;
  manualMarkerFilterMode: ManualMarkerFilterMode;
  manualMarkerFilterMemberId: string;
  poiCategoriesEnabled: Record<PoiCategory, boolean>;
};

export const canUseLocalStorage = () => typeof window !== "undefined" && "localStorage" in window;

export const getMapSettingsStorageKey = (householdId: string) =>
  `${MAP_SETTINGS_STORAGE_KEY_PREFIX}:${householdId}`;

export const readPersistedMapSettings = (householdId: string): Partial<PersistedMapSettings> | null => {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(getMapSettingsStorageKey(householdId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedMapSettings>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const writePersistedMapSettings = (householdId: string, value: PersistedMapSettings) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(getMapSettingsStorageKey(householdId), JSON.stringify(value));
  } catch {
    // ignore quota/storage errors
  }
};
