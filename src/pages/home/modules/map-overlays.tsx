import { useCallback, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import type { ReachabilityGeoJson, RouteGeoJson } from "../../../lib/api";
import type { MapWeatherLayerToggles } from "./map";

export const ReachabilityLayerBridge = ({
  geojson,
  color,
  tooltipHtml,
  onSaveReachability
}: {
  geojson: ReachabilityGeoJson | null;
  color: string;
  tooltipHtml?: string | null;
  onSaveReachability?: (() => void) | null;
}) => {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const onSaveReachabilityRef = useRef<(() => void) | null>(onSaveReachability ?? null);

  useEffect(() => {
    onSaveReachabilityRef.current = onSaveReachability ?? null;
  }, [onSaveReachability]);

  const reachabilityPalette = useMemo(
    () => ["#ef4444", "#f97316", "#facc15", "#84cc16", "#22c55e"],
    []
  );

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!geojson) return;
    const secondsForFeature = (feature: ReachabilityGeoJson["features"][number]) => {
      const props = feature.properties ?? {};
      const tagged = Number(props.domora_reachability_seconds);
      if (Number.isFinite(tagged) && tagged > 0) return tagged;
      const fallback = Number(props.value);
      if (Number.isFinite(fallback) && fallback > 0) return fallback;
      return null;
    };

    const sortableFeatures = geojson.features.map((feature, index) => ({
      feature,
      index,
      seconds: secondsForFeature(feature)
    }));

    const ordered = [...sortableFeatures].sort((a, b) => {
      const aScore = a.seconds ?? Number.POSITIVE_INFINITY;
      const bScore = b.seconds ?? Number.POSITIVE_INFINITY;
      if (aScore === bScore) return a.index - b.index;
      return bScore - aScore;
    });

    const maxLevel = Math.max(0, ordered.length - 1);

    const styledGeoJson: ReachabilityGeoJson = {
      type: "FeatureCollection",
      features: ordered.map((entry, level) => ({
        ...entry.feature,
        properties: {
          ...(entry.feature.properties ?? {}),
          domora_reachability_level: level
        }
      }))
    };

    const layer = L.geoJSON(styledGeoJson as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const rawLevel = Number((feature as GeoJSON.Feature | undefined)?.properties?.domora_reachability_level ?? 0);
        const level = Number.isFinite(rawLevel) ? rawLevel : 0;
        const ratio = maxLevel > 0 ? Math.min(1, Math.max(0, level / maxLevel)) : 0;
        const paletteIndex = Math.min(
          reachabilityPalette.length - 1,
          Math.max(0, Math.round(ratio * (reachabilityPalette.length - 1)))
        );
        const fillColor = reachabilityPalette[paletteIndex] ?? color;
        return {
          stroke: false,
          fillColor,
          fillOpacity: 0.46 - ratio * 0.18,
          lineCap: "round",
          lineJoin: "round"
        };
      },
      interactive: true
    });
    if (tooltipHtml) {
      layer.eachLayer((entry) => {
        if (!(entry instanceof L.Path)) return;
        entry.bindTooltip(tooltipHtml, {
          direction: "top",
          sticky: true,
          opacity: 0.95,
          interactive: true,
          className: "domora-map-route-line-tooltip"
        });
        const handleTooltipOpen = (evt: { tooltip?: L.Tooltip }) => {
          const tooltipElement = evt.tooltip?.getElement();
          if (!tooltipElement) return;
          const saveButton = tooltipElement.querySelector<HTMLButtonElement>(".domora-reachability-tooltip-save");
          if (!saveButton) return;
          const saveHandler = (domEvent: MouseEvent | PointerEvent | TouchEvent) => {
            domEvent.preventDefault();
            domEvent.stopPropagation();
            if (saveButton.disabled) return;
            onSaveReachabilityRef.current?.();
          };
          saveButton.onclick = saveHandler as (this: GlobalEventHandlers, ev: MouseEvent) => unknown;
          saveButton.onpointerdown = saveHandler as (this: GlobalEventHandlers, ev: PointerEvent) => unknown;
          saveButton.onmousedown = saveHandler as (this: GlobalEventHandlers, ev: MouseEvent) => unknown;
          saveButton.ontouchstart = saveHandler as (this: GlobalEventHandlers, ev: TouchEvent) => unknown;
        };
        const handleTooltipClose = (evt: { tooltip?: L.Tooltip }) => {
          const tooltipElement = evt.tooltip?.getElement();
          if (!tooltipElement) return;
          const saveButton = tooltipElement.querySelector<HTMLButtonElement>(".domora-reachability-tooltip-save");
          if (!saveButton) return;
          saveButton.onclick = null;
          saveButton.onpointerdown = null;
          saveButton.onmousedown = null;
          saveButton.ontouchstart = null;
        };
        entry.on("tooltipopen", handleTooltipOpen as L.LeafletEventHandlerFn);
        entry.on("tooltipclose", handleTooltipClose as L.LeafletEventHandlerFn);
      });
    }
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (!layerRef.current) return;
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [color, geojson, map, tooltipHtml]);

  return null;
};

