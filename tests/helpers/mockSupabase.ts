import type { EventRecord } from "@/lib/events/types";
import type { EventsQueryClient } from "@/lib/events/queries";

function field(row: EventRecord, column: string): unknown {
  return (row as unknown as Record<string, unknown>)[column];
}

function filterViewport(
  rows: EventRecord[],
  args: Record<string, unknown>
): EventRecord[] {
  const experience = args.p_experience;
  const minLng = Number(args.p_min_lng);
  const minLat = Number(args.p_min_lat);
  const maxLng = Number(args.p_max_lng);
  const maxLat = Number(args.p_max_lat);
  const now = Date.now();

  return rows.filter((row) => {
    if (row.experience !== experience) return false;
    if (row.publication_status !== "published") return false;
    if (row.moderation_status !== "approved") return false;
    if (row.event_status === "cancelled") return false;
    if (row.latitude == null || row.longitude == null) return false;
    const endMs = new Date(row.ends_at ?? row.starts_at).getTime();
    if (endMs < now) return false;
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
  });
}

function roughSimilarity(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (!right) return 0;
  if (left.includes(right) || right.includes(left)) return 0.5;
  const shared = [...right].filter((ch) => left.includes(ch)).length;
  return shared / Math.max(right.length, 1);
}

export function createMockEventsClient(rows: EventRecord[]): EventsQueryClient {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "get_events_in_viewport") {
        return { data: filterViewport(rows, args), error: null };
      }

      if (fn === "search_events") {
        const query = String(args.p_query ?? "");
        let data = filterViewport(rows, args);
        if (query) {
          data = data.filter((row) => {
            const titleScore = roughSimilarity(row.title, query);
            const venueScore = roughSimilarity(row.venue_name ?? "", query);
            return titleScore > 0.2 || venueScore > 0.2;
          });
        }
        return { data, error: null };
      }

      return {
        data: null,
        error: { message: "unknown rpc", code: "PGRST202" },
      };
    },
    from: (_table: string) => {
      let filtered = [...rows];

      const api: Record<string, unknown> = {};
      api.select = () => api;
      api.eq = (column: string, value: unknown) => {
        filtered = filtered.filter((r) => field(r, column) === value);
        return api;
      };
      api.neq = (column: string, value: unknown) => {
        filtered = filtered.filter((r) => field(r, column) !== value);
        return api;
      };
      api.not = (column: string, op: string) => {
        if (op === "is") {
          filtered = filtered.filter((r) => field(r, column) != null);
        }
        return api;
      };
      api.maybeSingle = async () => ({
        data: filtered[0] ?? null,
        error: null,
      });
      api.then = (
        resolve: (v: { data: EventRecord[]; error: null }) => unknown
      ) => Promise.resolve({ data: filtered, error: null }).then(resolve);

      return api;
    },
  };
}

export function sampleEvents(): EventRecord[] {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  return [
    {
      id: "od-1",
      experience: "overdrive",
      overdrive_category: "car_meet",
      event_discovery_category: null,
      title: "Overdrive Meet A",
      description: null,
      starts_at: future,
      ends_at: null,
      timezone: "America/Los_Angeles",
      venue_name: "Simi Lot",
      address: null,
      is_free: true,
      price_amount: null,
      price_currency: "USD",
      latitude: 34.27,
      longitude: -118.78,
      image_url: null,
      source_url: null,
      organizer_name: "Test",
      event_status: "scheduled",
      publication_status: "published",
      moderation_status: "approved",
    },
    {
      id: "od-cancelled",
      experience: "overdrive",
      overdrive_category: "car_show",
      event_discovery_category: null,
      title: "Cancelled Show",
      description: null,
      starts_at: future,
      ends_at: null,
      timezone: null,
      venue_name: null,
      address: null,
      is_free: false,
      price_amount: 20,
      price_currency: "USD",
      latitude: 34.27,
      longitude: -118.78,
      image_url: null,
      source_url: null,
      organizer_name: null,
      event_status: "cancelled",
      publication_status: "published",
      moderation_status: "approved",
    },
    {
      id: "od-draft",
      experience: "overdrive",
      overdrive_category: "other",
      event_discovery_category: null,
      title: "Draft Event",
      description: null,
      starts_at: future,
      ends_at: null,
      timezone: null,
      venue_name: null,
      address: null,
      is_free: null,
      price_amount: null,
      price_currency: "USD",
      latitude: 34.27,
      longitude: -118.78,
      image_url: null,
      source_url: null,
      organizer_name: null,
      event_status: "scheduled",
      publication_status: "draft",
      moderation_status: "pending",
    },
    {
      id: "od-past",
      experience: "overdrive",
      overdrive_category: "drive_cruise",
      event_discovery_category: null,
      title: "Past Cruise",
      description: null,
      starts_at: past,
      ends_at: past,
      timezone: null,
      venue_name: null,
      address: null,
      is_free: true,
      price_amount: null,
      price_currency: "USD",
      latitude: 34.27,
      longitude: -118.78,
      image_url: null,
      source_url: null,
      organizer_name: null,
      event_status: "scheduled",
      publication_status: "published",
      moderation_status: "approved",
    },
    {
      id: "od-outside",
      experience: "overdrive",
      overdrive_category: "track_event",
      event_discovery_category: null,
      title: "Far Away Track",
      description: null,
      starts_at: future,
      ends_at: null,
      timezone: null,
      venue_name: null,
      address: null,
      is_free: false,
      price_amount: null,
      price_currency: "USD",
      latitude: 40.0,
      longitude: -120.0,
      image_url: null,
      source_url: null,
      organizer_name: null,
      event_status: "scheduled",
      publication_status: "published",
      moderation_status: "approved",
    },
    {
      id: "ed-1",
      experience: "event_discovery",
      overdrive_category: null,
      event_discovery_category: "family",
      title: "Discovery Picnic",
      description: null,
      starts_at: future,
      ends_at: null,
      timezone: "America/Los_Angeles",
      venue_name: "Park",
      address: null,
      is_free: false,
      price_amount: 12.5,
      price_currency: "USD",
      latitude: 34.27,
      longitude: -118.78,
      image_url: null,
      source_url: null,
      organizer_name: "Test",
      event_status: "scheduled",
      publication_status: "published",
      moderation_status: "approved",
    },
    {
      id: "ed-2",
      experience: "event_discovery",
      overdrive_category: null,
      event_discovery_category: "outdoor",
      title: "Discovery Hike",
      description: null,
      starts_at: future,
      ends_at: null,
      timezone: null,
      venue_name: null,
      address: null,
      is_free: false,
      price_amount: null,
      price_currency: "USD",
      latitude: 34.28,
      longitude: -118.79,
      image_url: null,
      source_url: null,
      organizer_name: null,
      event_status: "scheduled",
      publication_status: "published",
      moderation_status: "approved",
    },
  ];
}
