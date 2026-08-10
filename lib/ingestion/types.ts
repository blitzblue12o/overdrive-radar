import type { ExperienceId } from "@/lib/config/experiences";

export type AdapterType = "ics" | "rss" | "motorsportreg" | "librarycalendar";

export type OverdriveCategory =
  | "car_meet"
  | "car_show"
  | "drive_cruise"
  | "autocross"
  | "track_event"
  | "other";

export type EventDiscoveryCategory =
  | "family"
  | "community"
  | "arts_and_culture"
  | "outdoor"
  | "food_and_markets"
  | "entertainment"
  | "educational";

/** Raw event as returned by a feed adapter (pre-normalization). */
export type RawSourceEvent = {
  uid: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  timezone?: string | null;
  venueName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  url?: string | null;
  categories?: string[];
  organizerName?: string | null;
  /** Opaque provider payload for debugging / reprocessing. */
  metadata?: Record<string, unknown>;
};

export type SourceRecord = {
  id: string;
  name: string;
  experience: ExperienceId;
  adapter_type: AdapterType;
  feed_url: string | null;
  active: boolean;
  default_category_overdrive: OverdriveCategory | null;
  default_category_event_discovery: EventDiscoveryCategory | null;
  /** Optional locality hint for Mapbox queries (not persisted on events). */
  geocode_context?: string | null;
  /** Optional canonical facility address used as the Mapbox query target. */
  geocode_override?: string | null;
  /**
   * Optional declarative facility map for multi-campus feeds.
   * Matched against venue/address (case-insensitive substring); first match wins.
   * Takes precedence over geocode_override when matched.
   */
  location_overrides?: LocationOverride[] | null;
  /** EventDiscovery publication trust: probation (default) | trusted. */
  publication_policy?: "probation" | "trusted" | null;
};

/** Source-configured facility pin / geocode target (not source-name branched). */
export type LocationOverride = {
  /** Substring matched against venue_name / address (case-insensitive). */
  match: string;
  /** Authoritative street address used for Mapbox when lat/lng omitted. */
  address: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type NormalizedEventInsert = {
  experience: ExperienceId;
  overdrive_category: OverdriveCategory | null;
  event_discovery_category: EventDiscoveryCategory | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source_type: AdapterType;
  source_id: string;
  source_url: string | null;
  source_metadata: Record<string, unknown>;
  organizer_name: string | null;
  moderation_status: "pending";
  publication_status: "draft";
  event_status: "scheduled";
  last_source_sync_at: string;
};

export interface SourceAdapter {
  readonly type: AdapterType;
  fetchEvents(source: SourceRecord): Promise<RawSourceEvent[]>;
}

export type SyncSourceResult = {
  sourceId: string;
  sourceName: string;
  status: "success" | "partial_failure" | "failure";
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
};

export type SyncRunResult = {
  startedAt: string;
  finishedAt: string;
  sources: SyncSourceResult[];
};
