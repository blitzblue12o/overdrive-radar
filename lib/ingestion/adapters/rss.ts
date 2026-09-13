import { fetchFeedConditional } from "@/lib/ingestion/http";
import type {
  FetchEventsOptions,
  FetchEventsResult,
  RawSourceEvent,
  SourceAdapter,
  SourceRecord,
} from "@/lib/ingestion/types";

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

  async fetchEvents(
    source: SourceRecord,
    options: FetchEventsOptions = {}
  ): Promise<FetchEventsResult> {
    if (!source.feed_url) {
      throw new Error(`Source ${source.name} has no feed_url`);
    }
    const result = await fetchFeedConditional({
      url: source.feed_url,
      etag: options.etag,
      lastModified: options.lastModified,
      onRetry: options.onRetry,
    });
    if (result.status === "not_modified") {
      return {
        events: [],
        notModified: true,
        etag: result.etag,
        lastModified: result.lastModified,
      };
    }

    const contentType = result.contentType ?? "";
    const looksHtml =
      /text\/html/i.test(contentType) ||
      /^\s*<!DOCTYPE html/i.test(result.text) ||
      /^\s*<html/i.test(result.text);
    const looksXml =
      /xml|rss|atom/i.test(contentType) ||
      /^\s*<\?xml/i.test(result.text) ||
      /^\s*<rss/i.test(result.text) ||
      /^\s*<feed/i.test(result.text);

    if (looksHtml && !looksXml) {
      throw new Error(
        `RSS feed returned HTML instead of feed XML for ${source.feed_url}`
      );
    }

    const events = parseRss(result.text);
    let feedNote: string | null = null;
    if (events.length === 0) {
      const hasChannel =
        /<channel[\s>]/i.test(result.text) || /<feed[\s>]/i.test(result.text);
      if (hasChannel) {
        feedNote =
          "Feed XML parsed successfully but contained zero item/entry elements";
      } else if (!looksXml) {
        feedNote = `Unexpected feed body (content-type=${contentType || "unknown"})`;
      }
    }

    return {
      events,
      etag: result.etag,
      lastModified: result.lastModified,
      contentType: result.contentType,
      feedNote,
    };
  }
}
