/**
 * Cheap field comparison + coordinate reuse for unchanged events.
 */

import { normalizeAddressKey } from "@/lib/ingestion/geocode";
import type { NormalizedEventInsert } from "@/lib/ingestion/types";

export type ExistingEventSnapshot = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  organizer_name: string | null;
  overdrive_category: string | null;
  event_discovery_category: string | null;
};

function normText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  return a === b;
}

export function hasFiniteCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/** True when content fields that matter for map/list display are unchanged. */
export function isEventMateriallyUnchanged(
  existing: ExistingEventSnapshot,
  next: NormalizedEventInsert
): boolean {
  return (
    normText(existing.title) === normText(next.title) &&
    normText(existing.description) === normText(next.description) &&
    sameInstant(existing.starts_at, next.starts_at) &&
    sameInstant(existing.ends_at, next.ends_at) &&
    normText(existing.timezone) === normText(next.timezone) &&
    normText(existing.venue_name) === normText(next.venue_name) &&
    normalizeAddressKey(existing.address ?? "") ===
      normalizeAddressKey(next.address ?? "") &&
    normText(existing.source_url) === normText(next.source_url) &&
    normText(existing.organizer_name) === normText(next.organizer_name) &&
    (existing.overdrive_category ?? null) === (next.overdrive_category ?? null) &&
    (existing.event_discovery_category ?? null) ===
      (next.event_discovery_category ?? null)
  );
}

export function addressUnchanged(
  existingAddress: string | null | undefined,
  nextAddress: string | null | undefined
): boolean {
  return (
    normalizeAddressKey(existingAddress ?? "") ===
    normalizeAddressKey(nextAddress ?? "")
  );
}

/**
 * Reuse stored coordinates when the normalized address is unchanged and
 * existing lat/lng are valid. Geocode only for new/changed/missing coords.
 */
export function reuseCoordinatesIfPossible<
  T extends {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    venue_name: string | null;
  },
>(
  event: T,
  existing: Pick<
    ExistingEventSnapshot,
    "address" | "venue_name" | "latitude" | "longitude"
  > | null
): T {
  if (!existing) return event;
  if (!hasFiniteCoords(existing.latitude, existing.longitude)) return event;

  const addressSame =
    addressUnchanged(existing.address, event.address) &&
    normalizeAddressKey(existing.venue_name ?? "") ===
      normalizeAddressKey(event.venue_name ?? "");

  if (!addressSame) return event;

  // Prefer feed-provided coords when present; otherwise reuse stored.
  if (hasFiniteCoords(event.latitude, event.longitude)) return event;

  return {
    ...event,
    latitude: existing.latitude,
    longitude: existing.longitude,
  };
}
