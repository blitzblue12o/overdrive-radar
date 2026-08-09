import type { RawSourceEvent, SourceAdapter, SourceRecord } from "@/lib/ingestion/types";

/**
 * Defensive RSS 2.0 / Atom parser for CivicPlus and similar calendar feeds.
 * Tolerates missing fields rather than throwing on structural variance.
 */
export function parseRss(text: string): RawSourceEvent[] {
  const items = [
    ...matchBlocks(text, "item"),
    ...matchBlocks(text, "entry"),
  ];
  const events: RawSourceEvent[] = [];

  for (const item of items) {
    const title = textContent(item, "title")?.trim();
    if (!title) continue;

    const link =
      attrContent(item, "link", "href") ||
      textContent(item, "link") ||
      textContent(item, "guid");
    const description =
      textContent(item, "description") ||
      textContent(item, "summary") ||
      textContent(item, "content") ||
      null;

    const startRaw =
      textContent(item, "calendarEvent:eventDate") ||
      textContent(item, "eventDate") ||
      textContent(item, "pubDate") ||
      textContent(item, "published") ||
      textContent(item, "updated");
    const startsAt = startRaw ? new Date(startRaw) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) continue;

    const endRaw =
      textContent(item, "calendarEvent:endDate") ||
      textContent(item, "endDate");
    const endsAt = endRaw ? new Date(endRaw) : null;

    const location =
      textContent(item, "calendarEvent:location") ||
      textContent(item, "location") ||
      null;

    const lat = numberOrNull(
      textContent(item, "geo:lat") || textContent(item, "latitude")
    );
    const lng = numberOrNull(
      textContent(item, "geo:long") ||
        textContent(item, "geo:lon") ||
        textContent(item, "longitude")
    );

    const uid =
      textContent(item, "guid") ||
      textContent(item, "id") ||
      link ||
      `${title}|${startsAt.toISOString()}`;

    const categoryTags = collectMatches(
      item,
      /<category[^>]*>([\s\S]*?)<\/category>/gi
    ).map((m) => stripCdata(m).trim());

    events.push({
      uid: uid.trim(),
      title: decodeXml(title),
      description: description ? decodeXml(stripTags(description)) : null,
      startsAt,
      endsAt:
        endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
      timezone: "America/Los_Angeles",
      venueName: location ? decodeXml(location) : null,
      address: location ? decodeXml(location) : null,
      latitude: lat,
      longitude: lng,
      url: link?.trim() || null,
      categories: categoryTags.map(decodeXml).filter(Boolean),
      organizerName: null,
      metadata: {
        pubDate: textContent(item, "pubDate"),
      },
    });
  }

  return events;
}

function matchBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return collectMatches(xml, re);
}

/** Collect capture group 1 from a global regex without requiring downlevelIteration. */
function collectMatches(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  while ((m = global.exec(text)) !== null) {
    if (m[1] != null) out.push(m[1]);
    if (m[0].length === 0) global.lastIndex += 1;
  }
  return out;
}

function textContent(xml: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag.replace(":", "\\:")}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag.replace(":", "\\:")}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return null;
  return stripCdata(m[1]).trim();
}

function attrContent(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*\\/?>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1").trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function numberOrNull(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export class RssAdapter implements SourceAdapter {
  readonly type = "rss" as const;

  async fetchEvents(source: SourceRecord): Promise<RawSourceEvent[]> {
    if (!source.feed_url) {
      throw new Error(`Source ${source.name} has no feed_url`);
    }
    const res = await fetch(source.feed_url, {
      headers: { "User-Agent": "OverdriveRadarIngestion/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`RSS fetch failed (${res.status}) for ${source.feed_url}`);
    }
    const text = await res.text();
    return parseRss(text);
  }
}
