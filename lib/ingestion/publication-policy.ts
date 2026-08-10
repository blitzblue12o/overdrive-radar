/**
 * EventDiscovery V1 deterministic publication-eligibility evaluator (M1).
 *
 * Pure / read-only: no DB writes, network, Mapbox, or LLM.
 * "eligible" means event-level deterministic rules pass — NOT that the event
 * should be auto-published. Source trust + controlled publish live in
 * publish-eligible.ts (trusted auto-select, or probation + explicit allowlist).
 */

import { isVirtualLocation } from "@/lib/ingestion/virtual-location";

export const PUBLICATION_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;

export type PublicationDisposition = "eligible" | "review" | "ineligible";

export type PublicationPolicyReason =
  | "past_event"
  | "beyond_publication_horizon"
  | "administrative_event"
  | "closure_or_observance"
  | "cancelled_event"
  | "missing_coordinates"
  | "possible_duplicate";

export type PublicationPolicyEvent = {
  title: string;
  starts_at: string | Date;
  venue_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  possible_duplicate_of?: string | null;
};

/** Optional source context for future M2; unused by V1 event-level rules. */
export type PublicationPolicySource = {
  id?: string;
  name?: string;
} | null;

export type PublicationPolicyResult = {
  disposition: PublicationDisposition;
  reasons: PublicationPolicyReason[];
};

const INELIGIBLE_REASONS = new Set<PublicationPolicyReason>([
  "past_event",
  "beyond_publication_horizon",
  "administrative_event",
  "closure_or_observance",
  "cancelled_event",
]);

const REVIEW_REASONS = new Set<PublicationPolicyReason>([
  "missing_coordinates",
  "possible_duplicate",
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&apos;?/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Narrow administrative title patterns — not every "meeting".
 * Conservative on purpose; expand only with evidence.
 */
export function isAdministrativeTitle(title: string): boolean {
  const t = normalizeTitle(title);
  if (!t) return false;

  return (
    /\bcity council\b/.test(t) ||
    /\bplanning commission\b/.test(t) ||
    /\bcommission meeting\b/.test(t) ||
    /\bpublic hearing\b/.test(t) ||
    /\bboard meeting\b/.test(t) ||
    /\badvisory board\b/.test(t) ||
    /\bcommittee meeting\b/.test(t) ||
    /\bregular meeting\b/.test(t) ||
    /\bagency meeting\b/.test(t) ||
    (/\bwater agency\b/.test(t) && /\bmeeting\b/.test(t)) ||
    /\bbid opening\b/.test(t) ||
    /\bpbid\b/.test(t) ||
    /\bproperty business improvement\b/.test(t)
  );
}

/** Titles explicitly marked canceled/cancelled (not soft “cancel anytime” prose). */
export function isCancelledTitle(title: string): boolean {
  const t = normalizeTitle(title);
  if (!t) return false;
  return (
    /^(canceled|cancelled)\b/.test(t) ||
    /\b(canceled|cancelled)\s*[-:]\s*/.test(t)
  );
}

/**
 * Narrow closure / observance patterns.
 * "Holiday Festival" must NOT match.
 */
export function isClosureOrObservanceTitle(title: string): boolean {
  const t = normalizeTitle(title);
  if (!t) return false;

  return (
    /\badministrative offices?\s+closed\b/.test(t) ||
    /\bcity hall\b.*\bclosed\b/.test(t) ||
    /\bholiday closure\b/.test(t) ||
    /\bchristmas\b.*\bobserved\b/.test(t) ||
    /\bnew year'?s?\b.*\bobserved\b/.test(t) ||
    /\bthanksgiving\b.*\bobserved\b/.test(t)
  );
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function dispositionFromReasons(
  reasons: PublicationPolicyReason[]
): PublicationDisposition {
  if (reasons.some((r) => INELIGIBLE_REASONS.has(r))) return "ineligible";
  if (reasons.some((r) => REVIEW_REASONS.has(r))) return "review";
  return "eligible";
}

/**
 * Evaluate EventDiscovery event-level publication eligibility.
 * Collects ALL applicable reasons; disposition uses INELIGIBLE > REVIEW > ELIGIBLE.
 */
export function evaluatePublicationEligibility(
  event: PublicationPolicyEvent,
  _source: PublicationPolicySource,
  now: Date
): PublicationPolicyResult {
  const reasons: PublicationPolicyReason[] = [];
  const startsAt = toDate(event.starts_at);

  if (Number.isFinite(startsAt.getTime()) && startsAt.getTime() < now.getTime()) {
    reasons.push("past_event");
  }

  const horizonEnd = new Date(now.getTime() + PUBLICATION_HORIZON_MS);
  if (
    Number.isFinite(startsAt.getTime()) &&
    startsAt.getTime() > horizonEnd.getTime()
  ) {
    reasons.push("beyond_publication_horizon");
  }

  if (isCancelledTitle(event.title)) {
    reasons.push("cancelled_event");
  }

  if (isAdministrativeTitle(event.title)) {
    reasons.push("administrative_event");
  }

  if (isClosureOrObservanceTitle(event.title)) {
    reasons.push("closure_or_observance");
  }

  const virtual = isVirtualLocation(event.venue_name, event.address);
  const missingCoords =
    event.latitude == null ||
    event.longitude == null ||
    !Number.isFinite(event.latitude) ||
    !Number.isFinite(event.longitude);

  if (missingCoords && !virtual) {
    reasons.push("missing_coordinates");
  }

  if (event.possible_duplicate_of != null && event.possible_duplicate_of !== "") {
    reasons.push("possible_duplicate");
  }

  return {
    disposition: dispositionFromReasons(reasons),
    reasons,
  };
}
