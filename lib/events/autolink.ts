export type TextSegment =
  | { type: "text"; value: string }
  | { type: "url"; value: string };

/** Absolute http(s) URL runs — does not match scheme-less text. */
const HTTP_URL_RE = /https?:\/\/[^\s<>"']+/gi;

/**
 * Trailing punctuation commonly glued to URLs in prose.
 * Does not strip a closing ")" when the URL still has an unmatched "(".
 */
export function splitUrlMatch(raw: string): { href: string; trailing: string } {
  let href = raw;
  let trailing = "";

  while (href.length > 0) {
    const last = href.charAt(href.length - 1);
    if (!/[.,;:!?)]$/.test(last)) break;
    if (last === ")") {
      const opens = (href.match(/\(/g) ?? []).length;
      const closes = (href.match(/\)/g) ?? []).length;
      if (opens >= closes) break;
    }
    trailing = last + trailing;
    href = href.slice(0, -1);
  }

  return { href, trailing };
}

/**
 * Split plain text into safe text/url segments for React rendering.
 * Does not parse HTML — only detects absolute http(s) URLs.
 */
export function splitTextWithUrls(text: string): TextSegment[] {
  if (!text) return [];

  const segments: TextSegment[] = [];
  let cursor = 0;
  const re = new RegExp(HTTP_URL_RE.source, HTTP_URL_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const index = match.index;
    const raw = match[0];
    if (index > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, index) });
    }

    const { href, trailing } = splitUrlMatch(raw);
    if (href) {
      segments.push({ type: "url", value: href });
    }
    if (trailing) {
      segments.push({ type: "text", value: trailing });
    }

    cursor = index + raw.length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }

  return segments;
}
