/**
 * Conservative detection of clearly virtual / non-physical LOCATION values.
 * Uses venue/address fields only — not description text.
 */

function normalizeLocationText(value: string): string {
  return value
    .toLowerCase()
    // Strip markup so feed values like "<p>ZOOM</p> -" still match.
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the location string is clearly non-physical (Zoom/online/virtual).
 * Deliberately narrow — physical venues must not match.
 */
export function isVirtualLocation(
  ...parts: Array<string | null | undefined>
): boolean {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = normalizeLocationText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  const normalized = normalizeLocationText(unique.join(" "));
  if (!normalized) return false;

  return (
    /^(via\s+)?zoom(\s.*)?$/.test(normalized) ||
    /^virtual(\s+event)?$/.test(normalized) ||
    /^online(\s+event)?$/.test(normalized) ||
    /^webinar$/.test(normalized)
  );
}
