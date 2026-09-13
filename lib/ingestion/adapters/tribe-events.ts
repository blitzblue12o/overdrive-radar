/**
 * Generic WordPress / The Events Calendar (Tribe) REST adapter.
 * Prefer /wp-json/tribe/events/v1/events over brittle HTML scrapes.
 */

import { FEED_TIMEOUT_MS, fetchWithRetry } from "@/lib/ingestion/http";
import {
  inferOverdriveCategoryTokens,
  isAutomotiveOverdriveCandidate,
} from "@/lib/ingestion/overdrive-relevance";
import { zonedLocalDateTime } from "@/lib/ingestion/series-occurrences";
import { cleanIngestedText } from "@/lib/ingestion/text-clean";
import type {
  FetchEventsOptions,
  FetchEventsResult,
  RawSourceEvent,
  SourceAdapter,
  SourceRecord,
} from "@/lib/ingestion/types";

const DEFAULT_TZ = "America/Los_Angeles";

export type TribeEventsApiEvent = {
  id?: number | string;
  title?: string;
  description?: string;
  url?: string;
  website?: string;
  start_date?: string;
  end_date?: string;
  timezone?: string;
  venue?: {
    venue?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  categories?: Array<{ name?: string }>;
};

export type TribeEventsApiResponse = {
  events?: TribeEventsApiEvent[];
  total?: number;
  total_pages?: number;
  next_rest_url?: string | null;
};

/** Resolve tribe events REST endpoint from a site or explicit feed URL. */
export function resolveTribeEventsApiUrl(feedUrl: string): string {
  const trimmed = feedUrl.trim();
  if (/\/wp-json\/tribe\/events\/v1\/events/i.test(trimmed)) {
    return trimmed;
  }
  const base = trimmed.replace(/\/$/, "");
  return `${base}/wp-json/tribe/events/v1/events`;
}

function stripHtml(value: string): string {
  return (
    cleanIngestedText(
      value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    ) ?? ""
  );
}

function parseTribeDate(value: string | undefined): Date | null {
  if (!value) return null;
  const m = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  return zonedLocalDateTime(
    { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) },
    { hour: Number(m[4]), minute: Number(m[5]) },
    DEFAULT_TZ
  );
}

function venueAddress(venue: TribeEventsApiEvent["venue"]): string | null {
  if (!venue) return null;
  const parts = [venue.address, venue.city, venue.state, venue.zip]
    .map((p) => (p ? stripHtml(String(p)) : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function mapTribeEventToRaw(
  event: TribeEventsApiEvent,
  opts?: { filterAutomotive?: boolean }
): RawSourceEvent | null {
  const title = stripHtml(event.title ?? "");
  if (!title) return null;
  const description = event.description
    ? stripHtml(event.description)
    : null;
  if (opts?.filterAutomotive !== false) {
    if (!isAutomotiveOverdriveCandidate(title, description)) return null;
  }

  const startsAt = parseTribeDate(event.start_date);
  if (!startsAt) return null;
  const endsAt = parseTribeDate(event.end_date);

  const id = event.id != null ? String(event.id) : null;
  const startKey =
    event.start_date?.slice(0, 10) ?? startsAt.toISOString().slice(0, 10);
  const uid = id
    ? `tec:${id}`
    : `tec:${title.toLowerCase().replace(/\s+/g, "-")}:${startKey}`;

  const cats = (event.categories ?? [])
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n));
  const inferred = inferOverdriveCategoryTokens(title, description);

  const venueName = event.venue?.venue
    ? stripHtml(event.venue.venue)
    : null;
  const address = venueAddress(event.venue);

  return {
    uid,
    title,
    description,
    startsAt,
    endsAt,
    timezone: event.timezone || DEFAULT_TZ,
    venueName,
    address,
    url: event.url || event.website || null,
    categories: [...inferred, ...cats],
    organizerName: null,
    metadata: {
      provider: "tribe_events",
      tribe_event_id: id,
      automotive_filtered: opts?.filterAutomotive !== false,
    },
  };
}

export function filterTribeEventsAutomotive(
  events: TribeEventsApiEvent[]
): { kept: RawSourceEvent[]; fetched: number; relevant: number } {
  const kept: RawSourceEvent[] = [];
  for (const event of events) {
    const mapped = mapTribeEventToRaw(event, { filterAutomotive: true });
    if (mapped) kept.push(mapped);
  }
  return { kept, fetched: events.length, relevant: kept.length };
}

async function fetchTribePage(
  url: string,
  onRetry?: (attempt: number, err: unknown) => void
): Promise<TribeEventsApiResponse> {
  const res = await fetchWithRetry({
    url,
    timeoutMs: FEED_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "User-Agent": "OverdriveRadarIngestion/1.0",
    },
    onRetry,
  });
  return (await res.json()) as TribeEventsApiResponse;
}

export class TribeEventsAdapter implements SourceAdapter {
  readonly type = "tribe_events" as const;

  async fetchEvents(
    source: SourceRecord,
    options: FetchEventsOptions = {}
  ): Promise<FetchEventsResult> {
    if (!source.feed_url) {
      throw new Error(`Source ${source.name} has no feed_url`);
    }

    const startDate = new Date().toISOString().slice(0, 10);
    const apiBase = resolveTribeEventsApiUrl(source.feed_url);
    const initial = new URL(apiBase);
    if (!initial.searchParams.has("per_page")) {
      initial.searchParams.set("per_page", "50");
    }
    if (!initial.searchParams.has("start_date")) {
      initial.searchParams.set("start_date", startDate);
    }

    const all: TribeEventsApiEvent[] = [];
    let nextUrl: string | null = initial.toString();
    let pages = 0;
    while (nextUrl && pages < 10) {
      pages += 1;
      const payload = await fetchTribePage(nextUrl, options.onRetry);
      const batch = payload.events ?? [];
      all.push(...batch);
      nextUrl = payload.next_rest_url ?? null;
      if (!batch.length) break;
    }

    const { kept, fetched, relevant } = filterTribeEventsAutomotive(all);
    return {
      events: kept,
      feedNote: `tribe_events fetched=${fetched} relevant=${relevant} pages=${pages}`,
    };
  }
}
