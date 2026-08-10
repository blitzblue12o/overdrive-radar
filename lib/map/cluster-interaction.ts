import { normalizeDisplayText } from "@/lib/events/display-text";
import type { EventFeatureProperties } from "@/lib/events/types";

/** Minimal leaf shape used by cluster picker (from Mapbox getClusterLeaves). */
export type ClusterLeafEvent = Pick<
  EventFeatureProperties,
  | "id"
  | "title"
  | "starts_at"
  | "ends_at"
  | "timezone"
  | "venue_name"
  | "address"
  | "all_day"
>;

/**
 * Whether easeTo(expansionZoom) is worth doing before opening a leaf picker.
 * Colocated points often report an expansion zoom ≤ current zoom.
 */
export function clusterCanExpandSpatially(
  currentZoom: number,
  expansionZoom: number | null | undefined,
  epsilon = 0.05
): boolean {
  if (expansionZoom == null || !Number.isFinite(expansionZoom)) return false;
  return expansionZoom > currentZoom + epsilon;
}

/** True when every leaf shares the same coordinates (within a tiny epsilon). */
export function clusterLeavesAreColocated(
  coordinates: Array<[number, number] | null | undefined>,
  epsilon = 1e-7
): boolean {
  const valid = coordinates.filter(
    (c): c is [number, number] =>
      Array.isArray(c) &&
      c.length >= 2 &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1])
  );
  if (valid.length <= 1) return true;
  const [lng0, lat0] = valid[0];
  return valid.every(
    ([lng, lat]) =>
      Math.abs(lng - lng0) <= epsilon && Math.abs(lat - lat0) <= epsilon
  );
}

/**
 * Decide cluster click outcome after Mapbox expansion-zoom lookup.
 * Prefer spatial expand first; only pick leaves when expansion is not useful.
 */
export function resolveClusterClickAction(input: {
  currentZoom: number;
  expansionZoom: number | null | undefined;
}): "expand" | "pick" {
  return clusterCanExpandSpatially(input.currentZoom, input.expansionZoom)
    ? "expand"
    : "pick";
}

export function leafEventFromFeature(feature: {
  properties?: GeoJSON.GeoJsonProperties;
}): ClusterLeafEvent | null {
  const p = feature.properties;
  if (!p || typeof p.id !== "string" || !p.id) return null;
  if (p.cluster) return null;
  return {
    id: p.id,
    title: typeof p.title === "string" ? p.title : "Event",
    starts_at: typeof p.starts_at === "string" ? p.starts_at : "",
    ends_at: typeof p.ends_at === "string" ? p.ends_at : null,
    timezone: typeof p.timezone === "string" ? p.timezone : null,
    venue_name: typeof p.venue_name === "string" ? p.venue_name : null,
    address: typeof p.address === "string" ? p.address : null,
    all_day: p.all_day === true || p.all_day === "true",
  };
}

export function clusterPickerHeading(
  events: Array<{ venue_name?: string | null; address?: string | null }>,
  count = events.length
): string {
  const n = count;
  const label = n === 1 ? "1 event" : `${n} events`;
  const venues = new Set<string>();
  for (const e of events) {
    const v = normalizeDisplayText(e.venue_name);
    if (v) venues.add(v.toLowerCase());
  }
  if (venues.size === 1) {
    const display =
      normalizeDisplayText(events.find((e) => e.venue_name)?.venue_name) ??
      "this location";
    // Prefer a short facility name before " - address" when present.
    const short = display.split(" - ")[0]?.trim() || display;
    return `${label} at ${short}`;
  }
  return `${label} at this location`;
}

/** Keep picker only while every listed id is still in the active result set. */
export function shouldClearClusterPicker(
  pickerIds: string[],
  activeEventIds: Iterable<string>
): boolean {
  if (pickerIds.length === 0) return true;
  const active = new Set(activeEventIds);
  return pickerIds.some((id) => !active.has(id));
}
