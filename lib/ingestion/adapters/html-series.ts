/**
 * HTML schedule / recurring series adapter for first-party organizer pages
 * that publish cadence or seasonal date lists without ICS/RSS.
 */

import { FEED_TIMEOUT_MS, fetchWithRetry } from "@/lib/ingestion/http";
import {
  parseMonthDayYearList,
  seriesOccurrenceUid,
  upcomingOccurrenceDates,
  ymdInTimeZone,
  ymdToIso,
  zonedLocalDateTime,
  type LocalYmd,
  type LocalTime,
} from "@/lib/ingestion/series-occurrences";
import { cleanIngestedText } from "@/lib/ingestion/text-clean";
import type {
  FetchEventsOptions,
  FetchEventsResult,
  RawSourceEvent,
  SourceAdapter,
  SourceRecord,
} from "@/lib/ingestion/types";

const TZ = "America/Los_Angeles";

function htmlToText(html: string): string {
  return (
    cleanIngestedText(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
    ) ?? ""
  );
}

function parseClockRange(
  text: string
): { start: LocalTime; end: LocalTime } | null {
  const m = text.match(
    /(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)\s*[-–—to]+\s*(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)/i
  );
  if (!m) return null;
  const to24 = (h: number, min: number, ap: string): LocalTime => {
    let hour = h % 12;
    if (/pm/i.test(ap)) hour += 12;
    return { hour, minute: min };
  };
  return {
    start: to24(Number(m[1]), Number(m[2] ?? 0), m[3]),
    end: to24(Number(m[4]), Number(m[5] ?? 0), m[6]),
  };
}

export type SeriesParseResult = {
  seriesKey: string;
  title: string;
  description: string;
  venueName: string;
  address: string;
  sourceUrl: string;
  timezone: string;
  categories: string[];
  dates: LocalYmd[];
  startTime: LocalTime;
  endTime: LocalTime;
  provenance: "organizer" | "directory";
  cadenceNote: string;
  organizerName?: string;
};

/** Camarillo Old Town seasonal 4th-Friday cruise list from merchant association page. */
export function parseCamarilloCruiseSchedule(
  html: string,
  pageUrl: string,
  from: LocalYmd = ymdInTimeZone(new Date())
): SeriesParseResult | null {
  const text = htmlToText(html);
  if (!/car\s*cruises?/i.test(text) || !/camarillo/i.test(text)) return null;

  const datesBlock =
    text.match(
      /(?:20\d{2}\s+)?Car\s+Cruise\s+Dates?:\s*([^.]+)/i
    )?.[1] ?? text;
  let dates = parseMonthDayYearList(datesBlock, from.year);
  if (!dates.length) {
    // Fallback: 4th Fridays March–October of the announced season year.
    const year =
      Number(text.match(/\b(20\d{2})\b/)?.[1] ?? from.year) || from.year;
    dates = upcomingOccurrenceDates(
      { kind: "nth_weekdays", weekday: "friday", nth: [4] },
      {
        from: { year, month: 3, day: 1 },
        limit: 8,
        monthsAhead: 8,
      }
    ).filter((d) => d.month >= 3 && d.month <= 10 && d.year === year);
  }

  const clock =
    parseClockRange(text.match(/Time:\s*([^\n]+)/i)?.[1] ?? text) ??
    parseClockRange(text) ?? {
      start: { hour: 16, minute: 0 },
      end: { hour: 19, minute: 0 },
    };

  const addressMatch = text.match(
    /(\d{3,5}\s+Ventura\s+Blvd[^,]*,\s*Camarillo,\s*CA\s*\d{5})/i
  );
  const address =
    addressMatch?.[1] ?? "2222 Ventura Blvd, Camarillo, CA 93010";

  const upcoming = upcomingOccurrenceDates(
    { kind: "explicit_dates", dates },
    { from, limit: 12 }
  );

  return {
    seriesKey: "camarillo-old-town-cruise",
    title: "Camarillo Old Town Friday Night Car Cruise",
    description:
      "Seasonal classic and collector car cruise on Ventura Blvd in Old Town Camarillo.",
    venueName: "Studio Channel Islands Art Center / Old Town Camarillo",
    address,
    sourceUrl: pageUrl,
    timezone: TZ,
    categories: ["cruise", "drive_cruise"],
    dates: upcoming,
    startTime: clock.start,
    endTime: clock.end,
    provenance: "organizer",
    cadenceNote: "seasonal 4th Friday Mar–Oct (dates from organizer page)",
    organizerName: "Camarillo Merchant Association",
  };
}

