/**
 * Presentation-only title / source / location / description helpers.
 * Never mutate stored event rows.
 */

import { splitTextWithUrls } from "@/lib/events/autolink";
import {
  displayLocationLines,
  normalizeDisplayText,
} from "@/lib/events/display-text";

/** Known source_key → friendly club/org label. */
const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  "pca-la": "PCA Los Angeles",
  "pca la": "PCA Los Angeles",
  pcala: "PCA Los Angeles",
  pecla: "PECLA",
};

/** Short tokens preserved when title-casing ALL CAPS feed titles. */
const TITLE_ACRONYMS = new Set([
  "PCA",
  "PECLA",
  "LA",
  "NYC",
  "USA",
  "SUV",
  "EV",
  "GT",
  "RS",
  "ICS",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksMostlyUppercase(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length >= 0.85;
}

/** Strip leading emoji / symbol noise without Unicode property escapes. */
function stripLeadingDecorative(value: string): string {
  let i = 0;
  while (i < value.length) {
    const cp = value.codePointAt(i);
    if (cp == null) break;
    const isDecorative =
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x1f600 && cp <= 0x1f64f) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      cp === 0xfe0f ||
      cp === 0x200d ||
      cp === 0x2b50 || // ⭐
      cp === 0x2728 || // ✨
      cp === 0x2a || // *
      cp === 0x23; // #
    if (!isDecorative) break;
    i += cp > 0xffff ? 2 : 1;
  }
  while (i < value.length && /\s/.test(value.charAt(i))) i += 1;
  return value.slice(i);
}

/** Conservative title case for ALL-CAPS feed titles. */
export function toDisplayTitleCase(value: string): string {
  if (!looksMostlyUppercase(value)) return value;
  return value.toLowerCase().replace(/(^|[\s/&\-–—])([a-z0-9]+)/g, (_, edge: string, word: string) => {
    const upper = word.toUpperCase();
    if (TITLE_ACRONYMS.has(upper)) return `${edge}${upper}`;
    return `${edge}${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
}

/** Derive short source codes from noisy source_key strings. */
function sourceKeyVariants(sourceKey: string): string[] {
  const raw = sourceKey.trim();
  if (!raw) return [];
  const variants = new Set<string>([raw]);

  const paren = raw.match(/^([A-Za-z0-9][A-Za-z0-9-]{1,24})\s*\(/);
  if (paren?.[1]) variants.add(paren[1]);

  const beforeDash = raw.split(/\s+[—–-]\s+/)[0]?.trim();
  if (beforeDash) variants.add(beforeDash);

  const firstToken = raw.split(/[\s(]/)[0];
  if (firstToken && /^[A-Za-z0-9-]{2,24}$/.test(firstToken)) {
    variants.add(firstToken);
  }

  for (const v of Array.from(variants)) {
    variants.add(v.replace(/\s+/g, "-"));
    variants.add(v.replace(/-/g, " "));
    const mapped = SOURCE_DISPLAY_NAMES[v.toLowerCase()];
    if (mapped) variants.add(mapped);
  }

  return Array.from(variants).filter(Boolean);
}

export function formatSourceLabel(
  sourceKey: string | null | undefined
): string | null {
  const raw = sourceKey?.trim();
  if (!raw) return null;

  for (const variant of sourceKeyVariants(raw)) {
    const mapped = SOURCE_DISPLAY_NAMES[variant.toLowerCase()];
    if (mapped) return mapped;
  }

  // "PCA-LA (Porsche Club...)" → prefer short code when unmapped
  const paren = raw.match(/^([A-Za-z0-9][A-Za-z0-9-]{1,24})\s*\(/);
  if (paren?.[1]) {
    if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(paren[1]) && paren[1].length <= 12) {
      return paren[1];
    }
    return toDisplayTitleCase(paren[1]);
  }

  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(raw) && raw.length <= 12) {
    return raw;
  }

  // Avoid dumping long parenthetical source blobs into the UI
  if (raw.length > 40) {
    const short = raw.split(/[\s(—–]/)[0];
    if (short && short.length >= 2) return short;
  }

  return toDisplayTitleCase(raw.replace(/[_]+/g, " "));
}

/**
 * Strip leading emoji/symbol noise and redundant source prefixes when
 * source metadata already identifies the organizer.
 */
export function displayEventTitle(
  title: string | null | undefined,
  sourceKey?: string | null
): string {
  let text = normalizeDisplayText(title) ?? "";
  if (!text) return title?.trim() || "Untitled event";

  text = stripLeadingDecorative(text).trim();

  const source = sourceKey?.trim();
  if (source) {
    const variants = sourceKeyVariants(source);
    // Longest first so "PCA Los Angeles" wins over "PCA" when both match.
    variants.sort((a, b) => b.length - a.length);
    for (const variant of variants) {
      const re = new RegExp(
        `^${escapeRegExp(variant)}\\s*[-–—:|/]?\\s+`,
        "i"
      );
      if (re.test(text)) {
        text = text.replace(re, "").trim();
        break;
      }
    }
  }

  text = toDisplayTitleCase(text).trim();
  return text || (normalizeDisplayText(title) ?? "Untitled event");
}

const STREET_SUFFIX_RE =
  /\b(blvd|boulevard|st|street|ave|avenue|way|hwy|highway|dr|drive|rd|road|ln|lane|ct|court|pkwy|parkway|cir|circle)\.?$/i;

function extractCityLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const cleaned = address.replace(/\\,/g, ",").trim();
  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (/^\d/.test(part)) continue;
    if (/^[A-Z]{2}$/.test(part)) continue;
    if (/^\d{5}(-\d{4})?$/.test(part)) continue;
    if (/^(usa|united states)$/i.test(part)) continue;
    if (STREET_SUFFIX_RE.test(part)) continue;
    const withoutStateZip = part
      .replace(/\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/i, "")
      .replace(/\s+[A-Z]{2}$/i, "")
      .trim();
    if (!withoutStateZip) continue;
    if (STREET_SUFFIX_RE.test(withoutStateZip)) continue;
    // Skip first segment when later segments look like City, ST
    if (
      i === 0 &&
      parts.length >= 3 &&
      parts[1] &&
      !/^\d/.test(parts[1]) &&
      !STREET_SUFFIX_RE.test(parts[1]) &&
      !/^[A-Z]{2}$/.test(parts[1])
    ) {
      continue;
    }
    return withoutStateZip;
  }
  return null;
}

/** Compact card location: Venue · City when possible. */
export function cardLocationLabel(
  venueName: string | null | undefined,
  address?: string | null
): string | null {
  const { primary, secondary } = displayLocationLines(venueName, address);
  if (!primary) return null;

  let venue = primary;
  const dash = venue.indexOf(" - ");
  if (dash > 0 && dash <= 56) {
    venue = venue.slice(0, dash).trim() || venue;
  }

  const venueParts = venue
    .split(",")
    .map((p) => p.replace(/\\,/g, ",").trim())
    .filter(Boolean);
  const venueHead = venueParts[0] || venue;

  // "Larchmont, Los Angeles, CA, USA" or "Venue, 123 St, City, ST"
  if (!secondary && venueParts.length >= 2) {
    for (let i = 1; i < venueParts.length; i++) {
      const candidate = venueParts[i];
      if (!candidate) continue;
      if (/^\d/.test(candidate)) continue;
      if (STREET_SUFFIX_RE.test(candidate)) continue;
      if (/^[A-Z]{2}$/.test(candidate)) continue;
      if (/^\d{5}(-\d{4})?$/.test(candidate)) continue;
      if (/^(usa|united states)$/i.test(candidate)) continue;
      if (venueHead) return `${venueHead} · ${candidate}`;
    }
  }

  const city = extractCityLabel(secondary ?? null);
  if (venueHead && city) {
    if (venueHead.toLowerCase() === city.toLowerCase()) return venueHead;
    return `${venueHead} · ${city}`;
  }

  return venueHead || venue;
}

export type DescriptionLink = {
  href: string;
  label: string;
};

const FOLLOW_INSTAGRAM_RE = /^follow(?:\s+us)?(?:\s+on)?\s+instagram$/i;
const INSTAGRAM_HOST_RE = /(^|\.)instagram\.com$/i;

function hostnameLabel(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "");
    if (INSTAGRAM_HOST_RE.test(host)) return "Instagram";
    return host || "Open link";
  } catch {
    return "Open link";
  }
}

function refineLinkLabel(rawLabel: string, href: string): string {
  const label = rawLabel.replace(/\s+/g, " ").trim().replace(/[:\-–—|]+$/g, "").trim();
  if (!label) return hostnameLabel(href);

  if (FOLLOW_INSTAGRAM_RE.test(label) || /instagram$/i.test(label)) {
    if (/autocross/i.test(label)) return "Autocross Instagram";
    if (/pca/i.test(label)) return "PCA Los Angeles Instagram";
    return "Instagram";
  }

  if (label.length > 48) return hostnameLabel(href);
  return label;
}

function peelLabelFromPreceding(text: string): {
  before: string;
  label: string | null;
} {
  const trimmedEnd = text.replace(/\s+$/, "");
  if (!trimmedEnd) return { before: text, label: null };

  // Prefer last line when multi-line; otherwise last clause after . ! ?
  const lineBreak = Math.max(
    trimmedEnd.lastIndexOf("\n"),
    trimmedEnd.lastIndexOf("\r")
  );
  let head = lineBreak >= 0 ? trimmedEnd.slice(0, lineBreak + 1) : "";
  let tail = lineBreak >= 0 ? trimmedEnd.slice(lineBreak + 1) : trimmedEnd;

  const sentence = tail.match(/^(.*[.!?])\s+(.+)$/);
  if (sentence) {
    head += sentence[1] + " ";
    tail = sentence[2] ?? tail;
  }

  const words = tail.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) {
    return { before: text, label: null };
  }

  // Avoid peeling ordinary prose that doesn't look like a link label
  const candidate = words.join(" ");
  if (/^(https?:)/i.test(candidate)) {
    return { before: text, label: null };
  }

  return {
    before: head,
    label: candidate,
  };
}

/**
 * Split description into prose (URLs removed) and labeled external links.
 * Uses full normalized text so trailing source URLs remain available as links.
 */
export function extractDescriptionParts(
  description: string | null | undefined
): { prose: string | null; links: DescriptionLink[] } {
  const text = normalizeDisplayText(description);
  if (!text) return { prose: null, links: [] };

  if (/^https?:\/\/\S+$/i.test(text)) {
    return {
      prose: null,
      links: [{ href: text.replace(/[)\].,;:]+$/g, ""), label: hostnameLabel(text) }],
    };
  }

  const segments = splitTextWithUrls(text);
  const links: DescriptionLink[] = [];
  const proseChunks: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    if (segment.type === "text") {
      const next = segments[i + 1];
      if (next?.type === "url") {
        const { before, label } = peelLabelFromPreceding(segment.value);
        if (before.trim()) proseChunks.push(before);
        links.push({
          href: next.value,
          label: refineLinkLabel(label ?? "", next.value),
        });
        i += 1;
        continue;
      }
      proseChunks.push(segment.value);
      continue;
    }

    links.push({
      href: segment.value,
      label: hostnameLabel(segment.value),
    });
  }

  const prose = proseChunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const seen = new Set<string>();
  const uniqueLinks = links.filter((link) => {
    const key = link.href.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    prose: prose || null,
    links: uniqueLinks,
  };
}
