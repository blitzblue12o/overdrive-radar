/**
 * Event JSON-LD builders — only fields we actually know.
 */

import { isAbsoluteHttpUrl } from "@/lib/ingestion/urls";

export type EventJsonLdInput = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone?: string | null;
  venueName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string | null;
  imageUrl?: string | null;
  canonicalUrl: string;
  isFree?: boolean | null;
};

export function buildEventJsonLd(event: EventJsonLdInput): Record<string, unknown> {
  const location =
    event.venueName || event.address || (event.latitude != null && event.longitude != null)
      ? {
          "@type": "Place",
          ...(event.venueName ? { name: event.venueName } : {}),
          ...(event.address
            ? {
                address: {
                  "@type": "PostalAddress",
                  streetAddress: event.address,
                },
              }
            : {}),
          ...(event.latitude != null && event.longitude != null
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: event.latitude,
                  longitude: event.longitude,
                },
              }
            : {}),
        }
      : undefined;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url: event.canonicalUrl,
  };

  if (event.endsAt) jsonLd.endDate = event.endsAt;
  if (event.description) jsonLd.description = event.description;
  if (location) jsonLd.location = location;
  if (event.imageUrl && isAbsoluteHttpUrl(event.imageUrl)) {
    jsonLd.image = [event.imageUrl];
  }
  if (event.sourceUrl && isAbsoluteHttpUrl(event.sourceUrl)) {
    jsonLd.sameAs = event.sourceUrl;
  }
  if (event.isFree === true) {
    jsonLd.isAccessibleForFree = true;
  }

  return jsonLd;
}
