/**
 * Plain-text cleanup for ingested venue/title/address strings.
 * Applied at the normalization boundary — not presentation-only.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string): string {
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

/**
 * Strip HTML tags/entities, unescape ICS artifacts, collapse whitespace,
 * and drop leading decorative hyphens.
 */
export function cleanIngestedText(
  value: string | null | undefined,
  maxLen?: number
): string | null {
  if (value == null) return null;
  let cleaned = decodeHtmlEntities(String(value))
    .replace(/\\([,;])/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Leading punctuation noise from CivicEngage LOCATION fields ("- Room A").
  cleaned = cleaned.replace(/^[-–—•*]+\s*/, "").trim();

  if (!cleaned) return null;
  if (maxLen != null && cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen).trim();
  }
  return cleaned;
}

/**
 * Prefer a trailing street/city segment after " - " when the LOCATION field
 * mixes instructions with a real address (CivicEngage pattern).
 */
export function extractGeocodeAddressHint(
  venueOrAddress: string | null | undefined
): string | null {
  const cleaned = cleanIngestedText(venueOrAddress);
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length < 2) return cleaned;
  const last = parts[parts.length - 1]?.trim();
  if (
    last &&
    /\d/.test(last) &&
    /\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|lane|ln|ct|court|ca)\b/i.test(
      last
    )
  ) {
    return last;
  }
  return cleaned;
}
