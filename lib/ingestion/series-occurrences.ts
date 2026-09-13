/**
 * Rolling-horizon occurrence helpers for recurring Overdrive series.
 * Pure calendar math in America/Los_Angeles local civil dates.
 */

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export type LocalYmd = { year: number; month: number; day: number };

/** Civil date in a fixed timezone (default LA). */
export function ymdInTimeZone(
  date: Date,
  timeZone = "America/Los_Angeles"
): LocalYmd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function ymdToIso({ year, month, day }: LocalYmd): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOfYmd(ymd: LocalYmd): number {
  // Use UTC noon to avoid DST edge when interpreting civil YMD as a weekday.
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)).getUTCDay();
}

function compareYmd(a: LocalYmd, b: LocalYmd): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Nth weekday of a month (n=1..5). Returns null if that occurrence does not exist. */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number
): LocalYmd | null {
  if (n < 1 || n > 5) return null;
  const target = WEEKDAY_INDEX[weekday];
  const first: LocalYmd = { year, month, day: 1 };
  const offset = (target - weekdayOfYmd(first) + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Last weekday of a month. */
export function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday
): LocalYmd {
  const target = WEEKDAY_INDEX[weekday];
  const lastDay = daysInMonth(year, month);
  const last: LocalYmd = { year, month, day: lastDay };
  const back = (weekdayOfYmd(last) - target + 7) % 7;
  return { year, month, day: lastDay - back };
}

export type LocalTime = { hour: number; minute: number };

/**
 * Build a Date for a civil LA local wall time.
 * Iteratively corrects UTC until the zoned wall clock matches.
 */
export function zonedLocalDateTime(
  ymd: LocalYmd,
  time: LocalTime,
  timeZone = "America/Los_Angeles"
): Date {
  const desiredAsUtc = Date.UTC(
    ymd.year,
    ymd.month - 1,
    ymd.day,
    time.hour,
    time.minute,
    0
  );
  let utcMs = desiredAsUtc;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMs));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const actualAsUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second")
    );
    const delta = desiredAsUtc - actualAsUtc;
    utcMs += delta;
    if (delta === 0) break;
  }
  return new Date(utcMs);
}

export type HorizonCadence =
  | { kind: "nth_weekdays"; weekday: Weekday; nth: number[] }
  | { kind: "last_weekday"; weekday: Weekday }
  | { kind: "explicit_dates"; dates: LocalYmd[] };

/**
 * Upcoming civil dates for a cadence, capped to a rolling horizon.
 * Past dates (before `from`) are excluded. Historical rows are never deleted
 * by this helper — callers only materialize future occurrences.
 */
export function upcomingOccurrenceDates(
  cadence: HorizonCadence,
  opts: {
    from?: LocalYmd;
    limit: number;
    /** Inclusive month scan window when generating nth/last patterns. */
    monthsAhead?: number;
  }
): LocalYmd[] {
  const from = opts.from ?? ymdInTimeZone(new Date());
  const limit = Math.max(0, opts.limit);
  if (limit === 0) return [];

  if (cadence.kind === "explicit_dates") {
    return cadence.dates
      .filter((d) => compareYmd(d, from) >= 0)
      .sort(compareYmd)
      .slice(0, limit);
  }

  const monthsAhead = opts.monthsAhead ?? 18;
  const out: LocalYmd[] = [];
  let y = from.year;
  let m = from.month;
  for (let i = 0; i < monthsAhead && out.length < limit; i++) {
    if (cadence.kind === "nth_weekdays") {
      for (const n of [...cadence.nth].sort((a, b) => a - b)) {
        const d = nthWeekdayOfMonth(y, m, cadence.weekday, n);
        if (d && compareYmd(d, from) >= 0) out.push(d);
      }
    } else {
      const d = lastWeekdayOfMonth(y, m, cadence.weekday);
      if (compareYmd(d, from) >= 0) out.push(d);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.sort(compareYmd).slice(0, limit);
}

/** Stable series occurrence uid. */
export function seriesOccurrenceUid(seriesKey: string, ymd: LocalYmd): string {
  return `${seriesKey}:${ymdToIso(ymd)}`;
}

export function parseMonthDayYearList(
  text: string,
  defaultYear?: number
): LocalYmd[] {
  // "March 27th, April 24th, May 22nd, ... October 23rd"
  const monthMap: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : defaultYear;
  if (!year) return [];

  const out: LocalYmd[] = [];
  const re =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const month = monthMap[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (month && day >= 1 && day <= 31) {
      out.push({ year, month, day });
    }
  }
  return out;
}