export const ReachabilityFitBoundsBridge = ({
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

export const RouteLayerBridge = ({
  geojson,
  color,
  tooltipHtml,
  onSaveRoute,
  openTooltipToken
}: {
  geojson: RouteGeoJson | null;
  color: string;
  tooltipHtml?: string | null;
  onSaveRoute?: (() => void) | null;
  openTooltipToken?: number;
}) => {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const pathLayersRef = useRef<L.Path[]>([]);
  const onSaveRouteRef = useRef<(() => void) | null>(onSaveRoute ?? null);

  useEffect(() => {
    onSaveRouteRef.current = onSaveRoute ?? null;
  }, [onSaveRoute]);

  const getRouteDisplayLabel = (value: RouteGeoJson) => {
    let travelTimeSeconds: number | null = null;
    let lengthMeters: number | null = null;
    let fallbackCoords: Array<[number, number]> = [];

    for (const feature of value.features) {
      if (feature.geometry.type === "LineString") {
        const coords = feature.geometry.coordinates as number[][];
        const normalized = coords
          .map((pair) => [Number(pair[0]), Number(pair[1])] as [number, number])
          .filter(([lon, lat]) => Number.isFinite(lat) && Number.isFinite(lon));
        if (normalized.length >= 2) {
          fallbackCoords = normalized;
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
    return label || null;
  };

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    pathLayersRef.current = [];
    if (!geojson) return;
    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: () => ({
        color,
        weight: 4,
        opacity: 0.95
      }),
      interactive: true
    });
    const routeLabel = getRouteDisplayLabel(geojson);
    const tooltipContent = tooltipHtml ?? routeLabel;
    const pathLayers: L.Path[] = [];
    if (tooltipContent) {
      layer.eachLayer((entry) => {
        if (!(entry instanceof L.Path)) return;
        pathLayers.push(entry);
        entry.bindTooltip(tooltipContent, {
          direction: "top",
          sticky: true,
          opacity: 0.95,
          interactive: true,
          className: "domora-map-route-line-tooltip"
        });
        const handleTooltipOpen = (evt: { tooltip?: L.Tooltip }) => {
          const tooltipElement = evt.tooltip?.getElement();
          if (!tooltipElement) return;
          const saveButton = tooltipElement.querySelector<HTMLButtonElement>(".domora-route-tooltip-save");
          if (!saveButton) return;
          const saveHandler = (domEvent: MouseEvent | PointerEvent | TouchEvent) => {
            domEvent.preventDefault();
            domEvent.stopPropagation();
            if (saveButton.disabled) return;
            onSaveRouteRef.current?.();
          };
          saveButton.onclick = saveHandler as (this: GlobalEventHandlers, ev: MouseEvent) => unknown;
          saveButton.onpointerdown = saveHandler as (this: GlobalEventHandlers, ev: PointerEvent) => unknown;
          saveButton.onmousedown = saveHandler as (this: GlobalEventHandlers, ev: MouseEvent) => unknown;
          saveButton.ontouchstart = saveHandler as (this: GlobalEventHandlers, ev: TouchEvent) => unknown;
        };
        const handleTooltipClose = (evt: { tooltip?: L.Tooltip }) => {
          const tooltipElement = evt.tooltip?.getElement();
          if (!tooltipElement) return;
          const saveButton = tooltipElement.querySelector<HTMLButtonElement>(".domora-route-tooltip-save");
          if (!saveButton) return;
          saveButton.onclick = null;
          saveButton.onpointerdown = null;
          saveButton.onmousedown = null;
          saveButton.ontouchstart = null;
        };
        entry.on("tooltipopen", handleTooltipOpen as L.LeafletEventHandlerFn);
        entry.on("tooltipclose", handleTooltipClose as L.LeafletEventHandlerFn);
      });
    }
    layer.addTo(map);
    layerRef.current = layer;
    pathLayersRef.current = pathLayers;

    return () => {
      if (!layerRef.current) return;
      map.removeLayer(layerRef.current);
      layerRef.current = null;
      pathLayersRef.current = [];
    };
  }, [color, geojson, map, tooltipHtml]);

  useEffect(() => {
    if ((openTooltipToken ?? 0) <= 0) return;
    const firstPath = pathLayersRef.current[0];
    if (!firstPath) return;
    const frame = window.requestAnimationFrame(() => {
      firstPath.openTooltip();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openTooltipToken]);

  return null;
};

export const RouteFitBoundsBridge = ({
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

export const RouteTargetPickBridge = ({
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

export const QuickPinDropBridge = ({
  enabled,
  onDrop
}: {
  enabled: boolean;
  onDrop: (lat: number, lon: number) => void;
}) => {
  const isCoarsePointer = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }, []);

  useMapEvents({
    click: (event) => {
      if (!enabled) return;
      if (isCoarsePointer()) return;
      onDrop(event.latlng.lat, event.latlng.lng);
    },
    contextmenu: (event) => {
      if (!enabled) return;
      event.originalEvent?.preventDefault?.();
      onDrop(event.latlng.lat, event.latlng.lng);
    }
  });

  return null;
};

export const MapOverlayDismissBridge = ({
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

export const DwdTimeDimensionBridge = ({
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
