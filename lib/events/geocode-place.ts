/**
 * Ephemeral (temporary) Mapbox forward/reverse geocoding for session map centering.
 * Never pass permanent=true — results are not stored in the database.
 */

export type PlaceGeocodeResult = {
  lat: number;
  lng: number;
  /** Concise "City, ST" (or best available) for UI / ?loc=. */
  label: string;
  placeName?: string;
};

type MapboxContext = {
  id?: string;
  text?: string;
  short_code?: string;
};

type MapboxFeature = {
  center?: [number, number];
  place_name?: string;
  text?: string;
  place_type?: string[];
  context?: MapboxContext[];
};

/** Build a concise "City, ST" label from a Mapbox feature. */
export function formatCityStateLabel(feature: MapboxFeature): string | null {
  const types = feature.place_type ?? [];
  const context = feature.context ?? [];

  const contextText = (prefix: string) =>
    context.find((c) => c.id?.startsWith(`${prefix}.`))?.text?.trim() || null;

  const regionCode = (() => {
    const region = context.find((c) => c.id?.startsWith("region."));
    const code = region?.short_code?.trim();
    if (code?.includes("-")) return code.split("-").pop()?.toUpperCase() || null;
    if (code && code.length <= 3) return code.toUpperCase();
    const name = region?.text?.trim();
    return name ? abbreviateUsState(name) : null;
  })();

  let city: string | null = null;
  if (types.includes("place") || types.includes("locality")) {
    city = feature.text?.trim() || null;
  }
  if (!city) city = contextText("place");
  if (!city) city = contextText("locality");
  if (!city && types.includes("district")) city = feature.text?.trim() || null;
  if (!city) city = contextText("district");

  if (city && regionCode) return `${city}, ${regionCode}`;
  if (city) return city;

  // Postcode-only: still try context city/region above; else refuse ZIP-as-label.
  if (types.includes("postcode")) return null;

  const text = feature.text?.trim();
  return text || null;
}

const US_STATE_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function abbreviateUsState(name: string): string | null {
  return US_STATE_ABBR[name.toLowerCase()] ?? null;
}

export async function geocodePlaceEphemeral(
  query: string,
  token?: string
): Promise<PlaceGeocodeResult | null> {
  const accessToken = token ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const trimmed = query.trim();
  if (!accessToken || !trimmed) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`
  );
  url.searchParams.set("access_token", accessToken);
  // Temporary / ephemeral only — do not set permanent=true.
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "US");
  url.searchParams.set("types", "postcode,place,locality");
  url.searchParams.set("proximity", "-118.4,34.15");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;

  const json = (await res.json()) as { features?: MapboxFeature[] };
  const feature = json.features?.[0];
  const center = feature?.center;
  if (!feature || !center || center.length < 2) return null;
  const [lng, lat] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const label =
    formatCityStateLabel(feature) ||
    feature.text?.trim() ||
    trimmed;

  return {
    lat,
    lng,
    label,
    placeName: feature.place_name,
  };
}

/**
 * Reverse-geocode coordinates → "City, ST" for display only.
 * Callers must keep the original GPS/search coordinates as the search center.
 */
export async function reverseGeocodeEphemeral(
  lat: number,
  lng: number,
  token?: string
): Promise<string | null> {
  const accessToken = token ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (
    !accessToken ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "place,locality,district");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;

  const json = (await res.json()) as { features?: MapboxFeature[] };
  const feature = json.features?.[0];
  if (!feature) return null;
  return formatCityStateLabel(feature);
}