/** Conejo Valley Cars & Coffee — first & third Saturday from organizer site. */
export function parseConejoCarsCoffeeSchedule(
  html: string,
  pageUrl: string,
  from: LocalYmd = ymdInTimeZone(new Date())
): SeriesParseResult | null {
  const text = htmlToText(html);
  const blob = `${text}\n${html}`;
  if (
    !/conejo\s+valley/i.test(blob) &&
    !/cvcarsandcoffee|cvcc/i.test(blob) &&
    !/Conejo Valley Cars/i.test(blob)
  ) {
    return null;
  }
  const hasFirst = /\bfirst\b/i.test(blob);
  const hasThird = /\bthird\b/i.test(blob);
  const hasSaturday = /\bsaturday\b/i.test(blob);
  if (!(hasFirst && hasThird && hasSaturday)) return null;

  const address =
    blob.match(
      /(598\s*W\.?\s*Hillcrest\s*Dr\.?[^,<]{0,40}Thousand\s*Oaks[^,<]{0,20}(?:CA)?(?:\s*\d{5})?)/i
    )?.[1] ?? "598 W. Hillcrest Dr., Thousand Oaks, CA 91360";

  const dates = upcomingOccurrenceDates(
    { kind: "nth_weekdays", weekday: "saturday", nth: [1, 3] },
    { from, limit: 8, monthsAhead: 10 }
  );

  return {
    seriesKey: "conejo-valley-cars-coffee",
    title: "Conejo Valley Cars & Coffee",
    description:
      "Informal cars and coffee meetup every first and third Saturday at Firestone Tire / The Oaks Mall.",
    venueName: "Firestone Tire — Thousand Oaks Mall",
    address: cleanIngestedText(address.replace(/&nbsp;/gi, " ")) ?? address,
    sourceUrl: pageUrl,
    timezone: TZ,
    categories: ["cars and coffee"],
    dates,
    startTime: { hour: 7, minute: 0 },
    endTime: { hour: 10, minute: 0 },
    provenance: "organizer",
    cadenceNote: "1st & 3rd Saturday; rolling horizon 8",
    organizerName: "Conejo Valley Cars & Coffee",
  };
}

/**
 * Ventura Cars & Coffee — last Sunday monthly.
 * Prefer organizer-adjacent directory pages when no machine-readable first-party feed exists.
 */
export function parseVenturaCarsCoffeeSchedule(
  html: string,
  pageUrl: string,
  from: LocalYmd = ymdInTimeZone(new Date())
): SeriesParseResult | null {
  const text = htmlToText(html);
  const blob = `${text}\n${html}`;
  if (!/ventura/i.test(blob) || !/cars?\s*&\s*coffee|cars?\s+and\s+coffee/i.test(blob)) {
    return null;
  }
  if (!/last\s+sunday/i.test(blob)) return null;

  const clock =
    parseClockRange(blob) ?? {
      start: { hour: 7, minute: 0 },
      end: { hour: 10, minute: 0 },
    };

  const address =
    blob.match(
      /(4360\s+E(?:ast)?\.?\s+Main\s+(?:Street|St\.?)[^,]*,?\s*Ventura,?\s*CA(?:\s*\d{5})?)/i
    )?.[1] ?? "4360 East Main Street, Ventura, CA 93003";

  const host = (() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return "";
    }
  })();
  const provenance: "organizer" | "directory" =
    /lacar\.com|idrivesocal\.com|carcruisefinder\.com/i.test(host)
      ? "directory"
      : "organizer";

  const dates = upcomingOccurrenceDates(
    { kind: "last_weekday", weekday: "sunday" },
    { from, limit: 6, monthsAhead: 10 }
  );

  return {
    seriesKey: "ventura-cars-coffee",
    title: "Ventura Cars & Coffee",
    description:
      "Monthly cars and coffee meetup on the last Sunday at Coffee Bean & Tea Leaf / Office Depot lot.",
    venueName: "Coffee Bean & Tea Leaf — East Main Street",
    address: cleanIngestedText(address) ?? address,
    sourceUrl: pageUrl,
    timezone: TZ,
    categories: ["cars and coffee", "car_meet"],
    dates,
    startTime: clock.start,
    endTime: clock.end,
    provenance,
    cadenceNote: "last Sunday monthly; rolling horizon 6",
    organizerName: "Ventura Cars & Coffee",
  };
}

