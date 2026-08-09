export interface CalendarEventInput {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  venue_name?: string | null;
  address?: string | null;
  timezone?: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIcsUtc(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  const limit = 75;
  if (line.length <= limit) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, limit));
  remaining = remaining.slice(limit);
  while (remaining.length > 0) {
    parts.push(" " + remaining.slice(0, limit - 1));
    remaining = remaining.slice(limit - 1);
  }
  return parts.join("\r\n");
}

export function buildIcs(event: CalendarEventInput): string {
  const start = new Date(event.starts_at);
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const location = [event.venue_name, event.address]
    .filter(Boolean)
    .join(", ");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Overdrive Radar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@overdrive-radar`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  if (event.timezone) {
    lines.push(`X-WR-TIMEZONE:${escapeIcsText(event.timezone)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function downloadIcs(event: CalendarEventInput): void {
  const ics = buildIcs(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  anchor.href = url;
  anchor.download = `${safeName || "event"}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
