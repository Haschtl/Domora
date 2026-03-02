import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { HouseholdMapMarker, HouseholdMapMarkerIcon } from "../../../lib/types";
import {
  DEFAULT_MANUAL_MARKER_COLOR,
  MAP_ZOOM_WITH_ADDRESS,
  type MapMeasureMode,
  type MapMeasureResult,
  type MapSearchViewportBounds,
  type MapSearchZoomRequest
} from "./map";
import {
  type DomoraLeafletLayer,
  type LocateControlHandle,
  type MapWithPm,
  calculatePolygonAreaSqm,
  calculatePolylineDistanceMeters,
  createMarkerId,
  dedupeHouseholdMarkers,
  serializeHouseholdLayer,
  toLinearLatLngs
} from "./map-geometry";

export type { DomoraLeafletLayer, LocateControlHandle, MapWithPm } from "./map-geometry";
export {
  toLinearLatLngs,
  calculatePolylineDistanceMeters,
  calculatePolygonAreaSqm,
  calculatePolylineDistanceMetersFromLatLngs,
  isClosedVectorPath,
  formatDistanceShort,
  formatAreaShort,
  formatDistanceCompact,
  toFixedCoordinate,
  toFixedRadius,
  createMarkerId,
  dedupeHouseholdMarkers,
  normalizeMarkerColor,
  serializeHouseholdLayer
} from "./map-geometry";

export const GeomanEditorBridge = ({
  enabled,
  suppressCreate,
  userId,
  defaultTitle,
  onMarkersChange,
  resolveMarkerIcon
}: {
  enabled: boolean;
  suppressCreate: boolean;
  userId: string;
  defaultTitle: string;
  onMarkersChange: (markers: HouseholdMapMarker[]) => void;
  resolveMarkerIcon: (icon: HouseholdMapMarkerIcon, color?: string | null) => L.Icon | L.DivIcon;
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
        const domoraLayer = layer as DomoraLeafletLayer & {
          _pmTempLayer?: boolean;
          _pmHelperLayer?: boolean;
        };
        if (domoraLayer._pmTempLayer || domoraLayer._pmHelperLayer) return;
        if (!domoraLayer._domoraMeta) return;
        const serialized = serializeHouseholdLayer(domoraLayer, userId, defaultTitle);
        if (serialized) nextMarkers.push(serialized);
      });
      onMarkersChange(dedupeHouseholdMarkers(nextMarkers));
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
          color: DEFAULT_MANUAL_MARKER_COLOR,
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
        markerLayer.setIcon(
          resolveMarkerIcon(
            markerLayer._domoraMeta?.icon ?? "star",
            markerLayer._domoraMeta?.color
          )
        );
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
  }, [defaultTitle, enabled, map, onMarkersChange, resolveMarkerIcon, suppressCreate, userId]);

  return null;
};

export const LocateControlBridge = ({
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

export const GeomanMeasureBridge = ({
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

    mapWithPm.pm.enableDraw("Line", {
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

      if (currentMode === "smart" && createdLayer instanceof L.Polyline) {
        const points = toLinearLatLngs(createdLayer.getLatLngs() as L.LatLng[] | L.LatLng[][]);
        const first = points.length > 0 ? points[0] : undefined;
        const last = points.length > 0 ? points[points.length - 1] : undefined;
        const hasRepeatedClosingPoint =
          Boolean(first && last && first.lat === last.lat && first.lng === last.lng);
        const closeDistanceMeters =
          first && last ? map.distance(first, last) : Number.POSITIVE_INFINITY;
        const closeDistancePixels =
          first && last
            ? map.latLngToContainerPoint(first).distanceTo(map.latLngToContainerPoint(last))
            : Number.POSITIVE_INFINITY;
        const isClosedShape =
          Boolean(first && last && points.length >= 3)
          && Boolean(
            hasRepeatedClosingPoint
            || closeDistanceMeters <= 25
            || closeDistancePixels <= 18
          );

        if (isClosedShape) {
          const polygonPoints = hasRepeatedClosingPoint ? points.slice(0, -1) : points;
          const polygonLayer = L.polygon(polygonPoints, {
            color: "#0f766e",
            weight: 4,
            fillColor: "#14b8a6",
            fillOpacity: 0.18
          }) as DomoraLeafletLayer;
          polygonLayer._domoraMeasure = true;
          map.removeLayer(createdLayer);
          polygonLayer.addTo(map);
          lastLayerRef.current = polygonLayer;

          const anchorLatLng =
            polygonPoints.length > 0
              ? polygonPoints[polygonPoints.length - 1]
              : undefined;
          onMeasured({
            mode: "area",
            areaSqm: calculatePolygonAreaSqm(polygonPoints),
            anchor: anchorLatLng ? [anchorLatLng.lat, anchorLatLng.lng] : undefined
          });
        } else {
          const lastPoint = points.length > 0 ? points[points.length - 1] : undefined;
          onMeasured({
            mode: "distance",
            distanceMeters: calculatePolylineDistanceMeters(map, points),
            anchor: lastPoint ? [lastPoint.lat, lastPoint.lng] : undefined
          });
        }
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

export const AddressMapView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    const current = map.getCenter();
    const sameLat = Math.abs(current.lat - center[0]) < 1e-7;
    const sameLon = Math.abs(current.lng - center[1]) < 1e-7;
    if (sameLat && sameLon) return;
    map.setView(center, map.getZoom(), { animate: false });
  }, [center[0], center[1], map]);
  return null;
};

export const RecenterMapOnRequest = ({
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

export const FullscreenMapViewportBridge = ({
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

export const MapSearchZoomBridge = ({
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

export const MapZoomBridge = ({
  onZoomChange
}: {
  onZoomChange: (zoom: number) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    const emit = () => {
      onZoomChange(map.getZoom());
    };
    emit();
    map.on("zoomend", emit);
    return () => {
      map.off("zoomend", emit);
    };
  }, [map, onZoomChange]);

  return null;
};

export const MapClosePopupBridge = ({
  requestToken
}: {
  requestToken: number;
}) => {
  const map = useMap();

  useEffect(() => {
    if (requestToken <= 0) return;
    map.closePopup();
  }, [map, requestToken]);

  return null;
};

export {
  ReachabilityLayerBridge,
  ReachabilityFitBoundsBridge,
  RouteLayerBridge,
  RouteFitBoundsBridge,
  RouteTargetPickBridge,
  QuickPinDropBridge,
  MapOverlayDismissBridge,
  DwdTimeDimensionBridge
} from "./map-overlays";
