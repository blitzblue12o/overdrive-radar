import { FILTER_TIMEZONE } from "@/lib/events/filters";

/** Calendar day (no time). Prefer calendar arithmetic over 24h ms math. */
export type Ymd = { year: number; month: number; day: number };

export type OccurrenceInput = {
  starts_at: string;
  ends_at?: string | null;
  timezone?: string | null;
  /** Authoritative ICS VALUE=DATE signal (from source_metadata / feature). */
  all_day?: boolean | null;
};

export type TemporalKind =
  | "instant"
  | "same_day_timed"
  | "cross_date_timed"
  | "all_day_single"
  | "all_day_multi";

/**
 * Shared temporal presentation model for cards/detail.
 * Filtering uses interval overlap separately — do not treat
 * spansCalendarDates as “Multi-day”.
 */
export type EventTemporalDisplay = {
  kind: TemporalKind;
  allDay: boolean;
  /** Local (or UTC-for-all-day) start/end calendar days differ. */
  spansCalendarDates: boolean;
  /**
   * Semantic multi-day badge candidate.
   * True only for all-day events with inclusive span > 1 day.
   * Timed overnight / campouts are NOT multi-day.
   */
  isMultiDay: boolean;
  cardLabel: string;
  detailLines: string[];
};

/** @deprecated Prefer EventTemporalDisplay — kept for existing imports. */
export type OccurrencePresentation = EventTemporalDisplay;

/** Read all-day flag from ingestion `source_metadata` (authoritative only). */
export function deriveAllDayFromMetadata(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return m.allDay === true || m.all_day === true;
}

export function isAllDayOccurrence(event: OccurrenceInput): boolean {
  return event.all_day === true;
}

