/** SoCal V1 — boundary math is hardcoded to America/Los_Angeles. */
export const FILTER_TIMEZONE = "America/Los_Angeles";

export type DateFilterParam =
  | "today"
  | "tomorrow"
  | "weekend"
  | string; // YYYY-MM-DD for pick-a-date

export const DISTANCE_TIERS = [10, 25, 50, 100] as const;
export type DistanceMiles = (typeof DISTANCE_TIERS)[number];

export function parseDistanceMiles(value: string | null | undefined): DistanceMiles | null {
  if (!value) return null;
  const n = Number(String(value).replace(/\s*mi$/i, "").trim());
  if (n === 10 || n === 25 || n === 50 || n === 100) return n;
  return null;
}

export function parseCategoryParam(value: string | null | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function formatCategoryParam(categories: string[]): string | null {
  if (!categories.length) return null;
  return categories.join(",");
}

/** Parts in FILTER_TIMEZONE for a given instant. */
function zonedParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: FILTER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

/** UTC instant for local midnight (FILTER_TIMEZONE) on Y-M-D. */
function laMidnightUtc(year: number, month: number, day: number): Date {
  // Iterate a small window around the approximate UTC time to hit LA midnight.
  const guess = new Date(Date.UTC(year, month - 1, day, 10, 0, 0));
  for (let offsetMin = -14 * 60; offsetMin <= 14 * 60; offsetMin += 15) {
    const candidate = new Date(guess.getTime() + offsetMin * 60_000);
    const p = zonedParts(candidate);
    if (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      new Intl.DateTimeFormat("en-US", {
        timeZone: FILTER_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(candidate) === "00:00"
    ) {
      return candidate;
    }
  }
  // Fallback: construct via locale string parse
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00-08:00`);
}

function addDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/**
 * Resolve ?date= into a half-open [start, end) window in absolute time (LA).
 * Discovery filters events by interval overlap against this window — not starts_at alone.
 * Supports: today | tomorrow | weekend | YYYY-MM-DD
 */
export function resolveDateRange(
  dateParam: string | null | undefined,
  now: Date = new Date()
): { start: Date; end: Date } | null {
  if (!dateParam) return null;
  // Pick-a-Date selected but no day yet — not an active temporal filter.
  if (dateParam === CUSTOM_DATE_PENDING_PARAM) return null;

  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
  if (isoDay) {
    const year = Number(isoDay[1]);
    const month = Number(isoDay[2]);
    const day = Number(isoDay[3]);
    const start = laMidnightUtc(year, month, day);
    const next = addDays(year, month, day, 1);
    const end = laMidnightUtc(next.year, next.month, next.day);
    return { start, end };
  }

  const key = dateParam.toLowerCase();
  const today = zonedParts(now);

  if (key === "today") {
    const start = laMidnightUtc(today.year, today.month, today.day);
    const next = addDays(today.year, today.month, today.day, 1);
    const end = laMidnightUtc(next.year, next.month, next.day);
    return { start, end };
  }

  if (key === "tomorrow") {
    const t = addDays(today.year, today.month, today.day, 1);
    const start = laMidnightUtc(t.year, t.month, t.day);
    const next = addDays(t.year, t.month, t.day, 1);
    const end = laMidnightUtc(next.year, next.month, next.day);
    return { start, end };
  }

  if (key === "weekend") {
    // This weekend = upcoming Sat 00:00 through Mon 00:00 (LA).
    // If today is Sat/Sun, use the current weekend.
    const weekdayIndex: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const wd = weekdayIndex[today.weekday] ?? 0;
    let daysToSaturday: number;
    if (wd === 6) daysToSaturday = 0;
    else if (wd === 0) daysToSaturday = -1; // Sunday → back to Saturday
    else daysToSaturday = 6 - wd;

    const sat = addDays(today.year, today.month, today.day, daysToSaturday);
    const mon = addDays(sat.year, sat.month, sat.day, 2);
    return {
      start: laMidnightUtc(sat.year, sat.month, sat.day),
      end: laMidnightUtc(mon.year, mon.month, mon.day),
    };
  }

  return null;
}

/** URL sentinel while Pick a Date is selected but no day chosen yet. */
export const CUSTOM_DATE_PENDING_PARAM = "custom";

export function dateChipToParam(
  chip: string | null,
  pickedIsoDate?: string | null
): string | null {
  if (!chip) return null;
  if (chip === "Today") return "today";
  if (chip === "Tomorrow") return "tomorrow";
  if (chip === "This Weekend") return "weekend";
  if (chip === "Pick a Date") {
    // Persist chip selection even before a day is chosen so the date control stays open.
    return pickedIsoDate || CUSTOM_DATE_PENDING_PARAM;
  }
  return null;
}

export function dateParamToChip(param: string | null): {
  chip: string | null;
  pickedIsoDate: string | null;
} {
  if (!param) return { chip: null, pickedIsoDate: null };
  if (param === "today") return { chip: "Today", pickedIsoDate: null };
  if (param === "tomorrow") return { chip: "Tomorrow", pickedIsoDate: null };
  if (param === "weekend") return { chip: "This Weekend", pickedIsoDate: null };
  if (param === CUSTOM_DATE_PENDING_PARAM) {
    return { chip: "Pick a Date", pickedIsoDate: null };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return { chip: "Pick a Date", pickedIsoDate: param };
  }
  return { chip: null, pickedIsoDate: null };
}

export function nextDistanceTier(current: DistanceMiles): DistanceMiles {
  const idx = DISTANCE_TIERS.indexOf(current);
  if (idx < 0 || idx >= DISTANCE_TIERS.length - 1) return 100;
  return DISTANCE_TIERS[idx + 1];
}

export function bboxFromCenter(
  center: { lat: number; lng: number },
  miles: number
): import("@/lib/events/types").BBox {
  const latDelta = miles / 69;
  const lngDelta = miles / (Math.max(0.2, Math.cos((center.lat * Math.PI) / 180) * 69));
  return {
    minLng: center.lng - lngDelta,
    minLat: center.lat - latDelta,
    maxLng: center.lng + lngDelta,
    maxLat: center.lat + latDelta,
  };
}

const EARTH_RADIUS_MI = 3958.7613;

/** Great-circle distance in miles (viewport vs search-center checks). */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Buffer on active search radius before showing "Return to…".
 * 1.15× avoids flicker at the radius edge from viewport geometry.
 */
export const MAP_AWAY_RADIUS_FACTOR = 1.15;

/** True when map center is meaningfully outside the active search area. */
export function isMapAwayFromSearchArea(
  mapCenter: { lat: number; lng: number },
  searchCenter: { lat: number; lng: number },
  radiusMiles: number,
  factor: number = MAP_AWAY_RADIUS_FACTOR
): boolean {
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) return false;
  return haversineMiles(mapCenter, searchCenter) > radiusMiles * factor;
}

/** "Near Poway, CA" → "Return to Poway, CA" (preserves trailing "· N mi"). */
export function searchAreaChipDisplayLabel(
  nearLabel: string,
  away: boolean
): string {
  if (!away) return nearLabel;
  if (/^near\s+/i.test(nearLabel)) {
    return nearLabel.replace(/^near\s+/i, "Return to ");
  }
  return `Return to ${nearLabel}`;
}

export function intersectBbox(
  a: import("@/lib/events/types").BBox,
  b: import("@/lib/events/types").BBox
): import("@/lib/events/types").BBox {
  return {
    minLng: Math.max(a.minLng, b.minLng),
    minLat: Math.max(a.minLat, b.minLat),
    maxLng: Math.min(a.maxLng, b.maxLng),
    maxLat: Math.min(a.maxLat, b.maxLat),
  };
}

export function hasActiveUiFilters(params: {
  query?: string | null;
  date?: string | null;
  categories?: string[];
}): boolean {
  return Boolean(
    (params.query && params.query.trim()) ||
      params.date ||
      (params.categories && params.categories.length > 0)
  );
}

/** Count of active UI filters for collapsed-sheet / chrome labels. */
export function countActiveUiFilters(params: {
  query?: string | null;
  date?: string | null;
  categories?: string[];
  distanceMiles?: number | null;
  defaultDistanceMiles?: number;
}): number {
  let n = 0;
  if (params.query?.trim()) n++;
  if (params.date) n++;
  if (params.categories && params.categories.length > 0) n++;
  const def = params.defaultDistanceMiles ?? 25;
  if (params.distanceMiles != null && params.distanceMiles !== def) n++;
  return n;
}

/** Peek whether a programmatic camera move should skip viewport refetch. */
export function isViewportFetchSuppressed(ref: { current: boolean }): boolean {
  return ref.current;
}

/**
 * Arm suppress for a programmatic camera animation.
 * Stays true through the animation's moveend (peek-only in emitViewport), then
 * clears on a microtask so trailing moveend handlers in the same turn still skip.
 */
export function armViewportSuppressUntilMoveEnd(
  ref: { current: boolean },
  map: { once: (event: "moveend", listener: () => void) => void }
): void {
  ref.current = true;
  map.once("moveend", () => {
    queueMicrotask(() => {
      ref.current = false;
    });
  });
}

/**
 * One-shot consume (legacy). Prefer armViewportSuppressUntilMoveEnd +
 * isViewportFetchSuppressed when Mapbox may emit multiple moveends.
 */
export function consumeViewportSuppress(ref: { current: boolean }): boolean {
  if (ref.current) {
    ref.current = false;
    return true;
  }
  return false;
}

/**
 * Location modes (URL-backed):
 * - current:  ?near=you&lat=&lng=       — device GPS; UI label is "Current location"
 * - searched: ?lat=&lng=&loc=           — geocoded city/ZIP; loc is the search label
 * - unknown:  no lat/lng
 *
 * Invariant: only one active location source. Switching to current MUST clear
 * any previous searched `loc` so the UI never shows "Poway" with device coords.
 */
export type LocationMode = "current" | "searched" | "unknown";

export type ParsedLocation = {
  mode: LocationMode;
  /** Human-readable label from ?loc= (searched). Null for device/current mode. */
  displayLocation: string | null;
  lat: number | null;
  lng: number | null;
};

/** Params that carry geographic context across experience switches. */
export const GEO_CONTEXT_PARAMS = ["lat", "lng", "loc", "near", "distance"] as const;

export function parseLocationFromSearchParams(
  params: URLSearchParams
): ParsedLocation {
  const latRaw = params.get("lat");
  const lngRaw = params.get("lng");
  if (latRaw == null || lngRaw == null || latRaw === "" || lngRaw === "") {
    return { mode: "unknown", displayLocation: null, lat: null, lng: null };
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return { mode: "unknown", displayLocation: null, lat: null, lng: null };
  }

  const displayLocation = params.get("loc")?.trim() || null;
  const isCurrent = params.get("near") === "you";
  return {
    mode: isCurrent ? "current" : "searched",
    displayLocation,
    lat,
    lng,
  };
}

/** Collapsed-pill / map chrome label — omit when location is unknown. */
export function locationNearLabel(location: ParsedLocation): string | null {
  if (location.mode === "unknown") return null;
  if (location.mode === "current") return "Near current location";
  const label = location.displayLocation?.trim();
  return label ? `Near ${label}` : null;
}

/**
 * Compact mobile context: "Near Poway, CA · 100 mi".
 * Derived from the same ParsedLocation + distance as the discovery query — no extra state.
 */
export function locationDistanceContextLabel(
  location: ParsedLocation,
  distanceMiles: number
): string | null {
  const near = locationNearLabel(location);
  if (!near) return null;
  const miles = Number.isFinite(distanceMiles) ? distanceMiles : 25;
  return `${near} · ${miles} mi`;
}

/** LOCATION input display value for the active mode. */
export function locationInputDisplay(location: ParsedLocation): string {
  if (location.mode === "current") return "Current location";
  return location.displayLocation?.trim() || "";
}

export function clearLocationParams(params: URLSearchParams) {
  params.delete("loc");
  params.delete("lat");
  params.delete("lng");
  params.delete("near");
}

/**
 * Device GPS / "Use my location".
 * Always clears `loc` so a prior manual city label cannot linger.
 */
export function setCurrentLocationParams(
  params: URLSearchParams,
  next: { lat: number; lng: number }
) {
  params.set("near", "you");
  params.set("lat", String(next.lat));
  params.set("lng", String(next.lng));
  params.delete("loc");
}

/** User-entered city/ZIP search — geocoded coords + label are authoritative. */
export function setSearchedLocationParams(
  params: URLSearchParams,
  next: { loc: string; lat: number; lng: number }
) {
  params.delete("near");
  params.set("loc", next.loc);
  params.set("lat", String(next.lat));
  params.set("lng", String(next.lng));
}

/** @deprecated Use setSearchedLocationParams */
export function setManualLocationParams(
  params: URLSearchParams,
  next: { loc: string; lat: number; lng: number }
) {
  setSearchedLocationParams(params, next);
}
