import type {
  RawSourceEvent,
  SourceAdapter,
  SourceRecord,
} from "@/lib/ingestion/types";

/** Default discovery horizon for day-feed enumeration. */
export const LIBRARY_CALENDAR_HORIZON_DAYS = 90;

type SchemaOrgEvent = {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?:
      | string
      | {
          streetAddress?: string;
          addressLocality?: string;
          addressRegion?: string;
          postalCode?: string;
          addressCountry?: string;
        };
  };
  organizer?: { name?: string; url?: string };
  image?: string | string[];
};

/**
 * Extract event pathnames from a LibraryCalendar day/list HTML fragment.
 * Prefer hrefs on `.lc-event__link` / `/event/...` paths over visual text.
 */
export function extractLibraryCalendarEventPaths(html: string): string[] {
  const paths = new Set<string>();
  const re = /href="(\/event\/[^"#?]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1].trim();
    if (path) paths.add(path);
  }
  return Array.from(paths);
}

/** Stable uid from `/event/english-conversation-group-131` → slug. */
export function libraryCalendarUidFromPath(path: string): string | null {
  const m = path.trim().match(/^\/event\/([^/?#]+)$/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function typeIsEvent(type: string | string[] | undefined): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => /(^|\/)Event$/i.test(t));
}

export function extractJsonLdEvents(html: string): SchemaOrgEvent[] {
  const out: SchemaOrgEvent[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const obj = node as SchemaOrgEvent & { "@graph"?: unknown[] };
        if (Array.isArray(obj["@graph"])) {
          for (const g of obj["@graph"]) {
            if (g && typeof g === "object" && typeIsEvent((g as SchemaOrgEvent)["@type"])) {
              out.push(g as SchemaOrgEvent);
            }
          }
        } else if (typeIsEvent(obj["@type"])) {
          out.push(obj);
        }
      }
    } catch {
      // Malformed JSON-LD blocks are skipped.
    }
  }
  return out;
}

type PostalAddress = {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
};

function formatPostalAddress(
  address: string | PostalAddress | null | undefined
): string | null {
  if (!address) return null;
  if (typeof address === "string") {
    const t = address.trim();
    return t || null;
  }
  const parts = [
    address.streetAddress,
    [address.addressLocality, address.addressRegion]
      .filter(Boolean)
      .join(", "),
    address.postalCode,
    address.addressCountry && address.addressCountry !== "US"
      ? address.addressCountry
      : null,
  ]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function parseOffsetDate(value: string | undefined): {
  date: Date | null;
  allDay: boolean;
} {
  if (!value?.trim()) return { date: null, allDay: false };
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    // Align with ICS VALUE=DATE semantics: UTC noon of the calendar day.
    return { date: new Date(Date.UTC(y, m - 1, d, 12, 0, 0)), allDay: true };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { date: null, allDay: false };
  return { date, allDay: false };
}

function extractRoomName(html: string): string | null {
  const m = html.match(
    /class="[^"]*lc-event-room[^"]*"[^>]*>\s*([\s\S]*?)<\//i
  );
  if (!m?.[1]) return null;
  const room = stripHtml(m[1]);
  return room || null;
}

function extractAudienceCategories(html: string): string[] {
  const cats = new Set<string>();
  const re =
    /This event is in the\s*&quot;([^&]+)&quot;\s*group|This event is in the\s*"([^"]+)"\s*group/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const c = (m[1] || m[2] || "").trim();
    if (c) cats.add(c);
  }
  // Detail pages expose age groups as filter links.
  const ageRe =
    /href="[^"]*age_groups[^"]*"[^>]*>\s*([^<]{2,40})\s*</gi;
  while ((m = ageRe.exec(html))) {
    const c = m[1]?.trim();
    if (c) cats.add(c);
  }
  return Array.from(cats);
}

function isCancelledStatus(status: string | undefined): boolean {
  if (!status) return false;
  return /EventCancelled/i.test(status);
}

function isVirtualAttendance(mode: string | undefined): boolean {
  if (!mode) return false;
  return /OnlineEventAttendanceMode/i.test(mode);
}

/**
 * Parse a LibraryCalendar event detail page into a RawSourceEvent.
 * Prefers schema.org JSON-LD; room name is a structured HTML field when present.
 */
