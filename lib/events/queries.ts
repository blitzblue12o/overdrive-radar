import type { ExperienceId } from "@/lib/config/experiences";
import { bboxFromCenter, intersectBbox } from "@/lib/events/filters";
import { eventOverlapsDateRange } from "@/lib/events/occurrence";
import {
  resolveEventAllDay,
  type BBox,
  type EventRecord,
} from "@/lib/events/types";

export const EVENT_SELECT = [
  "id",
  "experience",
  "overdrive_category",
  "event_discovery_category",
  "title",
  "description",
  "starts_at",
  "ends_at",
  "timezone",
  "venue_name",
  "address",
  "is_free",
  "price_amount",
  "price_currency",
  "latitude",
  "longitude",
  "image_url",
  "source_url",
  "organizer_name",
  "event_status",
  "publication_status",
  "moderation_status",
  "source_metadata",
].join(", ");

type ChainResult = PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;

type QueryChain = {
  select: (columns: string) => QueryChain;
  eq: (column: string, value: unknown) => QueryChain;
  neq: (column: string, value: unknown) => QueryChain;
  not: (column: string, op: string, value: unknown) => QueryChain;
  maybeSingle: () => ChainResult;
} & ChainResult;

export type EventsQueryClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
  from: (table: string) => QueryChain;
};

export type GetEventsParams = {
  bbox: BBox;
  query?: string;
  dateRange?: { start: Date; end: Date };
  distanceMiles?: number;
  categories?: string[];
  /** Preferred center for distance radius (user location or map center). */
  center?: { lat: number; lng: number };
};

function categoryOf(row: EventRecord): string | null {
  return row.experience === "overdrive"
    ? row.overdrive_category
    : row.event_discovery_category;
}

function applyPostFilters(
  rows: EventRecord[],
  experience: ExperienceId,
  params: GetEventsParams
): EventRecord[] {
  let next = rows.filter((row) => row.experience === experience);

  if (params.dateRange) {
    const range = params.dateRange;
    next = next.filter((row) =>
      eventOverlapsDateRange(
        {
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          timezone: row.timezone,
          all_day: resolveEventAllDay(row),
        },
        range
      )
    );
  }

  if (params.categories && params.categories.length > 0) {
    const set = new Set(params.categories);
    next = next.filter((row) => {
      const cat = categoryOf(row);
      return cat != null && set.has(cat);
    });
  }

  return next;
}

/** Final ranked-text cap — applied only AFTER date/category filters. */
export const TEXT_SEARCH_RESULT_LIMIT = 50;

function textMatchScore(row: EventRecord, query: string): number {
  const q = query.toLowerCase();
  const title = row.title.toLowerCase();
  const venue = (row.venue_name ?? "").toLowerCase();
  if (!q) return 0;
  if (title === q || venue === q) return 1;
  if (title.includes(q) || venue.includes(q)) return 0.6;
  let shared = 0;
  for (let i = 0; i < q.length; i++) {
    const ch = q.charAt(i);
    if (title.includes(ch) || venue.includes(ch)) shared += 1;
  }
  return shared / Math.max(q.length, 1);
}

/** In-process text match used when post-filters must run before any result cap. */
export function filterEventsByTextQuery(
  rows: EventRecord[],
  query: string
): EventRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows
    .map((row) => ({ row, score: textMatchScore(row, q) }))
    .filter(({ score }) => score > 0.2)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(a.row.starts_at).getTime() - new Date(b.row.starts_at).getTime()
      );
    })
    .map(({ row }) => row);
}

function resolveQueryBbox(params: GetEventsParams): BBox {
  if (!params.distanceMiles || !params.center) {
    return params.bbox;
  }
  const radius = bboxFromCenter(params.center, params.distanceMiles);
  const clipped = intersectBbox(params.bbox, radius);
  // Degenerate intersect (no overlap) → use radius alone so distance still applies.
  if (clipped.minLng >= clipped.maxLng || clipped.minLat >= clipped.maxLat) {
    return radius;
  }
  return clipped;
}

