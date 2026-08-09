"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ExperienceProvider,
  useExperience,
} from "@/components/experience/ExperienceProvider";
import { ExperienceMenu } from "@/components/experience/ExperienceMenu";
import { EventList } from "@/components/events/EventList";
import { EventDetail } from "@/components/events/EventDetail";
import { SearchBar } from "@/components/search/SearchBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import {
  MobileBottomSheet,
  type SheetState,
} from "@/components/layout/MobileBottomSheet";
import type { ExperienceConfig } from "@/lib/config/experiences";
import type { BBox, EventFeatureCollection } from "@/lib/events/types";
import { featureToEventLike } from "@/lib/events/types";
import {
  bboxFromCenter,
  countActiveUiFilters,
  hasActiveUiFilters,
  locationNearLabel,
  nextDistanceTier,
  parseCategoryParam,
  parseDistanceMiles,
  parseLocationFromSearchParams,
  setCurrentLocationParams,
} from "@/lib/events/filters";
import { reverseGeocodeEphemeral } from "@/lib/events/geocode-place";
import { cn } from "@/lib/utils";

const EventMap = dynamic(
  () => import("@/components/map/EventMap").then((m) => m.EventMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-full bg-[var(--muted)]"
        aria-label="Loading map"
      />
    ),
  }
);

export function ExperienceShell({ config }: { config: ExperienceConfig }) {
  return (
    <ExperienceProvider config={config}>
      <Suspense
        fallback={
          <div className="h-dvh bg-[var(--background)]" aria-label="Loading" />
        }
      >
        <ExperienceApp />
      </Suspense>
    </ExperienceProvider>
  );
}

