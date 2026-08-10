import { isVirtualLocation } from "@/lib/ingestion/virtual-location";
import type { LocationOverride } from "@/lib/ingestion/types";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  placeName?: string;
};

export type GeocodeFn = (address: string) => Promise<GeocodeResult | null>;

/** Normalize address keys for per-run dedupe. */
export function normalizeAddressKey(address: string): string {
  return address.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Build Mapbox query from venue/address plus optional source geocode_context.
 * Dedupes identical address/venue (ICS often sets both to LOCATION).
 * Context is a search hint only — callers must not persist this string as address.
 */
export function buildGeocodeQuery(
  address: string | null | undefined,
  venueName: string | null | undefined,
  geocodeContext?: string | null
): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();

  for (const part of [address, venueName, geocodeContext]) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = normalizeAddressKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(trimmed);
  }

  return parts.length ? parts.join(", ") : null;
}

/**
 * Match event venue/address against declarative source location_overrides.
 * First case-insensitive substring match wins (order is significant).
 */
export function matchLocationOverride(
  venueName: string | null | undefined,
  address: string | null | undefined,
  overrides?: LocationOverride[] | null
): LocationOverride | null {
  if (!overrides?.length) return null;
  const haystack = normalizeAddressKey(
    [venueName, address].filter(Boolean).join(" ")
  );
  if (!haystack) return null;

  for (const override of overrides) {
    const needle = override.match?.trim().toLowerCase();
    if (!needle) continue;
    if (haystack.includes(needle)) return override;
  }
  return null;
}

/**
 * Resolve geocode query with precedence:
 * 1. matched location_overrides.address (facility map)
 * 2. geocode_override (canonical facility)
 * 3. location + geocode_context
 * 4. location alone
 *
 * Virtual detection is handled by callers before this runs.
 */
export function resolveGeocodeQuery(options: {
  address?: string | null;
  venueName?: string | null;
  geocodeContext?: string | null;
  geocodeOverride?: string | null;
  locationOverrides?: LocationOverride[] | null;
}): string | null {
  const facility = matchLocationOverride(
    options.venueName,
    options.address,
    options.locationOverrides
  );
  if (facility?.address?.trim()) return facility.address.trim();

  const override = options.geocodeOverride?.trim();
  if (override) return override;
  return buildGeocodeQuery(
    options.address,
    options.venueName,
    options.geocodeContext
  );
}

/**
 * Mapbox Permanent Geocoding (permanent=true) — coordinates are stored indefinitely.
 * Prefer existing lat/lng on the event; only call when missing.
 */
export function createMapboxGeocoder(token?: string): GeocodeFn {
  const accessToken = token ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!accessToken) {
    return async () => null;
  }

  return async (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return null;
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`
    );
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("permanent", "true");
    url.searchParams.set("limit", "1");
    url.searchParams.set("country", "US");
    url.searchParams.set("proximity", "-118.4,34.15");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{
        center?: [number, number];
        place_name?: string;
      }>;
    };
    const feature = json.features?.[0];
    const center = feature?.center;
    if (!center || center.length < 2) return null;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng, placeName: feature?.place_name };
  };
}

export class GeocodeCache {
  private cache = new Map<string, GeocodeResult | null>();

  constructor(private geocode: GeocodeFn) {}

  async resolve(address: string | null | undefined): Promise<GeocodeResult | null> {
    if (!address?.trim()) return null;
    const key = normalizeAddressKey(address);
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const result = await this.geocode(address);
    this.cache.set(key, result);
    return result;
  }
}

export type EnsureCoordinatesOptions = {
  /** Source-level locality hint (not written to event address/venue). */
  geocodeContext?: string | null;
  /** Canonical facility address used as the sole Mapbox query when set. */
  geocodeOverride?: string | null;
  /** Declarative facility map; matched overrides beat source geocode_override. */
  locationOverrides?: LocationOverride[] | null;
};

function hasFiniteCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/**
 * Fill lat/lng when missing, or clear them for clearly virtual locations.
 * Facility location_overrides always win when matched (corrects stale
 * source-level override pins on re-sync). Returns a new object (does not mutate).
 */
export async function ensureCoordinates<
  T extends {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    venue_name: string | null;
  },
>(
  event: T,
  cache: GeocodeCache,
  options: EnsureCoordinatesOptions = {}
): Promise<T> {
  // Virtual / non-physical → never geocode; clear any stale physical coords.
  // Must stay above geocode_override so Zoom events never inherit a facility pin.
  if (isVirtualLocation(event.address, event.venue_name)) {
    return {
      ...event,
      latitude: null,
      longitude: null,
    };
  }

  const facility = matchLocationOverride(
    event.venue_name,
    event.address,
    options.locationOverrides
  );

  if (facility) {
    if (hasFiniteCoords(facility.latitude ?? null, facility.longitude ?? null)) {
      return {
        ...event,
        latitude: facility.latitude as number,
        longitude: facility.longitude as number,
      };
    }
    const geo = await cache.resolve(facility.address);
    if (!geo) {
      return { ...event, latitude: null, longitude: null };
    }
    return {
      ...event,
      latitude: geo.latitude,
      longitude: geo.longitude,
    };
  }

  if (hasFiniteCoords(event.latitude, event.longitude)) {
    return event;
  }

  const query = resolveGeocodeQuery({
    address: event.address,
    venueName: event.venue_name,
    geocodeContext: options.geocodeContext,
    geocodeOverride: options.geocodeOverride,
    locationOverrides: options.locationOverrides,
  });
  const geo = await cache.resolve(query);
  if (!geo) {
    return {
      ...event,
      latitude: null,
      longitude: null,
    };
  }

  return {
    ...event,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
}
