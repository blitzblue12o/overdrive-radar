import {
  formatOccurrenceLabel,
  type OccurrenceInput,
} from "@/lib/events/occurrence";

/**
 * Compact occurrence label for lists/cards.
 * Prefer passing `all_day` when known (ICS VALUE=DATE).
 */
export function formatEventDateTime(
  startsAt: string,
  endsAt?: string | null,
  timeZone?: string | null,
  allDay?: boolean | null
): string {
  const input: OccurrenceInput = {
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: timeZone,
    all_day: allDay,
  };
  return formatOccurrenceLabel(input);
}

export {
  formatOccurrenceLabel,
  formatOccurrenceDetailLines,
  describeOccurrence,
  getEventTemporalDisplay,
} from "@/lib/events/occurrence";

export function formatCategoryLabel(
  category: string | null | undefined,
  labels: { value: string; label: string }[]
): string {
  if (!category) return "Event";
  return labels.find((c) => c.value === category)?.label ?? category;
}

/** Rough distance in miles using Haversine — Wave 1 display helper only. */
export function formatDistanceMiles(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number }
): string | null {
  if (!from) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  const miles = 2 * R * Math.asin(Math.sqrt(a));
  if (!Number.isFinite(miles)) return null;
  return `${miles.toFixed(1)} mi`;
}