/** Avoid mounting two Mapbox maps (hidden one is 0×0 and crashes fitBounds). */
function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setIsDesktop(true);
      return;
    }
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function ExperienceApp() {
  const experience = useExperience();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();

  const [features, setFeatures] = useState<EventFeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [geolocateRequestKey, setGeolocateRequestKey] = useState(0);

  const suppressViewportFetchRef = useRef(false);
  /** Fit camera on next non-empty data — initial load + filter/search only. */
  const fitResultsOnDataRef = useRef(true);

  // Remounting the single visible map should re-fit results once.
  useEffect(() => {
    if (isDesktop == null) return;
    fitResultsOnDataRef.current = true;
  }, [isDesktop]);
  const abortRef = useRef<AbortController | null>(null);
  const filterKeyRef = useRef<string | null>(null);
  const eventFromUrlRef = useRef<string | null>(null);

  const q = searchParams.get("q") ?? "";
  const date = searchParams.get("date");
  const distance = searchParams.get("distance") ?? "25";
  const category = searchParams.get("category") ?? "";
  const eventFromUrl = searchParams.get("event");
  eventFromUrlRef.current = eventFromUrl;

  const selectedEventId = eventFromUrl;

  const location = useMemo(
    () => parseLocationFromSearchParams(searchParams),
    [searchParams]
  );
  const nearLabel = locationNearLabel(location);
  /** Authoritative search center from URL (GPS or searched) — never city centroid substitution. */
  const resolvedCenter = useMemo(() => {
    if (location.lat == null || location.lng == null) return null;
    return { lat: location.lat, lng: location.lng };
  }, [location.lat, location.lng]);

  const categories = useMemo(
    () => parseCategoryParam(category),
    [category]
  );

  const filtersActive = hasActiveUiFilters({
    query: q,
    date,
    categories,
  });

  const distanceMiles = parseDistanceMiles(distance) ?? 25;
  const activeFilterCount = countActiveUiFilters({
    query: q,
    date,
    categories,
    distanceMiles,
  });
  const canExpandDistance = distanceMiles < 100;

  /** Single center for distance queries — URL location when known, else last GPS. */
  const queryCenter = useMemo(() => {
    if (resolvedCenter) return resolvedCenter;
    if (userLocation) return userLocation;
    return null;
  }, [resolvedCenter, userLocation]);

  const events = useMemo(
    () => features.features.map((f) => featureToEventLike(f)),
    [features]
  );

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const clearFilters = useCallback(() => {
    replaceParams((params) => {
      params.delete("q");
      params.delete("date");
      params.delete("category");
      params.set("distance", "25");
    });
  }, [replaceParams]);

  const expandDistance = useCallback(() => {
    const next = nextDistanceTier(distanceMiles);
    replaceParams((params) => {
      params.set("distance", String(next));
    });
  }, [distanceMiles, replaceParams]);

  const handleUserLocation = useCallback(
    (coords: { lat: number; lng: number } | null) => {
      if (!coords) return;
      setUserLocation(coords);

      // Persist GPS as current-location mode immediately (coords usable now).
      // Keep an existing display label only if coords are unchanged; otherwise
      // set a temporary label until reverse geocode finishes.
      replaceParams((params) => {
        const prev = parseLocationFromSearchParams(params);
        const sameCoords =
          prev.mode === "current" &&
          prev.lat != null &&
          prev.lng != null &&
          Math.abs(prev.lat - coords.lat) < 1e-5 &&
          Math.abs(prev.lng - coords.lng) < 1e-5;
        setCurrentLocationParams(params, {
          lat: coords.lat,
          lng: coords.lng,
          loc:
            sameCoords && prev.displayLocation
              ? prev.displayLocation
              : "Current location",
        });
      });

      // Reverse-geocode for display only — do not alter lat/lng.
      void (async () => {
        const label = await reverseGeocodeEphemeral(coords.lat, coords.lng);
        const nextLabel = label?.trim() || "Current location";
        replaceParams((params) => {
          const latest = parseLocationFromSearchParams(params);
          if (latest.mode !== "current") return;
          if (
            latest.lat == null ||
            latest.lng == null ||
            Math.abs(latest.lat - coords.lat) > 1e-5 ||
            Math.abs(latest.lng - coords.lng) > 1e-5
          ) {
            return;
          }
          if (latest.displayLocation === nextLabel) return;
          setCurrentLocationParams(params, {
            lat: coords.lat,
            lng: coords.lng,
            loc: nextLabel,
          });
        });
      })();
    },
    [replaceParams]
  );

  const handleUseCurrentLocation = useCallback(() => {
    setGeolocateRequestKey((n) => n + 1);
  }, []);

  /** Open / switch event. Push on first enter; replace when already in detail. */
  const openEvent = useCallback(
    (id: string) => {
      if (eventFromUrl === id) return;
      const mutate = (params: URLSearchParams) => {
        params.set("event", id);
      };
      if (eventFromUrl) {
        replaceParams(mutate);
      } else {
        pushParams(mutate);
      }
    },
    [eventFromUrl, pushParams, replaceParams]
  );

  const closeEvent = useCallback(() => {
    if (!eventFromUrl) return;
    replaceParams((params) => {
      params.delete("event");
    });
  }, [eventFromUrl, replaceParams]);

  const handleSelectEvent = useCallback(
    (id: string | null) => {
      if (!id) {
        closeEvent();
        return;
      }
      openEvent(id);
    },
    [closeEvent, openEvent]
  );

  /** Mobile event-detail close → always list (map visible again). */
  const handleCloseEventDetail = useCallback(() => {
    closeEvent();
    setSheetState("list");
  }, [closeEvent]);

  /** Empty map tap: clear selection and collapse sheet (map-visible states only). */
  const handleMapBackgroundClick = useCallback(() => {
    closeEvent();
    setSheetState("collapsed");
  }, [closeEvent]);

  const handleSheetStateChange = useCallback((next: SheetState) => {
    // event-detail is entered only via ?event= / selection — ignore drag into it.
    if (next === "event-detail") return;
    setSheetState(next);
  }, []);

  // URL → sheet: deep link / browser back-forward.
  useEffect(() => {
    if (eventFromUrl) {
      setSheetState("event-detail");
      return;
    }
    setSheetState((prev) => (prev === "event-detail" ? "list" : prev));
  }, [eventFromUrl]);

  // Mark fit-on-data for initial load and filter/search/location changes only (not viewport).
  useEffect(() => {
    const key = `${q}|${date ?? ""}|${distanceMiles}|${category}|${location.mode}|${location.lat ?? ""}|${location.lng ?? ""}`;
    if (filterKeyRef.current === null) {
      filterKeyRef.current = key;
      fitResultsOnDataRef.current = true;
      return;
    }
    if (filterKeyRef.current !== key) {
      filterKeyRef.current = key;
      fitResultsOnDataRef.current = true;
    }
  }, [q, date, distanceMiles, category, location.mode, location.lat, location.lng]);

  // Resolved location: align query bbox to the distance radius around that center so
  // viewport∩radius is not stuck on the previous camera (flyTo suppress blocks moveend).
  useEffect(() => {
    if (!resolvedCenter) return;
    setBbox(bboxFromCenter(resolvedCenter, distanceMiles));
  }, [resolvedCenter, distanceMiles]);

  // Cross-fade map on experience mount (~400ms).
  useEffect(() => {
    setMapReady(false);
    fitResultsOnDataRef.current = true;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setMapReady(true);
      return;
    }
    const id = window.setTimeout(() => setMapReady(true), 40);
    return () => window.clearTimeout(id);
  }, [experience.id]);

  // One debounced effect: viewport + search/filter params + initial load.
  useEffect(() => {
    if (!bbox) return;

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const center = queryCenter ?? {
          lat: (bbox.minLat + bbox.maxLat) / 2,
          lng: (bbox.minLng + bbox.maxLng) / 2,
        };

        const params = new URLSearchParams({
          experience: experience.id,
          minLng: String(bbox.minLng),
          minLat: String(bbox.minLat),
          maxLng: String(bbox.maxLng),
          maxLat: String(bbox.maxLat),
          centerLat: String(center.lat),
          centerLng: String(center.lng),
          distance: String(distanceMiles),
        });
        if (q.trim()) params.set("q", q.trim());
        if (date) params.set("date", date);
        if (category) params.set("category", category);

        const res = await fetch(`/api/events?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load events");
        const json = (await res.json()) as EventFeatureCollection;
        setFeatures(json);

        const selectedId = eventFromUrlRef.current;
        if (selectedId) {
          const stillThere = json.features.some(
            (f) => f.properties.id === selectedId
          );
          if (!stillThere) {
            replaceParams((p) => {
              p.delete("event");
            });
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("load_failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    bbox,
    experience.id,
    q,
    date,
    distanceMiles,
    category,
    queryCenter,
    replaceParams,
  ]);

  const handleViewportChange = useCallback((next: BBox) => {
    setBbox(next);
  }, []);

  const mapClassName = cn(
    "map-fade h-full w-full transition-opacity duration-[400ms] ease-out motion-reduce:transition-none",
    mapReady ? "opacity-100" : "opacity-0"
  );

  const mapProps = {
    data: features,
    selectedEventId,
    onSelectEvent: handleSelectEvent,
    onViewportChange: handleViewportChange,
    suppressViewportFetchRef,
    fitResultsOnDataRef,
    onBackgroundClick: handleMapBackgroundClick,
    onUserLocation: handleUserLocation,
    centerTarget: resolvedCenter,
    geolocateRequestKey,
  };

  const listProps = {
    events,
    selectedEventId,
    loading,
    error,
    filtersActive,
    onClearFilters: clearFilters,
    onExpandDistance: expandDistance,
    canExpandDistance,
  };

  if (isDesktop == null) {
    return (
      <div className="h-dvh w-full bg-[var(--background)]" aria-label="Loading" />
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden experience-shell">
      {isDesktop ? (
        <div className="grid h-full grid-cols-[minmax(20rem,32%)_1fr]">
          <aside className="flex h-full min-h-0 flex-col border-r border-[var(--border)] bg-[var(--background)]">
            <header className="space-y-3 border-b border-[var(--border)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Overdrive Radar
                  </p>
                  <h1 className="text-xl font-semibold tracking-tight">
                    {experience.name}
                  </h1>
                </div>
                <ExperienceMenu />
              </div>
              <SearchBar />
            </header>
            <FilterSheet
              eventCount={events.length}
              inline
              onUseCurrentLocation={handleUseCurrentLocation}
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <EventList
                {...listProps}
                onSelect={(id) => handleSelectEvent(id)}
              />
            </div>
          </aside>
          <div className="relative min-h-0">
            <EventMap
              key={experience.id}
              className={mapClassName}
              {...mapProps}
            />
            {nearLabel && (
              <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-[var(--border)] bg-[var(--card)]/95 px-3 py-1.5 text-sm font-medium text-[var(--foreground)] shadow-sm backdrop-blur">
                {nearLabel}
              </div>
            )}
            {selectedEventId && (
              <div
                className="absolute inset-0 z-30 flex items-stretch justify-end bg-black/40 p-4 motion-reduce:transition-none"
                onClick={closeEvent}
                role="presentation"
              >
                <div
                  className="flex h-full w-full max-w-md flex-col overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Event details"
                >
                  <EventDetail
                    event={selectedEvent}
                    userLocation={userLocation}
                    loading={Boolean(
                      selectedEventId && !selectedEvent && loading
                    )}
                    onClose={closeEvent}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative h-full">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 shadow-sm backdrop-blur">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Overdrive Radar
                </p>
                <p className="truncate text-sm font-semibold">
                  {experience.name}
                </p>
              </div>
              <ExperienceMenu compact />
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchBar />
              </div>
              <FilterSheet
                eventCount={events.length}
                onUseCurrentLocation={handleUseCurrentLocation}
              />
            </div>
          </div>

          <EventMap
            key={`m-${experience.id}`}
            className={cn("absolute inset-0", mapClassName)}
            {...mapProps}
            controlsPosition="bottom-right"
          />

          <MobileBottomSheet
            state={sheetState}
            onStateChange={handleSheetStateChange}
            eventCount={events.length}
            activeFilterCount={activeFilterCount}
            nearLabel={nearLabel}
            list={
              <EventList
                {...listProps}
                onSelect={(id) => handleSelectEvent(id)}
              />
            }
            eventDetail={
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-[0_1_55%] overflow-y-auto border-b border-[var(--border)] px-4 pb-4">
                  <EventDetail
                    event={selectedEvent}
                    userLocation={userLocation}
                    loading={Boolean(
                      selectedEventId && !selectedEvent && loading
                    )}
                    onClose={handleCloseEventDetail}
                  />
                </div>
                <div className="min-h-0 flex-[1_1_45%] overflow-y-auto px-3 pb-4 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    Nearby events
                  </p>
                  <EventList
                    {...listProps}
                    onSelect={(id) => handleSelectEvent(id)}
                    scrollSelectedIntoView
                  />
                </div>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