export function parseLibraryCalendarEventPage(
  html: string,
  pageUrl: string
): RawSourceEvent | null {
  const path = (() => {
    try {
      return new URL(pageUrl).pathname;
    } catch {
      return pageUrl;
    }
  })();
  const uid = libraryCalendarUidFromPath(path);
  if (!uid) return null;

  const events = extractJsonLdEvents(html);
  const schema = events[0];
  if (!schema?.name?.trim() || !schema.startDate) return null;

  const start = parseOffsetDate(schema.startDate);
  if (!start.date) return null;
  const end = parseOffsetDate(schema.endDate);

  const cancelled = isCancelledStatus(schema.eventStatus);
  const room = extractRoomName(html);
  const placeName = schema.location?.name?.trim() || null;
  const venueName = [room, placeName].filter(Boolean).join(", ") || placeName;
  const address = formatPostalAddress(schema.location?.address) || placeName;
  const categories = extractAudienceCategories(html);
  const virtual = isVirtualAttendance(schema.eventAttendanceMode);

  const description = schema.description
    ? stripHtml(schema.description)
    : null;

  return {
    uid,
    title: stripHtml(schema.name).slice(0, 500),
    description,
    startsAt: start.date,
    endsAt: end.date ?? null,
    timezone: "America/Los_Angeles",
    venueName: virtual && !venueName ? "Online" : venueName,
    address: virtual && !address ? "Online" : address,
    latitude: null,
    longitude: null,
    url: pageUrl,
    categories,
    organizerName: schema.organizer?.name?.trim() || null,
    metadata: {
      provider: "librarycalendar",
      status: cancelled
        ? schema.eventStatus ?? "CANCELLED"
        : schema.eventStatus ?? null,
      eventAttendanceMode: schema.eventAttendanceMode ?? null,
      ...(start.allDay || end.allDay ? { allDay: true } : {}),
      ...(cancelled ? { cancelled: true } : {}),
      ...(virtual ? { virtual: true } : {}),
    },
  };
}

/** Audience labels from day-feed teaser cards, keyed by event path. */
export function extractLibraryCalendarPathCategories(
  html: string
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const articles = html.split(/<article\b/i).slice(1);
  for (const chunk of articles) {
    const path = chunk.match(/href="(\/event\/[^"#?]+)"/i)?.[1];
    if (!path) continue;
    const cats = extractAudienceCategories(chunk);
    // Also accept the compact teaser color label block.
    const label = chunk.match(
      /lc-event-info__item--colors[^>]*>\s*([A-Za-z][\w\s/&-]{1,40})\s*</i
    )?.[1]?.trim();
    if (label) cats.push(label);
    const uniq = Array.from(
      new Set(cats.map((c) => c.trim()).filter(Boolean))
    );
    if (uniq.length) map.set(path, uniq);
  }
  return map;
}

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addUtcDays(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

export function libraryCalendarDayFeedUrl(
  baseUrl: string,
  dayYmd: string
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/events/feed/html`);
  url.searchParams.set("_wrapper_format", "lc_calendar_feed");
  url.searchParams.set("current_date", dayYmd);
  url.searchParams.set("ongoing_events", "hide");
  return url.toString();
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * LibraryCalendar / Communico Drupal calendars.
 * Discovery: day HTML feed links → detail pages → schema.org JSON-LD.
 */
export class LibraryCalendarAdapter implements SourceAdapter {
  readonly type = "librarycalendar" as const;

  async fetchEvents(source: SourceRecord): Promise<RawSourceEvent[]> {
    if (!source.feed_url) {
      throw new Error(`Source ${source.name} has no feed_url`);
    }

    const base = new URL(source.feed_url);
    const origin = `${base.protocol}//${base.host}`;
    const horizon = LIBRARY_CALENDAR_HORIZON_DAYS;
    const start = new Date();
    // Enumerate by UTC calendar days; feed keys are civil dates in site TZ,
    // which for CA sources matches local dates closely enough for discovery.
    const startDay = new Date(
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
    );

    const pathSet = new Set<string>();
    const categoryByPath = new Map<string, string[]>();
    for (let i = 0; i < horizon; i++) {
      const day = ymdUtc(addUtcDays(startDay, i));
      const feedUrl = libraryCalendarDayFeedUrl(origin, day);
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "OverdriveRadarIngestion/1.0",
          Accept: "text/html",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(
          `LibraryCalendar day feed failed (${res.status}) for ${feedUrl}`
        );
      }
      const html = await res.text();
      for (const path of extractLibraryCalendarEventPaths(html)) {
        pathSet.add(path);
      }
      for (const [path, cats] of Array.from(
        extractLibraryCalendarPathCategories(html).entries()
      )) {
        const prev = categoryByPath.get(path) ?? [];
        categoryByPath.set(
          path,
          Array.from(
            new Set([...prev, ...cats].map((c) => c.trim()).filter(Boolean))
          )
        );
      }
    }

    const paths = Array.from(pathSet);
    const parsed = await mapPool(paths, 5, async (path) => {
      const pageUrl = new URL(path, origin).toString();
      const res = await fetch(pageUrl, {
        headers: {
          "User-Agent": "OverdriveRadarIngestion/1.0",
          Accept: "text/html",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(
          `[librarycalendar] detail fetch ${res.status} for ${pageUrl}`
        );
        return null;
      }
      const html = await res.text();
      try {
        const event = parseLibraryCalendarEventPage(html, pageUrl);
        if (!event) return null;
        const fromFeed = categoryByPath.get(path) ?? [];
        if (fromFeed.length) {
          event.categories = Array.from(
            new Set([...(event.categories ?? []), ...fromFeed])
          );
        }
        return event;
      } catch (err) {
        console.warn(
          `[librarycalendar] parse failed for ${pageUrl}`,
          err instanceof Error ? err.message : err
        );
        return null;
      }
    });

    // Drop cancelled + malformed; keep deterministic order by start then uid.
    return parsed
      .filter((e): e is RawSourceEvent => Boolean(e))
      .filter((e) => e.metadata?.cancelled !== true)
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.uid.localeCompare(b.uid)
      );
  }
}
