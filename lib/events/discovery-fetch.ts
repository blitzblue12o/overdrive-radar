import type { BBox } from "@/lib/events/types";

/** Inputs that may trigger `/api/events` — never includes selection/sheet UI. */
export type DiscoveryFetchInput = {
  experienceId: string;
  bbox: BBox;
  center: { lat: number; lng: number };
  distanceMiles: number;
  q: string;
  date: string | null;
  category: string | null;
};

/**
 * Build query params for the discovery event fetch.
 * Selection (`event=`), sheet state, and scroll position must not appear here.
 */
export function buildEventsApiSearchParams(
  input: DiscoveryFetchInput
): URLSearchParams {
  const params = new URLSearchParams({
    experience: input.experienceId,
    minLng: String(input.bbox.minLng),
    minLat: String(input.bbox.minLat),
    maxLng: String(input.bbox.maxLng),
    maxLat: String(input.bbox.maxLat),
    centerLat: String(input.center.lat),
    centerLng: String(input.center.lng),
    distance: String(input.distanceMiles),
  });
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.date) params.set("date", input.date);
  if (input.category) params.set("category", input.category);
  return params;
}

/** Stable key for discovery data changes (excludes selection / presentation). */
export function discoveryFetchKey(input: DiscoveryFetchInput): string {
  return buildEventsApiSearchParams(input).toString();
}
