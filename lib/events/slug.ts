/**
 * Stable public event slug helpers.
 * Internal identity remains the UUID; slug is for crawlable URLs.
 */

const SLUG_MAX = 80;

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base || "event";
}

/** Canonical public slug: title + full UUID (exact lookup; avoids UUID LIKE). */
export function buildEventSlug(title: string, id: string): string {
  return `${slugifyTitle(title)}-${id.toLowerCase()}`;
}

/**
 * Extract event UUID from `/events/[slug]`.
 * Supports full UUID suffix (canonical) and legacy 10-hex short suffix.
 */
export function eventIdFromSlug(slug: string): string | null {
  const trimmed = slug.trim();
  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
  );
  if (uuidMatch) return uuidMatch[1].toLowerCase();

  const short = trimmed.match(/-([0-9a-f]{10})$/i)?.[1];
  if (!short) return null;
  return short.toLowerCase();
}

/** True when value is a full UUID (not a short hex suffix). */
export function isFullEventId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function eventPath(title: string, id: string): string {
  return `/events/${buildEventSlug(title, id)}`;
}
