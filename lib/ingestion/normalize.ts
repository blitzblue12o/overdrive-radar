import type {
  EventDiscoveryCategory,
  NormalizedEventInsert,
  OverdriveCategory,
  RawSourceEvent,
  SourceRecord,
} from "@/lib/ingestion/types";
import { cleanIngestedText, extractGeocodeAddressHint } from "@/lib/ingestion/text-clean";
import { resolveAbsoluteHttpUrl } from "@/lib/ingestion/urls";

const OVERDRIVE_MAP: Record<string, OverdriveCategory> = {
  "car meet": "car_meet",
  carmeet: "car_meet",
  meet: "car_meet",
  "cars and coffee": "car_meet",
  "car show": "car_show",
  carshow: "car_show",
  show: "car_show",
  cruise: "drive_cruise",
  "drive cruise": "drive_cruise",
  drive_cruise: "drive_cruise",
  drive: "drive_cruise",
  tour: "drive_cruise",
  autocross: "autocross",
  ax: "autocross",
  solo: "autocross",
  track: "track_event",
  "track day": "track_event",
  hpde: "track_event",
  other: "other",
};

const DISCOVERY_MAP: Record<string, EventDiscoveryCategory> = {
  family: "family",
  kids: "family",
  children: "family",
  preschool: "family",
  community: "community",
  workshop: "community",
  meeting: "community",
  civic: "community",
  government: "community",
  arts: "arts_and_culture",
  culture: "arts_and_culture",
  art: "arts_and_culture",
  music: "arts_and_culture",
  concert: "arts_and_culture",
  theater: "arts_and_culture",
  theatre: "arts_and_culture",
  outdoor: "outdoor",
  parks: "outdoor",
  recreation: "outdoor",
  hike: "outdoor",
  sports: "outdoor",
  food: "food_and_markets",
  market: "food_and_markets",
  farmers: "food_and_markets",
  entertainment: "entertainment",
  festival: "entertainment",
  movie: "entertainment",
  film: "entertainment",
  educational: "educational",
  library: "educational",
  author: "educational",
  class: "educational",
  storytime: "educational",
  lecture: "educational",
  stem: "educational",
};

export type NormalizeLog = {
  unmappedCategories: string[];
};

export function mapCategory(
  experience: SourceRecord["experience"],
  categories: string[] | undefined,
  source: SourceRecord,
  log: NormalizeLog
): { overdrive: OverdriveCategory | null; discovery: EventDiscoveryCategory | null } {
  const tokens = (categories ?? []).map(normalizeToken).filter(Boolean);

  if (experience === "overdrive") {
    for (const t of tokens) {
      const mapped = OVERDRIVE_MAP[t];
      if (mapped) return { overdrive: mapped, discovery: null };
    }
    for (const raw of categories ?? []) {
      if (raw.trim()) log.unmappedCategories.push(raw.trim());
    }
    return {
      overdrive: source.default_category_overdrive ?? "other",
      discovery: null,
    };
  }

  for (const t of tokens) {
    const mapped = DISCOVERY_MAP[t];
    if (mapped) return { overdrive: null, discovery: mapped };
  }
  for (const raw of categories ?? []) {
    if (raw.trim()) log.unmappedCategories.push(raw.trim());
  }
  return {
    overdrive: null,
    discovery: source.default_category_event_discovery ?? "community",
  };
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeRawEvent(
  raw: RawSourceEvent,
  source: SourceRecord,
  log: NormalizeLog = { unmappedCategories: [] }
): NormalizedEventInsert {
  const cats = mapCategory(source.experience, raw.categories, source, log);
  const now = new Date().toISOString();

  const title =
    cleanIngestedText(raw.title, 500) ?? raw.title.slice(0, 500).trim();
  const description = cleanIngestedText(raw.description, 8000);
  const venueName = cleanIngestedText(raw.venueName, 300);
  const addressRaw = cleanIngestedText(raw.address, 500);
  // When venue/address are instruction-heavy, keep a geocode-friendly street hint.
  const address =
    extractGeocodeAddressHint(addressRaw) ??
    extractGeocodeAddressHint(venueName) ??
    addressRaw;
  const sourceUrl = resolveAbsoluteHttpUrl(raw.url, source.feed_url);

  return {
    experience: source.experience,
    overdrive_category: cats.overdrive,
    event_discovery_category: cats.discovery,
    title,
    description,
    starts_at: raw.startsAt.toISOString(),
    ends_at: raw.endsAt ? raw.endsAt.toISOString() : null,
    timezone: raw.timezone ?? "America/Los_Angeles",
    venue_name: venueName,
    address,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    source_type: source.adapter_type,
    source_id: `${source.id}:${raw.uid}`.slice(0, 500),
    source_url: sourceUrl,
    source_metadata: {
      source_name: source.name,
      adapter_type: source.adapter_type,
      raw_uid: raw.uid,
      categories: raw.categories ?? [],
      ...(raw.metadata ?? {}),
    },
    organizer_name: cleanIngestedText(raw.organizerName, 200),
    moderation_status: "pending",
    publication_status: "draft",
    event_status: "scheduled",
    last_source_sync_at: now,
  };
}
