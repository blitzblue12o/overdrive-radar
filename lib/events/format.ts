export function formatEventDateTime(
  startsAt: string,
  endsAt?: string | null,
  timeZone?: string | null
): string {
  const start = new Date(startsAt);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (timeZone) options.timeZone = timeZone;

  const startLabel = new Intl.DateTimeFormat("en-US", options).format(start);

  if (!endsAt) return startLabel;

  const end = new Date(endsAt);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(end);

  return `${startLabel} – ${endLabel}`;
}

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
