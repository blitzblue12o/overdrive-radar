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

/**
 * Fill lat/lng only when missing. Returns a new object (does not mutate).
 */
export async function ensureCoordinates<
  T extends {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    venue_name: string | null;
  },
>(event: T, cache: GeocodeCache): Promise<T> {
  if (
    event.latitude != null &&
    event.longitude != null &&
    Number.isFinite(event.latitude) &&
    Number.isFinite(event.longitude)
  ) {
    return event;
  }

  const query = [event.address, event.venue_name].filter(Boolean).join(", ");
  const geo = await cache.resolve(query || event.address || event.venue_name);
  if (!geo) return event;

  return {
    ...event,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
}
