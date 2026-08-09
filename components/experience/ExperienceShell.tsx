"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ExperienceProvider,
  useExperience,
} from "@/components/experience/ExperienceProvider";
import { ExperienceMenu } from "@/components/experience/ExperienceMenu";
import { EventList } from "@/components/events/EventList";
import { EventPreview } from "@/components/events/EventPreview";
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
  hasActiveUiFilters,
  nextDistanceTier,
  parseCategoryParam,
  parseDistanceMiles,
} from "@/lib/events/filters";
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
      <Suspense fallback={<div className="h-dvh bg-[var(--background)]" aria-label="Loading" />}>
        <ExperienceApp />
      </Suspense>
    </ExperienceProvider>
  );
}

function ExperienceApp() {
  const experience = useExperience();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [features, setFeatures] = useState<EventFeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const suppressViewportFetchRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const q = searchParams.get("q") ?? "";
  const date = searchParams.get("date");
  const distance = searchParams.get("distance") ?? "25";
  const category = searchParams.get("category") ?? "";

  const filtersActive = hasActiveUiFilters({
    query: q,
    date,
    categories: parseCategoryParam(category),
  });

  const distanceMiles = parseDistanceMiles(distance) ?? 25;
  const canExpandDistance = distanceMiles < 100;

  const events = useMemo(
    () => features.features.map((f) => featureToEventLike(f)),
    [features]
  );

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("date");
    params.delete("category");
    params.set("distance", "25");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const expandDistance = useCallback(() => {
    const next = nextDistanceTier(distanceMiles);
    const params = new URLSearchParams(searchParams.toString());
    params.set("distance", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [distanceMiles, pathname, router, searchParams]);

  // Cross-fade map on experience mount (~400ms).
  useEffect(() => {
    setMapReady(false);
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
        const center = userLocation ?? {
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

        setSelectedEventId((current) => {
          if (!current) return null;
          const stillThere = json.features.some(
            (f) => f.properties.id === current
          );
          return stillThere ? current : null;
        });
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
    userLocation,
  ]);

  const handleViewportChange = useCallback((next: BBox) => {
    setBbox(next);
  }, []);

  const handleSelectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id);
    if (id) {
      setSheetState((prev) => (prev === "detail" ? "detail" : "preview"));
    }
  }, []);

  useEffect(() => {
    if (!selectedEventId && sheetState === "preview") {
      setSheetState("collapsed");
    }
  }, [selectedEventId, sheetState]);

  const mapClassName = cn(
    "map-fade h-full w-full transition-opacity duration-[400ms] ease-out motion-reduce:transition-none",
    mapReady ? "opacity-100" : "opacity-0"
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden experience-shell">
      <div className="hidden h-full md:grid md:grid-cols-[minmax(20rem,32%)_1fr]">
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
          <FilterSheet eventCount={events.length} inline />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <EventList
              events={events}
              selectedEventId={selectedEventId}
              onSelect={handleSelectEvent}
              loading={loading}
              error={error}
              filtersActive={filtersActive}
              onClearFilters={clearFilters}
              onExpandDistance={expandDistance}
              canExpandDistance={canExpandDistance}
            />
            {selectedEvent && (
              <div className="mt-6 border-t border-[var(--border)] pt-6">
                <EventDetail
                  event={selectedEvent}
                  userLocation={userLocation}
                />
              </div>
            )}
          </div>
        </aside>
        <EventMap
          key={experience.id}
          className={mapClassName}
          data={features}
          selectedEventId={selectedEventId}
          onSelectEvent={handleSelectEvent}
          onViewportChange={handleViewportChange}
          suppressViewportFetchRef={suppressViewportFetchRef}
          onUserLocation={setUserLocation}
        />
      </div>

      <div className="relative h-full md:hidden">
        <div className="absolute inset-x-0 top-0 z-10 space-y-2 p-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 backdrop-blur">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Overdrive Radar
              </p>
              <p className="text-sm font-semibold">{experience.name}</p>
            </div>
            <ExperienceMenu />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchBar />
            </div>
            <FilterSheet eventCount={events.length} />
          </div>
        </div>

        <EventMap
          key={`m-${experience.id}`}
          className={cn("absolute inset-0", mapClassName)}
          data={features}
          selectedEventId={selectedEventId}
          onSelectEvent={handleSelectEvent}
          onViewportChange={handleViewportChange}
          suppressViewportFetchRef={suppressViewportFetchRef}
          onUserLocation={setUserLocation}
        />

        <MobileBottomSheet
          state={sheetState}
          onStateChange={setSheetState}
          eventCount={events.length}
          preview={
            selectedEvent ? (
              <EventPreview
                event={selectedEvent}
                onSelect={handleSelectEvent}
                onOpenDetail={() => setSheetState("detail")}
              />
            ) : null
          }
          list={
            <EventList
              events={events}
              selectedEventId={selectedEventId}
              onSelect={(id) => {
                handleSelectEvent(id);
                setSheetState("preview");
              }}
              loading={loading}
              error={error}
              filtersActive={filtersActive}
              onClearFilters={clearFilters}
              onExpandDistance={expandDistance}
              canExpandDistance={canExpandDistance}
            />
          }
          detail={
            <EventDetail
              event={selectedEvent}
              userLocation={userLocation}
              loading={Boolean(selectedEventId && !selectedEvent && loading)}
            />
          }
        />
      </div>
    </div>
  );
}
