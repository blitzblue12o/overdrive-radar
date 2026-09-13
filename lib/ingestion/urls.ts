/**
 * Safe absolute URL resolution for ingested source/event links.
 * Only http/https are accepted.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Resolve a possibly-relative URL against an optional base (usually feed_url).
 * Returns null when the result is not a safe absolute http(s) URL.
 */
export function resolveAbsoluteHttpUrl(
  raw: string | null | undefined,
  baseUrl?: string | null
): string | null {
  const candidate = raw?.trim();
  if (!candidate) return null;

  // Block obvious unsafe schemes before URL parsing.
  if (/^(javascript|data|vbscript|file):/i.test(candidate)) {
    return null;
  }

  try {
    const base = baseUrl?.trim() ? new URL(baseUrl.trim()) : undefined;
    if (base && !SAFE_PROTOCOLS.has(base.protocol)) {
      return null;
    }

    const resolved = base ? new URL(candidate, base) : new URL(candidate);
    if (!SAFE_PROTOCOLS.has(resolved.protocol)) {
      return null;
    }
    // Reject credentials in URL userinfo.
    if (resolved.username || resolved.password) {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

/** True when value is already an absolute http(s) URL. */
export function isAbsoluteHttpUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const u = new URL(value.trim());
    return SAFE_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}
