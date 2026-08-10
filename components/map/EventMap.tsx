"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocateFixed } from "lucide-react";
import { useExperience } from "@/components/experience/ExperienceProvider";
import {
  EVENT_CLUSTER_COUNT_LAYER_ID,
  EVENT_CLUSTER_LAYER_ID,
} from "@/components/map/EventCluster";
import {
  EVENT_POINT_LAYER_ID,
  EVENT_SELECTED_LAYER_ID,
  EVENT_SELECTED_RING_LAYER_ID,
} from "@/components/map/EventMarker";
import {
  armViewportSuppressUntilMoveEnd,
  bboxFromCenter,
  isViewportFetchSuppressed,
} from "@/lib/events/filters";
import type { BBox, EventFeatureCollection } from "@/lib/events/types";
import {
  leafEventFromFeature,
  resolveClusterClickAction,
  type ClusterLeafEvent,
} from "@/lib/map/cluster-interaction";
import { cn } from "@/lib/utils";

const SOURCE_ID = "events";
const CLUSTER_LAYER = EVENT_CLUSTER_LAYER_ID;
const CLUSTER_COUNT_LAYER = EVENT_CLUSTER_COUNT_LAYER_ID;
const POINT_LAYER = EVENT_POINT_LAYER_ID;
const SELECTED_LAYER = EVENT_SELECTED_LAYER_ID;
const SELECTED_RING_LAYER = EVENT_SELECTED_RING_LAYER_ID;

function isValidLngLat(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  );
}