export function materializeSeriesEvents(
  series: SeriesParseResult
): RawSourceEvent[] {
  return series.dates.map((ymd) => {
    const startsAt = zonedLocalDateTime(ymd, series.startTime, series.timezone);
    const endsAt = zonedLocalDateTime(ymd, series.endTime, series.timezone);
    return {
      uid: seriesOccurrenceUid(series.seriesKey, ymd),
      title: series.title,
      description: series.description,
      startsAt,
      endsAt,
      timezone: series.timezone,
      venueName: series.venueName,
      address: series.address,
      url: series.sourceUrl,
      categories: series.categories,
      organizerName: series.organizerName ?? null,
      metadata: {
        provider: "html_series",
        series_key: series.seriesKey,
        occurrence_date: ymdToIso(ymd),
        provenance: series.provenance,
        cadence: series.cadenceNote,
      },
    } satisfies RawSourceEvent;
  });
}

export function parseHtmlSeriesPage(
  html: string,
  pageUrl: string,
  from?: LocalYmd
): SeriesParseResult | null {
  const host = (() => {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  if (/camarillomerchant\.org/i.test(host) || /camarillo-old-town-car-cruises/i.test(pageUrl)) {
    return parseCamarilloCruiseSchedule(html, pageUrl, from);
  }
  if (/cvcarsandcoffee\.com/i.test(host)) {
    return parseConejoCarsCoffeeSchedule(html, pageUrl, from);
  }
  if (
    /lacar\.com/i.test(host) ||
    /ventura-cars|cars-and-coffee-ventura|cars-coffee-ventura/i.test(pageUrl)
  ) {
    return parseVenturaCarsCoffeeSchedule(html, pageUrl, from);
  }

  // Generic fallbacks by content signatures.
  return (
    parseCamarilloCruiseSchedule(html, pageUrl, from) ??
    parseConejoCarsCoffeeSchedule(html, pageUrl, from) ??
    parseVenturaCarsCoffeeSchedule(html, pageUrl, from)
  );
}

export class HtmlSeriesAdapter implements SourceAdapter {
  readonly type = "html_series" as const;

  async fetchEvents(
    source: SourceRecord,
    options: FetchEventsOptions = {}
  ): Promise<FetchEventsResult> {
    if (!source.feed_url) {
      throw new Error(`Source ${source.name} has no feed_url`);
    }

    const res = await fetchWithRetry({
      url: source.feed_url,
      timeoutMs: FEED_TIMEOUT_MS,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "OverdriveRadarIngestion/1.0",
      },
      onRetry: options.onRetry,
    });
    const html = await res.text();
    const series = parseHtmlSeriesPage(html, source.feed_url);
    if (!series) {
      return {
        events: [],
        feedNote: "html_series: schedule pattern not recognized",
      };
    }
    const events = materializeSeriesEvents(series);
    return {
      events,
      feedNote: `html_series provenance=${series.provenance} cadence=${series.cadenceNote} occurrences=${events.length}`,
    };
  }
}
