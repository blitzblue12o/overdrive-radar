"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useExperience } from "@/components/experience/ExperienceProvider";
import {
  EVENT_CLUSTER_COUNT_LAYER_ID,
  EVENT_CLUSTER_LAYER_ID,
} from "@/components/map/EventCluster";
import {
  EVENT_POINT_LAYER_ID,
  EVENT_SELECTED_LAYER_ID,
} from "@/components/map/EventMarker";
import { consumeViewportSuppress } from "@/lib/events/filters";
import type { BBox, EventFeatureCollection } from "@/lib/events/types";

const SOURCE_ID = "events";
const CLUSTER_LAYER = EVENT_CLUSTER_LAYER_ID;
const CLUSTER_COUNT_LAYER = EVENT_CLUSTER_COUNT_LAYER_ID;
const POINT_LAYER = EVENT_POINT_LAYER_ID;
const SELECTED_LAYER = EVENT_SELECTED_LAYER_ID;

export function EventMap({
  data,
  selectedEventId,
  onSelectEvent,
  onViewportChange,
  suppressViewportFetchRef,
  onUserLocation,
  className,
}: {
  data: EventFeatureCollection;
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  onViewportChange: (bbox: BBox) => void;
  /** When true, moveend from programmatic flyTo must not refetch. */
  suppressViewportFetchRef: React.MutableRefObject<boolean>;
  onUserLocation?: (coords: { lat: number; lng: number } | null) => void;
  className?: string;
}) {
  const experience = useExperience();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectEventRef = useRef(onSelectEvent);
  const selectedRef = useRef(selectedEventId);

  onViewportChangeRef.current = onViewportChange;
  onSelectEventRef.current = onSelectEvent;
  selectedRef.current = selectedEventId;

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

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const geo = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
    });
    map.addControl(geo, "top-right");
    geo.on("geolocate", (e) => {
      onUserLocation?.({
        lat: e.coords.latitude,
        lng: e.coords.longitude,
      });
    });

    // Debouncing lives in ExperienceShell's combined fetch effect.
    const emitViewport = () => {
      if (consumeViewportSuppress(suppressViewportFetchRef)) return;
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
          "circle-radius": 7,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
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
          "circle-radius": 10,
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

    map.on("click", CLUSTER_LAYER, (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      });
      const feature = features[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (clusterId == null) return;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null || !feature.geometry || feature.geometry.type !== "Point") {
          return;
        }
        suppressViewportFetchRef.current = true;
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom,
        });
      });
    });

    map.on("click", POINT_LAYER, (e) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      if (id) onSelectEventRef.current(id);
    });

    map.on("click", SELECTED_LAYER, (e) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      if (id) onSelectEventRef.current(id);
    });

    map.on("mouseenter", POINT_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", POINT_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("mouseenter", CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Map instance is created once per mount; style/theme changes remount via key on parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep GeoJSON source in sync with the single fetch result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      map.once("load", () => {
        const s = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        s?.setData(data);
      });
    }
  }, [data]);

  // Selection filter sync — React selectedEventId is the source of truth.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(POINT_LAYER)) return;

    map.setFilter(POINT_LAYER, [
      "all",
      ["!", ["has", "point_count"]],
      ["!=", ["get", "id"], selectedEventId ?? ""],
    ]);
    map.setFilter(SELECTED_LAYER, [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "id"], selectedEventId ?? ""],
    ]);
  }, [selectedEventId]);

  // flyTo when selection changes from list/card (not when map click already centered).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEventId) return;

    const feature = data.features.find(
      (f) => f.properties.id === selectedEventId
    );
    if (!feature) return;

    const [lng, lat] = feature.geometry.coordinates;
    const center = map.getCenter();
    const dist =
      Math.abs(center.lng - lng) + Math.abs(center.lat - lat);
    if (dist < 0.0008) return;

    suppressViewportFetchRef.current = true;
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 12),
      essential: true,
    });
  }, [selectedEventId, data, suppressViewportFetchRef]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  return (
    <div className={className} style={{ position: "relative" }}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label={`${experience.name} map`}
      />
      {!token && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Add <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the map.
        </div>
      )}
    </div>
  );
}
