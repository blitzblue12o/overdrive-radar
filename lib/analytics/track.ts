/**
 * Lightweight product analytics helpers.
 * Prefer Vercel Analytics custom events; never send sensitive payloads.
 */

type TrackProps = Record<string, string | number | boolean | null | undefined>;

export const AnalyticsEvents = {
  eventOpened: "event_opened",
  searchPerformed: "search_performed",
  locationChanged: "location_changed",
  distanceChanged: "distance_changed",
  categorySelected: "category_selected",
  websiteClicked: "website_clicked",
  directionsClicked: "directions_clicked",
  calendarClicked: "calendar_clicked",
  zeroResults: "zero_results",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

function sanitizeProps(props?: TrackProps): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    // Never emit free-text descriptions / precise addresses.
    if (/description|address|query_raw|lat|lng|latitude|longitude/i.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.slice(0, 120);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Fire a custom product event. No-ops when Analytics is unavailable.
 * Safe to call from client components only.
 */
export async function trackProductEvent(
  name: AnalyticsEventName,
  props?: TrackProps
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { track } = await import("@vercel/analytics");
    track(name, sanitizeProps(props));
  } catch {
    // Analytics optional — never break UX.
  }
}
