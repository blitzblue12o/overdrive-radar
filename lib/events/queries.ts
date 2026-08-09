import type { ExperienceId } from "@/lib/config/experiences";
import { bboxFromCenter, intersectBbox } from "@/lib/events/filters";
import type { BBox, EventRecord } from "@/lib/events/types";

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
    const startMs = params.dateRange.start.getTime();
    const endMs = params.dateRange.end.getTime();
    next = next.filter((row) => {
      const t = new Date(row.starts_at).getTime();
      return t >= startMs && t < endMs;
    });
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
 * Uses search_events when any filter is active; otherwise get_events_in_viewport.
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
  const filtersActive = Boolean(
    query ||
      params.dateRange ||
      (params.categories && params.categories.length > 0) ||
      params.distanceMiles
  );

  const bbox = resolveQueryBbox(params);

  if (!filtersActive) {
    const rows = await getEventsInViewport(experience, bbox, client);
    return applyPostFilters(rows, experience, params);
  }

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
