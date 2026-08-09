import type {
  EventDiscoveryCategory,
  NormalizedEventInsert,
  OverdriveCategory,
  RawSourceEvent,
  SourceRecord,
} from "@/lib/ingestion/types";

const OVERDRIVE_MAP: Record<string, OverdriveCategory> = {
  "car meet": "car_meet",
  carmeet: "car_meet",
  meet: "car_meet",
  "cars and coffee": "car_meet",
  "car show": "car_show",
  carshow: "car_show",
  show: "car_show",
  cruise: "drive_cruise",
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
  arts: "arts_and_culture",
  culture: "arts_and_culture",
  art: "arts_and_culture",
  music: "arts_and_culture",
  outdoor: "outdoor",
  parks: "outdoor",
  recreation: "outdoor",
  hike: "outdoor",
  food: "food_and_markets",
  market: "food_and_markets",
  farmers: "food_and_markets",
  entertainment: "entertainment",
  festival: "entertainment",
  educational: "educational",
  library: "educational",
  author: "educational",
  class: "educational",
  storytime: "educational",
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

  return {
    experience: source.experience,
    overdrive_category: cats.overdrive,
    event_discovery_category: cats.discovery,
    title: raw.title.slice(0, 500),
    description: raw.description?.slice(0, 8000) ?? null,
    starts_at: raw.startsAt.toISOString(),
    ends_at: raw.endsAt ? raw.endsAt.toISOString() : null,
    timezone: raw.timezone ?? "America/Los_Angeles",
    venue_name: raw.venueName?.slice(0, 300) ?? null,
    address: raw.address?.slice(0, 500) ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    source_type: source.adapter_type,
    source_id: `${source.id}:${raw.uid}`.slice(0, 500),
    source_url: raw.url ?? source.feed_url,
    source_metadata: {
      source_name: source.name,
      adapter_type: source.adapter_type,
      raw_uid: raw.uid,
      categories: raw.categories ?? [],
      ...(raw.metadata ?? {}),
    },
    organizer_name: raw.organizerName?.slice(0, 200) ?? null,
    moderation_status: "pending",
    publication_status: "draft",
    event_status: "scheduled",
    last_source_sync_at: now,
  };
}
