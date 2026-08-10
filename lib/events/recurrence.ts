import { FILTER_TIMEZONE } from "@/lib/events/filters";
import { normalizeDisplayText } from "@/lib/events/display-text";
import {
  addCalendarDays,
  compareYmd,
  type Ymd,
  zonedYmd,
} from "@/lib/events/occurrence";

export type RecurrenceKind = "weekly" | "biweekly" | "multiple_dates";

export type RecurrenceSibling = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  all_day?: boolean | null;
  title: string;
};

export type RecurrencePresentation = {
  kind: RecurrenceKind;
  /** Short list/detail label: Weekly | Every 2 weeks | Multiple dates */
  label: string;
  /** Count of matching occurrences in the active filtered result set. */
  occurrenceCount: number;
  /** Chronological siblings after the current occurrence (filtered set). */
  upcomingSiblings: RecurrenceSibling[];
  /** Total siblings excluding current (filtered set). */
  siblingCount: number;
};

export type RecurrenceInput = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  timezone?: string | null;
  venue_name?: string | null;
  all_day?: boolean | null;
  /** Stable source identity (e.g. source_metadata.source_name). */
  source_key?: string | null;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function normalizeRecurrenceText(
  value: string | null | undefined
): string {
  const n = normalizeDisplayText(value);
  return n ? n.toLowerCase() : "";
}

export function resolveEventTimeZone(timezone?: string | null): string {
  const tz = timezone?.trim();
  return tz || FILTER_TIMEZONE;
}

/** Local weekday short name (Sun–Sat) in the event timezone. */
export function localWeekday(
  startsAt: string,
  timezone?: string | null
): string {
  const tz = resolveEventTimeZone(timezone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date(startsAt));
}

/** Local wall-clock HH:MM (24h) in the event timezone — DST-safe. */
export function localStartHm(
  startsAt: string,
  timezone?: string | null
): string {
  const tz = resolveEventTimeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(startsAt));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/**
 * Presentation-only fingerprint.
 * source + normalized title + venue + local weekday + local HH:MM
 */
export function recurrenceFingerprint(event: RecurrenceInput): string {
  const source = (event.source_key ?? "").trim().toLowerCase();
  const title = normalizeRecurrenceText(event.title);
  const venue = normalizeRecurrenceText(event.venue_name);
  const weekday = localWeekday(event.starts_at, event.timezone);
  const hm = localStartHm(event.starts_at, event.timezone);
  return [source, title, venue, weekday, hm].join("|");
}

function calendarDaysBetween(a: Ymd, b: Ymd): number {
  const aUtc = Date.UTC(a.year, a.month - 1, a.day);
  const bUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/**
 * Classify cadence from sorted local calendar-day gaps.
 * Only exact stable 7 / 14 day gaps earn strong labels.
 */
export function classifyCadence(
  sortedLocalDates: Ymd[]
): RecurrenceKind | null {
  if (sortedLocalDates.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sortedLocalDates.length; i++) {
    gaps.push(calendarDaysBetween(sortedLocalDates[i - 1], sortedLocalDates[i]));
  }
  if (gaps.length === 0) return null;
  if (gaps.every((g) => g === 7)) return "weekly";
  if (gaps.every((g) => g === 14)) return "biweekly";
  return "multiple_dates";
}

export function recurrenceLabel(kind: RecurrenceKind): string {
  if (kind === "weekly") return "Weekly";
  if (kind === "biweekly") return "Every 2 weeks";
  return "Multiple dates";
}

function toSibling(event: RecurrenceInput): RecurrenceSibling {
  return {
    id: event.id,
    starts_at: event.starts_at,
    ends_at: event.ends_at ?? null,
    timezone: event.timezone ?? null,
    all_day: event.all_day ?? null,
    title: event.title,
  };
}

const DEFAULT_UPCOMING_LIMIT = 4;

/**
 * Derive recurrence presentation for each occurrence in the ALREADY-FILTERED
 * result set. Never call this before date/location/category filtering.
 */
export function buildRecurrenceById(
  events: RecurrenceInput[],
  upcomingLimit = DEFAULT_UPCOMING_LIMIT
): Map<string, RecurrencePresentation> {
  const byFingerprint = new Map<string, RecurrenceInput[]>();

  for (const event of events) {
    if (!event.id || !event.starts_at) continue;
    const fp = recurrenceFingerprint(event);
    const list = byFingerprint.get(fp);
    if (list) list.push(event);
    else byFingerprint.set(fp, [event]);
  }

  const out = new Map<string, RecurrencePresentation>();

  for (const group of Array.from(byFingerprint.values())) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) =>
      a.starts_at.localeCompare(b.starts_at)
    );
    const localDates = sorted.map((e) =>
      zonedYmd(e.starts_at, resolveEventTimeZone(e.timezone))
    );
    // Deduplicate identical local calendar days (shouldn't happen often).
    const uniqueDates: Ymd[] = [];
    for (const d of localDates) {
      if (
        uniqueDates.length === 0 ||
        compareYmd(uniqueDates[uniqueDates.length - 1], d) !== 0
      ) {
        uniqueDates.push(d);
      }
    }

    const kind = classifyCadence(uniqueDates);
    if (!kind) continue;

    const label = recurrenceLabel(kind);
    const occurrenceCount = sorted.length;

    for (const current of sorted) {
      const upcomingSiblings = sorted
        .filter(
          (e) =>
            e.id !== current.id &&
            e.starts_at.localeCompare(current.starts_at) > 0
        )
        .slice(0, upcomingLimit)
        .map(toSibling);

      out.set(current.id, {
        kind,
        label,
        occurrenceCount,
        upcomingSiblings,
        siblingCount: occurrenceCount - 1,
      });
    }
  }

  return out;
}

/** Test helper: build synthetic weekly Monday series across a DST boundary. */
export function localYmdPlusDays(
  startsAt: string,
  timezone: string | null | undefined,
  deltaDays: number
): Ymd {
  const ymd = zonedYmd(startsAt, resolveEventTimeZone(timezone));
  return addCalendarDays(ymd, deltaDays);
}

export function weekdayIndex(weekday: string): number | null {
  return WEEKDAY_INDEX[weekday] ?? null;
}
