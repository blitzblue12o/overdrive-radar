/**
 * Lightweight display normalization for externally ingested strings.
 * Plain text only — does not render HTML.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ABSOLUTE_HTTP_URL_RE = /^https?:\/\/\S+$/i;
/** Prose followed by a trailing/standalone source URL (CivicEngage pattern). */
const TRAILING_SOURCE_URL_RE = /^(.*?)\s+(https?:\/\/\S+)$/i;

function decodeHtmlEntities(value: string): string {
  // Optional backslash before ';' covers CivicEngage ICS artifacts like &apos\;
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+)\\?;/g,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        if (Number.isFinite(code)) {
          try {
            return String.fromCodePoint(code);
          } catch {
            return match;
          }
        }
        return match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    }
  );
}

/** Strip simple tags, decode common entities, collapse whitespace. */
export function normalizeDisplayText(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const cleaned = decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return ABSOLUTE_HTTP_URL_RE.test(value);
}

function cleanExtractedUrl(url: string): string {
  // Trim punctuation that sometimes clings to the end of pasted URLs.
  return url.replace(/[)\].,;:]+$/g, "");
}

/**
 * Split a description into display prose + trailing/standalone source URL.
 * Mid-sentence URLs are left in the prose (not treated as source links).
 */
export function splitDescriptionSourceUrl(
  description: string | null | undefined
): { prose: string | null; sourceUrl: string | null } {
  const text = normalizeDisplayText(description);
  if (!text) return { prose: null, sourceUrl: null };

  if (isAbsoluteHttpUrl(text)) {
    return { prose: null, sourceUrl: cleanExtractedUrl(text) };
  }

  const match = text.match(TRAILING_SOURCE_URL_RE);
  if (!match) return { prose: text, sourceUrl: null };

  const prose = match[1]?.trim() || null;
  const sourceUrl = cleanExtractedUrl(match[2] ?? "");
  if (!sourceUrl || !isAbsoluteHttpUrl(sourceUrl)) {
    return { prose: text, sourceUrl: null };
  }
  return { prose, sourceUrl };
}

/** True when the entire meaningful description is a single URL. */
export function isUrlOnlyDescription(
  value: string | null | undefined
): boolean {
  const text = normalizeDisplayText(value);
  if (!text) return false;
  return isAbsoluteHttpUrl(text);
}

/**
 * Description text for detail UI: strips trailing/standalone source URLs.
 * Returns null when nothing meaningful remains (e.g. URL-only descriptions).
 */
export function displayDescriptionText(
  description: string | null | undefined
): string | null {
  return splitDescriptionSourceUrl(description).prose;
}

function locationKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deduped venue/address lines for presentation.
 * Does not mutate stored fields.
 */
export function displayLocationLines(
  venueName: string | null | undefined,
  address: string | null | undefined
): { primary: string | null; secondary: string | null } {
  const venue = normalizeDisplayText(venueName);
  const addr = normalizeDisplayText(address);

  if (venue && addr && locationKey(venue) === locationKey(addr)) {
    return { primary: venue, secondary: null };
  }
  if (venue) {
    return { primary: venue, secondary: addr };
  }
  return { primary: addr, secondary: null };
}

/**
 * Compact venue signal for EventCard — prefers facility name over full
 * "Venue - street city ZIP" CivicEngage strings. No HTML; CSS truncates.
 */
export function cardVenueLabel(
  venueName: string | null | undefined,
  address?: string | null
): string | null {
  const { primary } = displayLocationLines(venueName, address);
  if (!primary) return null;
  const sep = primary.indexOf(" - ");
  if (sep > 0 && sep <= 56) {
    const left = primary.slice(0, sep).trim();
    if (left) return left;
  }
  return primary;
}

/**
 * Prefer an absolute source_url; otherwise use a standalone/trailing URL
 * extracted from the description (CivicEngage pattern).
 */
export function resolveEventWebsiteUrl(
  sourceUrl: string | null | undefined,
  description: string | null | undefined
): string | null {
  const src = sourceUrl?.trim() || null;
  if (src && isAbsoluteHttpUrl(src)) return src;

  return splitDescriptionSourceUrl(description).sourceUrl;
}