export function utcYmd(value: string | Date): Ymd {
  const d = typeof value === "string" ? new Date(value) : value;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function addCalendarDays(ymd: Ymd, delta: number): Ymd {
  const utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function compareYmd(a: Ymd, b: Ymd): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function ymdKey(ymd: Ymd): string {
  return `${ymd.year}-${String(ymd.month).padStart(2, "0")}-${String(ymd.day).padStart(2, "0")}`;
}

export function zonedYmd(value: string | Date, timeZone: string): Ymd {
  const d = typeof value === "string" ? new Date(value) : value;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * All-day ICS DATE storage uses UTC-noon instants.
 * DTEND DATE is exclusive → inclusive final calendar day is exclusiveEnd − 1 day.
 */
export function allDayInclusiveEndYmd(event: OccurrenceInput): Ymd {
  const start = utcYmd(event.starts_at);
  if (!event.ends_at) return start;
  const exclusive = utcYmd(event.ends_at);
  if (compareYmd(exclusive, start) <= 0) return start;
  return addCalendarDays(exclusive, -1);
}

export function allDayExclusiveEndYmd(event: OccurrenceInput): Ymd {
  const start = utcYmd(event.starts_at);
  if (!event.ends_at) return addCalendarDays(start, 1);
  const exclusive = utcYmd(event.ends_at);
  if (compareYmd(exclusive, start) <= 0) return addCalendarDays(start, 1);
  return exclusive;
}

/** True when timed start/end fall on different local calendar days. */
export function spansLocalCalendarDates(event: OccurrenceInput): boolean {
  if (!event.ends_at) return false;
  if (isAllDayOccurrence(event)) {
    const start = utcYmd(event.starts_at);
    const inclusiveEnd = allDayInclusiveEndYmd(event);
    return compareYmd(start, inclusiveEnd) < 0;
  }
  const tz = event.timezone?.trim() || FILTER_TIMEZONE;
  return compareYmd(zonedYmd(event.starts_at, tz), zonedYmd(event.ends_at, tz)) < 0;
}

/**
 * "Multi-day" is reserved for true multi-day all-day spans (exclusive DTEND − 1).
 * Timed events that merely cross midnight are NOT multi-day.
 */
export function isMultiDayOccurrence(event: OccurrenceInput): boolean {
  if (!isAllDayOccurrence(event)) return false;
  return spansLocalCalendarDates(event);
}

/**
 * Half-open window overlap: event ∩ [windowStart, windowEnd) has positive length
 * (or a null-end point event lands inside the window).
 *
 * Timed with ends_at:
 *   starts_at < windowEnd AND ends_at > windowStart
 *
 * Timed without ends_at (point occurrence):
 *   windowStart <= starts_at < windowEnd
 *
 * All-day (authoritative all_day):
 *   calendar-date overlap using exclusive DTEND DATE (UTC ymd of noon stamps).
 */
export function eventOverlapsDateRange(
  event: OccurrenceInput,
  range: { start: Date; end: Date },
  filterTimeZone: string = FILTER_TIMEZONE
): boolean {
  if (isAllDayOccurrence(event)) {
    const eventStart = utcYmd(event.starts_at);
    const eventEndExclusive = allDayExclusiveEndYmd(event);
    const windowStart = zonedYmd(range.start, filterTimeZone);
    const windowEnd = zonedYmd(range.end, filterTimeZone);
    return (
      compareYmd(eventStart, windowEnd) < 0 &&
      compareYmd(eventEndExclusive, windowStart) > 0
    );
  }

  const startMs = new Date(event.starts_at).getTime();
  if (!Number.isFinite(startMs)) return false;
  const windowStartMs = range.start.getTime();
  const windowEndMs = range.end.getTime();

  if (event.ends_at == null || event.ends_at === "") {
    // Point occurrence: included iff start lands in [windowStart, windowEnd).
    return startMs >= windowStartMs && startMs < windowEndMs;
  }

  const endMs = new Date(event.ends_at).getTime();
  if (!Number.isFinite(endMs)) return false;
  return startMs < windowEndMs && endMs > windowStartMs;
}

function formatMonthDay(ymd: Ymd, opts?: { includeYear?: boolean }): string {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(opts?.includeYear ? { year: "numeric" } : {}),
  }).format(d);
}

function formatWeekdayMonthDay(ymd: Ymd): string {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Compact inclusive date span: Oct 24–25 | Aug 30–Sep 2 | Dec 31, 2026–Jan 2, 2027 */
export function formatInclusiveDateSpan(start: Ymd, end: Ymd): string {
  if (compareYmd(start, end) === 0) {
    return formatMonthDay(start);
  }
  const crossYear = start.year !== end.year;
  if (crossYear) {
    return `${formatMonthDay(start, { includeYear: true })}–${formatMonthDay(end, { includeYear: true })}`;
  }
  const crossMonth = start.month !== end.month;
  if (crossMonth) {
    return `${formatMonthDay(start)}–${formatMonthDay(end)}`;
  }
  return `${formatMonthDay(start)}–${end.day}`;
}

function formatZonedDateTime(
  iso: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(
    new Date(iso)
  );
}

function formatZonedTime(iso: string, timeZone: string): string {
  return formatZonedDateTime(iso, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatZonedMonthDay(iso: string, timeZone: string): string {
  return formatZonedDateTime(iso, timeZone, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Central temporal display for EventCard / EventDetail.
 * Filtering and presentation are separate; no recurrence logic.
 */
export function getEventTemporalDisplay(
  event: OccurrenceInput
): EventTemporalDisplay {
  const tz = event.timezone?.trim() || FILTER_TIMEZONE;
  const allDay = isAllDayOccurrence(event);

  if (allDay) {
    const start = utcYmd(event.starts_at);
    const inclusiveEnd = allDayInclusiveEndYmd(event);
    const multi = compareYmd(start, inclusiveEnd) < 0;
    if (!multi) {
      const dayLabel = formatWeekdayMonthDay(start);
      return {
        kind: "all_day_single",
        allDay: true,
        spansCalendarDates: false,
        isMultiDay: false,
        cardLabel: `${dayLabel} · All day`,
        detailLines: [dayLabel, "All day"],
      };
    }
    const span = formatInclusiveDateSpan(start, inclusiveEnd);
    return {
      kind: "all_day_multi",
      allDay: true,
      spansCalendarDates: true,
      isMultiDay: true,
      cardLabel: `${span} · Multi-day`,
      detailLines: [span, "Multi-day"],
    };
  }

  if (!event.ends_at) {
    const label = formatZonedDateTime(event.starts_at, tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      kind: "instant",
      allDay: false,
      spansCalendarDates: false,
      isMultiDay: false,
      cardLabel: label,
      detailLines: [label],
    };
  }

  const startY = zonedYmd(event.starts_at, tz);
  const endY = zonedYmd(event.ends_at, tz);
  const crosses = compareYmd(startY, endY) < 0;

  if (!crosses) {
    const day = formatZonedDateTime(event.starts_at, tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const startTime = formatZonedTime(event.starts_at, tz);
    const endTime = formatZonedTime(event.ends_at, tz);
    const cardLabel = `${day} · ${startTime} – ${endTime}`;
    return {
      kind: "same_day_timed",
      allDay: false,
      spansCalendarDates: false,
      isMultiDay: false,
      cardLabel,
      detailLines: [cardLabel],
    };
  }

  // Timed cross-date: show the true range. Do NOT label "Multi-day".
  // Ordinary overnight and longer campouts share this shape — no duration taxonomy.
  const startTime = formatZonedTime(event.starts_at, tz);
  const endTime = formatZonedTime(event.ends_at, tz);
  const startMonthDay = formatZonedMonthDay(event.starts_at, tz);
  const endMonthDay = formatZonedMonthDay(event.ends_at, tz);
  const cardLabel = `${startMonthDay}, ${startTime} – ${endMonthDay}, ${endTime}`;

  const startLine = `${formatZonedDateTime(event.starts_at, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${startTime}`;
  const endLine = `${formatZonedDateTime(event.ends_at, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${endTime}`;

  return {
    kind: "cross_date_timed",
    allDay: false,
    spansCalendarDates: true,
    isMultiDay: false,
    cardLabel,
    detailLines: [startLine, "–", endLine],
  };
}

/** @deprecated Use getEventTemporalDisplay */
export function describeOccurrence(event: OccurrenceInput): EventTemporalDisplay {
  return getEventTemporalDisplay(event);
}

/** Card / list label — prefer this over ad-hoc date formatting. */
export function formatOccurrenceLabel(event: OccurrenceInput): string {
  return getEventTemporalDisplay(event).cardLabel;
}

/** Detail lines for EventDetail (and similar). */
export function formatOccurrenceDetailLines(event: OccurrenceInput): string[] {
  return getEventTemporalDisplay(event).detailLines;
}