/**
 * Unified discovery query. `experience` is required on every call.
 *
 * Important: `search_events` applies LIMIT 50 before client post-filters.
 * Distance / date / category paths therefore use the unscoped viewport RPC
 * (bbox already clipped to radius) and apply filters before any result cap.
 * Text search alone may still use ranked `search_events`; text+date/category
 * uses viewport → text match → post-filters → TEXT_SEARCH_RESULT_LIMIT.
 */
export async function getEvents(
  experience: ExperienceId,
  params: GetEventsParams,
  client: EventsQueryClient
): Promise<EventRecord[]> {
  if (!experience) {
    throw new Error("experience is required");
  }

  const query = params.query?.trim() ?? "";
  const hasTextQuery = Boolean(query);
  const hasPostFilters = Boolean(
    params.dateRange || (params.categories && params.categories.length > 0)
  );
  const bbox = resolveQueryBbox(params);

  // No text query: never hit search_events (its LIMIT 50 is premature for
  // distance/date/category). Viewport has no result cap.
  if (!hasTextQuery) {
    const rows = await getEventsInViewport(experience, bbox, client);
    return applyPostFilters(rows, experience, params);
  }

  // Text + date/category: filter completely, then cap ranked matches.
  if (hasPostFilters) {
    const rows = await getEventsInViewport(experience, bbox, client);
    const matched = filterEventsByTextQuery(rows, query);
    return applyPostFilters(matched, experience, params).slice(
      0,
      TEXT_SEARCH_RESULT_LIMIT
    );
  }

  // Text-only: ranked RPC limit is acceptable (no post-filter loss).
  const rows = await searchEvents(experience, query, bbox, client);
  return applyPostFilters(rows, experience, params);
}

export async function searchEvents(
  experience: ExperienceId,
  query: string,
  bbox: BBox,
  client: EventsQueryClient
): Promise<EventRecord[]> {
  if (!experience) {
    throw new Error("experience is required");
  }

  const { minLng, minLat, maxLng, maxLat } = bbox;
  const { data, error } = await client.rpc("search_events", {
    p_experience: experience,
    p_query: query || "",
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message?.includes("search_events")) {
      // Fallback: viewport fetch + in-process title/venue contains match
      const base = await getEventsInViewport(experience, bbox, client);
      if (!query) return base;
      const q = query.toLowerCase();
      return base.filter(
        (row) =>
          row.title.toLowerCase().includes(q) ||
          (row.venue_name ?? "").toLowerCase().includes(q)
      );
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as EventRecord[]).filter(
    (row) => row.experience === experience
  );
}

/**
 * Fetch published, approved, non-cancelled, upcoming events for one experience
 * inside a viewport bounding box. `experience` is required on every events query.
 */
export async function getEventsInViewport(
  experience: ExperienceId,
  bbox: BBox,
  client: EventsQueryClient
): Promise<EventRecord[]> {
  if (!experience) {
    throw new Error("experience is required");
  }

  const { minLng, minLat, maxLng, maxLat } = bbox;

  const { data, error } = await client.rpc("get_events_in_viewport", {
    p_experience: experience,
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
  });

  if (error) {
    if (
      error.code === "PGRST202" ||
      error.message?.includes("get_events_in_viewport")
    ) {
      return getEventsInViewportFallback(experience, bbox, client);
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as EventRecord[];
  return rows.filter((row) => row.experience === experience);
}

async function getEventsInViewportFallback(
  experience: ExperienceId,
  bbox: BBox,
  client: EventsQueryClient
): Promise<EventRecord[]> {
  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .eq("experience", experience)
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .neq("event_status", "cancelled")
    .not("location", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const now = Date.now();
  const { minLng, minLat, maxLng, maxLat } = bbox;

  return ((data ?? []) as EventRecord[])
    .filter((row) => row.experience === experience)
    .filter((row) => {
      const endMs = new Date(row.ends_at ?? row.starts_at).getTime();
      return endMs >= now;
    })
    .filter((row) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
    });
}

export async function getEventById(
  experience: ExperienceId,
  id: string,
  client: EventsQueryClient
): Promise<EventRecord | null> {
  if (!experience) {
    throw new Error("experience is required");
  }

  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .eq("experience", experience)
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  const row = data as EventRecord;
  if (row.experience !== experience) return null;
  return row;
}