/** Hidden (display:none) or zero-size maps crash Mapbox camera math. */
function isMapReadyForCamera(map: mapboxgl.Map): boolean {
  try {
    if (!map.isStyleLoaded()) return false;
    const el = map.getContainer();
    return el.clientWidth > 1 && el.clientHeight > 1;
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Fit camera to results. Returns true only when a camera move was applied
 * (so callers can clear fitResultsOnDataRef — hidden maps must not consume it).
 */
function fitMapToFeatures(
  map: mapboxgl.Map,
  data: EventFeatureCollection,
  suppressViewportFetchRef: React.MutableRefObject<boolean>
): boolean {
  if (!data.features.length || !isMapReadyForCamera(map)) return false;

  const bounds = new mapboxgl.LngLatBounds();
  let count = 0;
  for (const f of data.features) {
    const [lng, lat] = f.geometry.coordinates;
    if (!isValidLngLat(lng, lat)) continue;
    bounds.extend([lng, lat]);
    count += 1;
  }
  if (count === 0 || bounds.isEmpty()) return false;

  const el = map.getContainer();
  const padX = Math.max(8, Math.min(48, Math.floor(el.clientWidth * 0.12)));
  const padY = Math.max(8, Math.min(72, Math.floor(el.clientHeight * 0.12)));
  const reduced = prefersReducedMotion();

  armViewportSuppressUntilMoveEnd(suppressViewportFetchRef, map);
  try {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const isPoint =
      Math.abs(ne.lng - sw.lng) < 1e-6 && Math.abs(ne.lat - sw.lat) < 1e-6;

    if (isPoint) {
      map.easeTo({
        center: [ne.lng, ne.lat],
        zoom: Math.min(Math.max(map.getZoom(), 11), 12.5),
        duration: reduced ? 0 : 500,
      });
    } else {
      map.fitBounds(bounds, {
        padding: { top: padY, bottom: padY, left: padX, right: padX },
        maxZoom: 12.5,
        duration: reduced ? 0 : 600,
      });
    }
    return true;
  } catch {
    suppressViewportFetchRef.current = false;
    return false;
  }
}

/** Fit camera to the active search radius (viewport UX — not a new search). */
function fitMapToSearchArea(
  map: mapboxgl.Map,
  center: { lat: number; lng: number },
  radiusMiles: number,
  suppressViewportFetchRef: React.MutableRefObject<boolean>
): boolean {
  if (!isValidLngLat(center.lng, center.lat) || !isMapReadyForCamera(map)) {
    return false;
  }
  const miles = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 25;
  const box = bboxFromCenter(center, miles);
  const el = map.getContainer();
  const padX = Math.max(8, Math.min(48, Math.floor(el.clientWidth * 0.1)));
  const padY = Math.max(8, Math.min(72, Math.floor(el.clientHeight * 0.1)));

  armViewportSuppressUntilMoveEnd(suppressViewportFetchRef, map);
  try {
    map.fitBounds(
      [
        [box.minLng, box.minLat],
        [box.maxLng, box.maxLat],
      ],
      {
        padding: { top: padY, bottom: padY, left: padX, right: padX },
        maxZoom: 12.5,
        duration: prefersReducedMotion() ? 0 : 700,
        essential: true,
      }
    );
    return true;
  } catch {
    suppressViewportFetchRef.current = false;
    return false;
  }
}

export function EventMap({
  data,
  selectedEventId,
  onSelectEvent,
  onViewportChange,
  suppressViewportFetchRef,
  fitResultsOnDataRef,
  onBackgroundClick,
  onUserLocation,
  onMapCenterChange,
  onClusterPick,
  centerTarget,
  searchAreaCenter,
  searchAreaRadiusMiles = 25,
  searchRecenterKey = 0,
  geolocateRequestKey = 0,
  className,
  controlsPosition = "top-right",
  showRecenter = true,
}: {
  data: EventFeatureCollection;
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  onViewportChange: (bbox: BBox) => void;
  /** When true, moveend from programmatic camera moves must not refetch. */
  suppressViewportFetchRef: React.MutableRefObject<boolean>;
  /**
   * When true, the next data update fits the camera to results.
   * Set only for initial load + filter/search changes — never for viewport fetches.
   */
  fitResultsOnDataRef: React.MutableRefObject<boolean>;
  /** Empty-map click (not a marker/cluster). */
  onBackgroundClick?: () => void;
  onUserLocation?: (coords: { lat: number; lng: number } | null) => void;
  /** Map camera center after any moveend (including suppressed) — presentation only. */
  onMapCenterChange?: (center: { lat: number; lng: number }) => void;
  /**
   * Colocated / non-separating cluster leaves — never pass a single arbitrary event id.
   * Caller shows a selector; must not open EventDetail until the user picks a leaf.
   */
  onClusterPick?: (events: ClusterLeafEvent[]) => void;
  /** Programmatic recenter for manual city/ZIP (uses suppressViewportFetchRef). */
  centerTarget?: { lat: number; lng: number } | null;
  /** Active search anchor for chip recenter (not mutated by pan). */
  searchAreaCenter?: { lat: number; lng: number } | null;
  searchAreaRadiusMiles?: number;
  /** Increment to fly/fit back to searchAreaCenter without changing search state. */
  searchRecenterKey?: number;
  /** Increment to trigger Mapbox GeolocateControl.trigger(). */
  geolocateRequestKey?: number;
  className?: string;
  controlsPosition?: "top-right" | "bottom-right";
  showRecenter?: boolean;
}) {
  const experience = useExperience();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectEventRef = useRef(onSelectEvent);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const onUserLocationRef = useRef(onUserLocation);
  const onMapCenterChangeRef = useRef(onMapCenterChange);
  const onClusterPickRef = useRef(onClusterPick);
  const selectedRef = useRef(selectedEventId);
  const dataRef = useRef(data);
  const flewToSelectionRef = useRef<string | null>(null);
  const flewToCenterKeyRef = useRef<string | null>(null);
  const lastGeolocateRequestRef = useRef(0);
  const lastSearchRecenterKeyRef = useRef(0);

  onViewportChangeRef.current = onViewportChange;
  onSelectEventRef.current = onSelectEvent;
  onBackgroundClickRef.current = onBackgroundClick;
  onUserLocationRef.current = onUserLocation;
  onMapCenterChangeRef.current = onMapCenterChange;
  onClusterPickRef.current = onClusterPick;
  selectedRef.current = selectedEventId;
  dataRef.current = data;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: experience.theme.mapStyle,
      center: [-118.4, 34.15],
      zoom: 9.2,
      attributionControl: true,
    });

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      controlsPosition
    );

    const geo = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
    });
    map.addControl(geo, controlsPosition);
    geolocateRef.current = geo;
    geo.on("geolocate", (e) => {
      onUserLocationRef.current?.({
        lat: e.coords.latitude,
        lng: e.coords.longitude,
      });
    });

    const reportMapCenter = () => {
      try {
        const c = map.getCenter();
        if (!isValidLngLat(c.lng, c.lat)) return;
        onMapCenterChangeRef.current?.({ lat: c.lat, lng: c.lng });
      } catch {
        // Map may be mid-teardown.
      }
    };

    const emitViewport = () => {
      reportMapCenter();
      // Peek only — clearing is owned by armViewportSuppressUntilMoveEnd so a
      // single flyTo/easeTo that emits multiple moveends cannot refetch.
      if (isViewportFetchSuppressed(suppressViewportFetchRef)) return;
      const bounds = map.getBounds();
      if (!bounds) return;
      onViewportChangeRef.current({
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
      });
    };

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
        promoteId: "id",
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": experience.theme.accent,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            10,
            22,
            25,
            28,
          ],
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": experience.theme.accentForeground,
        },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!=", ["get", "id"], selectedRef.current ?? ""],
        ],
        paint: {
          "circle-color": experience.theme.accent,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            9,
            7,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });

      // Outer ring makes Selected clearly distinct from Default.
      map.addLayer({
        id: SELECTED_RING_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "id"], selectedRef.current ?? ""],
        ],
        paint: {
          "circle-color": "transparent",
          "circle-radius": 16,
          "circle-stroke-width": 3,
          "circle-stroke-color": experience.theme.accent,
          "circle-opacity": 1,
        },
      });

      map.addLayer({
        id: SELECTED_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "id"], selectedRef.current ?? ""],
        ],
        paint: {
          "circle-color": experience.theme.accent,
          "circle-radius": 12,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 1,
        },
      });

      const bounds = map.getBounds();
      if (bounds) {
        onViewportChangeRef.current({
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        });
      }
    });

    map.on("moveend", emitViewport);

    const openClusterLeafPicker = (
      source: mapboxgl.GeoJSONSource,
      clusterId: number,
      pointCount: number
    ) => {
      const limit = Math.max(1, Math.min(pointCount || 50, 50));
      source.getClusterLeaves(clusterId, limit, 0, (err, leaves) => {
        if (err || !leaves?.length) return;
        const events: ClusterLeafEvent[] = [];
        const seen = new Set<string>();
        for (const leaf of leaves) {
          const item = leafEventFromFeature(leaf);
          if (!item || seen.has(item.id)) continue;
          seen.add(item.id);
          events.push(item);
        }
        if (events.length === 0) return;
        if (events.length === 1) {
          // Degenerate cluster of one — open that occurrence directly.
          onSelectEventRef.current(events[0].id);
          return;
        }
        onClusterPickRef.current?.(events);
      });
    };

    // Mapbox may fire multiple layer click handlers for one gesture (circle + count).
    // Guard so expand/pick runs once per interaction.
    let clusterClickGuard = false;
    const handleClusterFeatureClick = (feature: mapboxgl.MapboxGeoJSONFeature) => {
      if (clusterClickGuard) return;
      clusterClickGuard = true;
      requestAnimationFrame(() => {
        clusterClickGuard = false;
      });

      const clusterId = feature.properties?.cluster_id;
      const pointCount = Number(feature.properties?.point_count ?? 0);
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (clusterId == null) return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        const action = resolveClusterClickAction({
          currentZoom: map.getZoom(),
          expansionZoom: err ? null : zoom,
        });

        if (action === "pick") {
          openClusterLeafPicker(source, clusterId, pointCount);
          return;
        }

        if (
          !feature.geometry ||
          feature.geometry.type !== "Point" ||
          !isMapReadyForCamera(map)
        ) {
          openClusterLeafPicker(source, clusterId, pointCount);
          return;
        }
        const coords = feature.geometry.coordinates as [number, number];
        if (!isValidLngLat(coords[0], coords[1])) {
          openClusterLeafPicker(source, clusterId, pointCount);
          return;
        }
        armViewportSuppressUntilMoveEnd(suppressViewportFetchRef, map);
        try {
          map.easeTo({
            center: coords,
            zoom: Math.min(Math.max(zoom as number, 0), 22),
            duration: prefersReducedMotion() ? 0 : 450,
          });
        } catch {
          suppressViewportFetchRef.current = false;
          openClusterLeafPicker(source, clusterId, pointCount);
        }
      });
    };

    const handleUnclusteredPointClick = (point: mapboxgl.PointLike) => {
      const layers = [POINT_LAYER, SELECTED_LAYER, SELECTED_RING_LAYER].filter(
        (id) => map.getLayer(id)
      );
      const hits = map.queryRenderedFeatures(point, { layers });
      const events: ClusterLeafEvent[] = [];
      const seen = new Set<string>();
      for (const hit of hits) {
        const item = leafEventFromFeature(hit);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        events.push(item);
      }
      if (events.length === 0) return;
      if (events.length === 1) {
        onSelectEventRef.current(events[0].id);
        return;
      }
      // Stacked unclustered markers at the same click target — picker, not arbitrary.
      onClusterPickRef.current?.(events);
    };

    // Prefer cluster handling; never fall through into single-event selection.
    map.on("click", CLUSTER_LAYER, (e) => {
      e.originalEvent.stopPropagation();
      const feature =
        e.features?.[0] ??
        map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] })[0];
      if (!feature) return;
      handleClusterFeatureClick(feature);
    });

    map.on("click", CLUSTER_COUNT_LAYER, (e) => {
      e.originalEvent.stopPropagation();
      const feature = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      })[0];
      if (!feature) return;
      handleClusterFeatureClick(feature);
    });

    map.on("click", POINT_LAYER, (e) => {
      e.originalEvent.stopPropagation();
      // If a cluster is also under the cursor, cluster wins.
      const clusterHit = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      })[0];
      if (clusterHit) {
        handleClusterFeatureClick(clusterHit);
        return;
      }
      handleUnclusteredPointClick(e.point);
    });

    map.on("click", SELECTED_LAYER, (e) => {
      e.originalEvent.stopPropagation();
      handleUnclusteredPointClick(e.point);
    });

    map.on("click", SELECTED_RING_LAYER, (e) => {
      e.originalEvent.stopPropagation();
      handleUnclusteredPointClick(e.point);
    });

    map.on("click", (e) => {
      const layers = [
        CLUSTER_LAYER,
        CLUSTER_COUNT_LAYER,
        POINT_LAYER,
        SELECTED_LAYER,
        SELECTED_RING_LAYER,
      ].filter((id) => map.getLayer(id));
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (hits.length === 0) {
        onBackgroundClickRef.current?.();
      }
    });

    map.on("mouseenter", CLUSTER_COUNT_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CLUSTER_COUNT_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    let hoveredId: string | number | undefined;
    map.on("mousemove", POINT_LAYER, (e) => {
      map.getCanvas().style.cursor = "pointer";
      const id = e.features?.[0]?.id;
      if (id == null) return;
      if (hoveredId != null) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
      }
      hoveredId = id;
      map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
    });
    map.on("mouseleave", POINT_LAYER, () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId != null) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredId },
          { hover: false }
        );
        hoveredId = undefined;
      }
    });
    map.on("mouseenter", CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;

    return () => {
      geolocateRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Map instance is created once per mount; style/theme changes remount via key on parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual location: fly camera once per target, suppress moveend refetch loop.
  useEffect(() => {
    const map = mapRef.current;
    if (!centerTarget) {
      flewToCenterKeyRef.current = null;
      return;
    }
    if (!map) return;
    if (!isValidLngLat(centerTarget.lng, centerTarget.lat)) return;
    if (!isMapReadyForCamera(map)) return;

    const key = `${centerTarget.lat.toFixed(5)},${centerTarget.lng.toFixed(5)}`;
    if (flewToCenterKeyRef.current === key) return;
    flewToCenterKeyRef.current = key;

    armViewportSuppressUntilMoveEnd(suppressViewportFetchRef, map);
    try {
      const zoom = map.getZoom();
      map.flyTo({
        center: [centerTarget.lng, centerTarget.lat],
        zoom: Number.isFinite(zoom) ? Math.max(zoom, 10) : 10,
        essential: true,
        duration: prefersReducedMotion() ? 0 : 800,
      });
    } catch {
      suppressViewportFetchRef.current = false;
      flewToCenterKeyRef.current = null;
    }
  }, [centerTarget, suppressViewportFetchRef]);

  // "Use my location" from FilterSheet — trigger Mapbox geolocate control.
  useEffect(() => {
    if (!geolocateRequestKey) return;
    if (lastGeolocateRequestRef.current === geolocateRequestKey) return;
    lastGeolocateRequestRef.current = geolocateRequestKey;
    try {
      geolocateRef.current?.trigger();
    } catch {
      // Geolocate may fail if permission denied; leave map as-is.
    }
  }, [geolocateRequestKey]);

  // Search-area chip recenter — viewport only; search URL/params unchanged.
  useEffect(() => {
    if (!searchRecenterKey) return;
    if (lastSearchRecenterKeyRef.current === searchRecenterKey) return;
    lastSearchRecenterKeyRef.current = searchRecenterKey;
    const map = mapRef.current;
    if (!map || !searchAreaCenter) return;
    fitMapToSearchArea(
      map,
      searchAreaCenter,
      searchAreaRadiusMiles,
      suppressViewportFetchRef
    );
  }, [
    searchRecenterKey,
    searchAreaCenter,
    searchAreaRadiusMiles,
    suppressViewportFetchRef,
  ]);

  // Keep GeoJSON source in sync; optionally fit camera when flagged (filter/search/initial).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(data);
      // Only consume the fit flag when a visible map actually moves the camera.
      // Hidden (md:hidden / display:none) maps must not eat the flag or call fitBounds.
      if (fitResultsOnDataRef.current && data.features.length > 0) {
        const fitted = fitMapToFeatures(
          map,
          data,
          suppressViewportFetchRef
        );
        if (fitted) fitResultsOnDataRef.current = false;
      }
    };

    if (map.isStyleLoaded() && map.getSource(SOURCE_ID)) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [data, fitResultsOnDataRef, suppressViewportFetchRef]);

  // Selection filter sync — React selectedEventId is the source of truth.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(POINT_LAYER)) return;

    const selectedFilter: mapboxgl.FilterSpecification = [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "id"], selectedEventId ?? ""],
    ];
    map.setFilter(POINT_LAYER, [
      "all",
      ["!", ["has", "point_count"]],
      ["!=", ["get", "id"], selectedEventId ?? ""],
    ]);
    map.setFilter(SELECTED_LAYER, selectedFilter);
    if (map.getLayer(SELECTED_RING_LAYER)) {
      map.setFilter(SELECTED_RING_LAYER, selectedFilter);
    }
  }, [selectedEventId]);

  // flyTo once per selection id — never again when viewport-triggered data refreshes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEventId) {
      if (!selectedEventId) flewToSelectionRef.current = null;
      return;
    }
    if (flewToSelectionRef.current === selectedEventId) return;

    const feature = data.features.find(
      (f) => f.properties.id === selectedEventId
    );
    if (!feature) return;

    const [lng, lat] = feature.geometry.coordinates;
    if (!isValidLngLat(lng, lat) || !isMapReadyForCamera(map)) return;

    flewToSelectionRef.current = selectedEventId;
    armViewportSuppressUntilMoveEnd(suppressViewportFetchRef, map);
    try {
      const zoom = map.getZoom();
      map.flyTo({
        center: [lng, lat],
        zoom: Number.isFinite(zoom) ? Math.max(zoom, 12) : 12,
        essential: true,
        duration: prefersReducedMotion() ? 0 : undefined,
      });
    } catch {
      suppressViewportFetchRef.current = false;
      flewToSelectionRef.current = null;
    }
  }, [selectedEventId, data, suppressViewportFetchRef]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    fitMapToFeatures(map, dataRef.current, suppressViewportFetchRef);
  };

  return (
    <div className={className} style={{ position: "relative" }}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label={`${experience.name} map`}
      />
      {showRecenter && token && (
        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter map on results"
          title="Recenter map on results"
          className={cn(
            "absolute z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            controlsPosition === "bottom-right"
              ? "bottom-[7.5rem] right-3 md:bottom-auto md:top-28 md:right-3"
              : "top-28 right-3"
          )}
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
        </button>
      )}
      {!token && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Add <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the
          map.
        </div>
      )}
    </div>
  );
}
