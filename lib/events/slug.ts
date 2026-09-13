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

/** Short stable suffix from UUID (collision-resistant, deterministic). */
export function shortIdFromUuid(id: string): string {
  return id.replace(/-/g, "").slice(0, 10);
}

export function buildEventSlug(title: string, id: string): string {
  return `${slugifyTitle(title)}-${shortIdFromUuid(id)}`;
}

/** Extract event UUID from `/events/[slug]` param when suffix matches. */
export function eventIdFromSlug(slug: string): string | null {
  const trimmed = slug.trim();
  // Prefer full UUID if somehow present.
  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
  );
  if (uuidMatch) return uuidMatch[1].toLowerCase();

  const short = trimmed.match(/-([0-9a-f]{10})$/i)?.[1];
  if (!short) return null;
  return short.toLowerCase();
}

export function eventPath(title: string, id: string): string {
  return `/events/${buildEventSlug(title, id)}`;
}
