import L from "leaflet";
import type { HouseholdMapMarker, HouseholdMapMarkerIcon } from "../../../lib/types";
import { DEFAULT_MANUAL_MARKER_COLOR, MARKER_COLOR_HEX_PATTERN } from "./map";

export type DomoraLeafletLayer = L.Layer & {
  _domoraMeta?: HouseholdMapMarker;
  _domoraMeasure?: boolean;
};

export type LocateControlHandle = L.Control & {
  start: () => void;
  stop: () => void;
};

export type MapWithPm = L.Map & {
  pm?: {
    addControls: (options: Record<string, unknown>) => void;
    removeControls: () => void;
    setGlobalOptions: (options: Record<string, unknown>) => void;
    enableDraw: (shape: "Line" | "Polygon", options?: Record<string, unknown>) => void;
    disableDraw: () => void;
  };
};

export const toLinearLatLngs = (latLngs: L.LatLng[] | L.LatLng[][]) =>
  Array.isArray(latLngs[0]) ? (latLngs as L.LatLng[][]).flat() : (latLngs as L.LatLng[]);

export const calculatePolylineDistanceMeters = (map: L.Map, points: L.LatLng[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (!prev || !next) continue;
    total += map.distance(prev, next);
  }
  return total;
};

export const calculatePolygonAreaSqm = (points: L.LatLng[]) => {
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

export const calculatePolylineDistanceMetersFromLatLngs = (points: L.LatLng[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (!prev || !next) continue;
    total += prev.distanceTo(next);
  }
  return total;
};

export const isClosedVectorPath = (points: L.LatLng[], thresholdMeters = 30) => {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return false;
  return first.distanceTo(last) <= thresholdMeters;
};

export const formatDistanceShort = (meters: number) => {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
};

export const formatAreaShort = (sqm: number) => {
  if (!Number.isFinite(sqm) || sqm <= 0) return "0 m²";
  if (sqm >= 1_000_000) return `${(sqm / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(sqm)} m²`;
};

export const formatDistanceCompact = (meters: number) => {
  if (!Number.isFinite(meters) || meters <= 0) return "0m";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)}km`;
  return `${Math.round(meters)}m`;
};

export const toFixedCoordinate = (value: number) => Number(value.toFixed(6));
export const toFixedRadius = (value: number) => Number(value.toFixed(2));
export const createMarkerId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `marker:${crypto.randomUUID()}`;
  }
  return `marker:${Date.now()}:${Math.floor(Math.random() * 100_000)}`;
};

export const dedupeHouseholdMarkers = (markers: HouseholdMapMarker[]) => {
  const byId = new Map<string, HouseholdMapMarker>();
  for (const marker of markers) {
    byId.set(marker.id, marker);
  }
  return Array.from(byId.values());
};

export const normalizeMarkerColor = (value: string | null | undefined) => {
  if (typeof value !== "string") return DEFAULT_MANUAL_MARKER_COLOR;
  const trimmed = value.trim();
  if (!MARKER_COLOR_HEX_PATTERN.test(trimmed)) return DEFAULT_MANUAL_MARKER_COLOR;
  return trimmed.toLowerCase();
};

export const serializeHouseholdLayer = (
  layer: DomoraLeafletLayer,
  userId: string,
  defaultTitle: string
): HouseholdMapMarker | null => {
  const nowIso = new Date().toISOString();
  const existing = layer._domoraMeta;
  const base = {
    id: existing?.id ?? createMarkerId(),
    icon: existing?.icon ?? ("star" as HouseholdMapMarkerIcon),
    color: normalizeMarkerColor(existing?.color),
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

