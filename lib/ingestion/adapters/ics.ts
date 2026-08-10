import type { RawSourceEvent, SourceAdapter, SourceRecord } from "@/lib/ingestion/types";

/**
 * Minimal RFC 5545 VEVENT parser — covers CivicPlus, LibCal/Springshare,
 * and Google Calendar public ICS feeds used in Wave 3.
 */
export function parseIcs(text: string): RawSourceEvent[] {
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const events: RawSourceEvent[] = [];

  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] ?? "";
    const props = parseProps(body);
    const startProp = props.get("DTSTART");
    const startsAt = parseIcsDate(startProp);
    if (!startsAt) continue;

    const title = props.get("SUMMARY")?.value?.trim();
    if (!title) continue;

    const uid =
      props.get("UID")?.value?.trim() ||
      `${title}|${startsAt.toISOString()}`;

    const endProp = props.get("DTEND");
    const endsAt = parseIcsDate(endProp);
    const allDay = isIcsDateValue(startProp);
    const geo = parseGeo(props.get("GEO")?.value);
    const location = props.get("LOCATION")?.value?.trim() || null;
    const categories = (props.get("CATEGORIES")?.value ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    events.push({
      uid,
      title: unescapeIcs(title),
      description: unescapeIcs(props.get("DESCRIPTION")?.value ?? "") || null,
      startsAt,
      endsAt,
      timezone:
        startProp?.params.TZID ||
        props.get("X-WR-TIMEZONE")?.value ||
        "America/Los_Angeles",
      venueName: location,
      address: location,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      url: props.get("URL")?.value?.trim() || null,
      categories,
      organizerName: parseOrganizerCn(props.get("ORGANIZER")),
      metadata: {
        rawUid: props.get("UID")?.value ?? null,
        status: props.get("STATUS")?.value ?? null,
        // Authoritative ICS VALUE=DATE signal for exclusive-DTEND display/filter.
        ...(allDay ? { allDay: true } : {}),
      },
    });
  }

  return events;
}

type IcsProp = {
  value: string;
  params: Record<string, string>;
};

function parseProps(body: string): Map<string, IcsProp> {
  const map = new Map<string, IcsProp>();
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("BEGIN:") || line.startsWith("END:")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = left.split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
    map.set(name.toUpperCase(), { value, params });
  }
  return map;
}

/** True when the property is an ICS DATE (VALUE=DATE or bare YYYYMMDD). */
export function isIcsDateValue(prop?: IcsProp): boolean {
  if (!prop?.value) return false;
  const raw = prop.value.trim();
  return prop.params.VALUE === "DATE" || /^\d{8}$/.test(raw);
}

/** Exported for unit tests — parses DTSTART/DTEND property values. */
export function parseIcsDate(prop?: IcsProp): Date | null {
  if (!prop?.value) return null;
  const raw = prop.value.trim();
  if (isIcsDateValue(prop)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    if (![y, m, d].every(Number.isFinite)) return null;
    // Date-only: UTC noon avoids timezone-induced calendar-day shifts.
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
  }
  const m = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (!m) return null;
  const [, ys, ms, ds, hs, mins, ss, z] = m;
  const year = +ys;
  const month = +ms;
  const day = +ds;
  const hour = +hs;
  const minute = +mins;
  const second = +ss;
  if (z) {
    // Explicit UTC — do not apply TZID even if present.
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  const tzid = normalizeTzid(prop.params.TZID);
  if (tzid) {
    if (!isValidIanaTimeZone(tzid)) {
      console.warn(
        `[ics] Unknown TZID "${tzid}"; falling back to floating wall-clock as UTC`
      );
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    }
    return zonedWallTimeToUtc(year, month, day, hour, minute, second, tzid);
  }

  // Floating local time (no TZID): preserve prior Wave 3 semantics — wall clock as UTC.
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function normalizeTzid(raw?: string): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^"|"$/g, "");
}

function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    // RangeError if the IANA id is not recognized by the runtime.
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a civil wall-clock time in an IANA zone to the correct UTC Date.
 * Uses Intl only (no extra dependency); iterates twice for DST boundaries.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcMs = wallAsUtcMs - getTimeZoneOffsetMs(wallAsUtcMs, timeZone);
  utcMs = wallAsUtcMs - getTimeZoneOffsetMs(utcMs, timeZone);
  return new Date(utcMs);
}

/** Offset such that: utcMs + offset ≈ wall-clock components encoded as UTC ms. */
function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - utcMs;
}

function parseGeo(value?: string): { lat: number; lng: number } | null {
  if (!value) return null;
  const [latS, lngS] = value.split(/[;,]/);
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function parseOrganizerCn(prop?: IcsProp): string | null {
  if (!prop) return null;
  const cn = prop.params.CN?.replace(/^"|"$/g, "").trim();
  return cn || null;
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export class IcsAdapter implements SourceAdapter {
  readonly type = "ics" as const;

  async fetchEvents(source: SourceRecord): Promise<RawSourceEvent[]> {
    if (!source.feed_url) {
      throw new Error(`Source ${source.name} has no feed_url`);
    }
    const res = await fetch(source.feed_url, {
      headers: { "User-Agent": "OverdriveRadarIngestion/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ICS fetch failed (${res.status}) for ${source.feed_url}`);
    }
    const text = await res.text();
    return parseIcs(text);
  }
}
