/**
 * M2 controlled publication executor.
 *
 * Separates mutation from the pure M1 evaluator.
 * Manual scripts only — never called from cron/sync.
 */

import {
  evaluatePublicationEligibility,
  type PublicationDisposition,
  type PublicationPolicyReason,
} from "@/lib/ingestion/publication-policy";
import type { ExperienceId } from "@/lib/config/experiences";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Hard ceiling for M2 gate. Larger limits are refused. */
export const M2_MAX_PUBLISH_LIMIT = 10;

export type SourcePublicationPolicy = "probation" | "trusted";

export type DecisionSource = "manual" | "automation";

export type PublishCandidateEvent = {
  id: string;
  title: string;
  starts_at: string;
  venue_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  possible_duplicate_of: string | null;
  experience: ExperienceId | string;
  source_type: string;
  moderation_status: string;
  publication_status: string;
  decision_source: DecisionSource | string | null;
  decision_reason: string | null;
  decision_at: string | null;
};

export type PublishSource = {
  id: string;
  name: string;
  experience: ExperienceId | string;
  adapter_type: string;
  publication_policy: string | null;
};

export type SelectedPublishEvent = PublishCandidateEvent & {
  disposition: PublicationDisposition;
  reasons: PublicationPolicyReason[];
};

export type PublishEligiblePreview = {
  mode: "preview" | "execute";
  source: PublishSource;
  now: string;
  limit: number;
  candidateCount: number;
  selected: SelectedPublishEvent[];
  skipped: {
    review: number;
    ineligible: number;
    humanProtected: number;
    notUpcoming: number;
  };
};

export type PublishEligibleResult = PublishEligiblePreview & {
  attempted: number;
  published: number;
  failed: number;
  publishedIds: string[];
  failedIds: string[];
  error?: string;
};

export class PublishEligibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishEligibleError";
  }
}

/** Human / non-pending decisions must never be overwritten by automation. */
export function isHumanProtected(event: {
  moderation_status: string;
  publication_status: string;
  decision_source?: string | null;
}): boolean {
  if (event.decision_source === "manual") return true;
  if (event.moderation_status !== "pending") return true;
  if (event.publication_status !== "draft") return true;
  return false;
}

export function assertM2PublishLimit(limit: number | undefined | null): number {
  if (limit == null || !Number.isFinite(limit)) {
    throw new PublishEligibleError(
      "Missing --limit. M2 refuses to publish without an explicit limit (max 10)."
    );
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new PublishEligibleError(
      `Invalid --limit ${limit}. Must be an integer from 1 to ${M2_MAX_PUBLISH_LIMIT}.`
    );
  }
  if (limit > M2_MAX_PUBLISH_LIMIT) {
    throw new PublishEligibleError(
      `Refusing --limit ${limit}. M2 hard ceiling is ${M2_MAX_PUBLISH_LIMIT}.`
    );
  }
  return limit;
}

export function assertTrustedEventDiscoverySource(source: PublishSource): void {
  if (source.experience !== "event_discovery") {
    throw new PublishEligibleError(
      `Source experience is "${source.experience}"; only event_discovery may auto-publish.`
    );
  }
  if (source.publication_policy !== "trusted") {
    throw new PublishEligibleError(
      `Source publication_policy is "${source.publication_policy ?? "null"}"; only trusted sources may auto-publish (fail closed).`
    );
  }
}

/**
 * Trusted sources may select without an allowlist.
 * Probation sources may publish ONLY with an explicit event ID allowlist
 * (controlled operator cohort). Never promote policy to trusted for this.
 */
export function assertSourceMayPublish(
  source: PublishSource,
  options?: { hasAllowlist?: boolean }
): void {
  if (source.experience !== "event_discovery") {
    throw new PublishEligibleError(
      `Source experience is "${source.experience}"; only event_discovery may auto-publish.`
    );
  }
  if (source.publication_policy === "trusted") return;
  if (source.publication_policy === "probation" && options?.hasAllowlist) {
    return;
  }
  throw new PublishEligibleError(
    `Source publication_policy is "${source.publication_policy ?? "null"}"; probation sources require an explicit --ids allowlist (fail closed). Do not promote to trusted merely to publish.`
  );
}

export function decisionReasonForSource(source: PublishSource): string {
  return source.publication_policy === "trusted"
    ? "trusted_source+eligible"
    : "controlled_allowlist+eligible";
}

/**
 * Pure selection: earliest upcoming eligible pending/draft events.
 * Does not mutate.
 *
 * Optional `eventIds` allowlist (curated cohorts): still requires M1
 * eligibility, upcoming, pending/draft, and the hard limit ≤ 10. Never bypasses
 * the evaluator — only restricts which candidate rows may be considered.
 * Probation sources are allowed only when `eventIds` is non-empty.
 */
export function selectEligibleForPublish(options: {
  source: PublishSource;
  events: PublishCandidateEvent[];
  now: Date;
  limit: number;
  eventIds?: string[] | null;
}): {
  selected: SelectedPublishEvent[];
  skipped: PublishEligiblePreview["skipped"];
  candidateCount: number;
} {
  const allow =
    options.eventIds && options.eventIds.length > 0
      ? new Set(options.eventIds)
      : null;
  assertSourceMayPublish(options.source, { hasAllowlist: Boolean(allow) });
  const limit = assertM2PublishLimit(options.limit);

  const skipped = {
    review: 0,
    ineligible: 0,
    humanProtected: 0,
    notUpcoming: 0,
  };

  const nowMs = options.now.getTime();
  const selected: SelectedPublishEvent[] = [];

  const ordered = [...options.events].sort((a, b) => {
    const byStart = a.starts_at.localeCompare(b.starts_at);
    if (byStart !== 0) return byStart;
    return a.id.localeCompare(b.id);
  });

  // Match the source adapter (ics, librarycalendar, rss, …). Hardcoding
  // "ics" falsely excluded LibraryCalendar and other ED adapters.
  const expectedSourceType = options.source.adapter_type;

  for (const event of ordered) {
    if (allow && !allow.has(event.id)) continue;
    if (
      event.experience !== "event_discovery" ||
      event.source_type !== expectedSourceType
    ) {
      continue;
    }

    if (isHumanProtected(event)) {
      skipped.humanProtected += 1;
      continue;
    }

    const startsAt = new Date(event.starts_at).getTime();
    if (!Number.isFinite(startsAt) || startsAt < nowMs) {
      skipped.notUpcoming += 1;
      continue;
    }

    let evaluation;
    try {
      evaluation = evaluatePublicationEligibility(
        event,
        { id: options.source.id, name: options.source.name },
        options.now
      );
    } catch {
      // Fail closed — do not select on evaluator errors.
      skipped.ineligible += 1;
      continue;
    }

    if (evaluation.disposition === "review") {
      skipped.review += 1;
      continue;
    }
    if (evaluation.disposition === "ineligible") {
      skipped.ineligible += 1;
      continue;
    }

    selected.push({
      ...event,
      disposition: evaluation.disposition,
      reasons: evaluation.reasons,
    });
    if (selected.length >= limit) break;
  }

  return {
    selected,
    skipped,
    candidateCount: selected.length + skipped.review + skipped.ineligible,
  };
}

async function loadSource(
  client: SupabaseClient,
  sourceIdOrName: string
): Promise<PublishSource> {
  const byId = await client
    .from("sources")
    .select("id,name,experience,adapter_type,publication_policy")
    .eq("id", sourceIdOrName)
    .maybeSingle();

  if (byId.data) return byId.data as PublishSource;
  if (byId.error && !byId.error.message.includes("invalid input syntax")) {
    // ignore uuid parse noise; fall through to name lookup
  }

  const byName = await client
    .from("sources")
    .select("id,name,experience,adapter_type,publication_policy")
    .eq("name", sourceIdOrName)
    .eq("experience", "event_discovery")
    .maybeSingle();

  if (byName.error) throw new PublishEligibleError(byName.error.message);
  if (!byName.data) {
    throw new PublishEligibleError(`Source not found: ${sourceIdOrName}`);
  }
  return byName.data as PublishSource;
}

async function loadPendingSourceEvents(
  client: SupabaseClient,
  source: PublishSource
): Promise<PublishCandidateEvent[]> {
  const prefix = `${source.id}:`;
  const pageSize = 1000;
  const rows: PublishCandidateEvent[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("events")
      .select(
        "id,title,starts_at,venue_name,address,latitude,longitude,possible_duplicate_of,experience,source_type,moderation_status,publication_status,decision_source,decision_reason,decision_at"
      )
      .eq("experience", "event_discovery")
      .eq("source_type", source.adapter_type)
      .eq("moderation_status", "pending")
      .eq("publication_status", "draft")
      .like("source_id", `${prefix}%`)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw new PublishEligibleError(error.message);
    const page = (data ?? []) as PublishCandidateEvent[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function previewPublishEligible(
  client: SupabaseClient,
  options: {
    sourceIdOrName: string;
    limit: number;
    now?: Date;
    eventIds?: string[] | null;
  }
): Promise<PublishEligiblePreview> {
  const now = options.now ?? new Date();
  const limit = assertM2PublishLimit(options.limit);
  const source = await loadSource(client, options.sourceIdOrName);
  assertSourceMayPublish(source, {
    hasAllowlist: Boolean(options.eventIds && options.eventIds.length > 0),
  });

  const events = await loadPendingSourceEvents(client, source);
  const { selected, skipped, candidateCount } = selectEligibleForPublish({
    source,
    events,
    now,
    limit,
    eventIds: options.eventIds,
  });

  return {
    mode: "preview",
    source,
    now: now.toISOString(),
    limit,
    candidateCount,
    selected,
    skipped,
  };
}

export async function executePublishEligible(
  client: SupabaseClient,
  options: {
    sourceIdOrName: string;
    limit: number;
    now?: Date;
    execute: boolean;
    eventIds?: string[] | null;
  }
): Promise<PublishEligibleResult> {
  const preview = await previewPublishEligible(client, options);

  if (!options.execute) {
    return {
      ...preview,
      mode: "preview",
      attempted: 0,
      published: 0,
      failed: 0,
      publishedIds: [],
      failedIds: [],
    };
  }

  if (preview.selected.length === 0) {
    return {
      ...preview,
      mode: "execute",
      attempted: 0,
      published: 0,
      failed: 0,
      publishedIds: [],
      failedIds: [],
    };
  }

  const nowIso = (options.now ?? new Date()).toISOString();
  const ids = preview.selected.map((e) => e.id);
  const decisionReason = decisionReasonForSource(preview.source);

  // Single guarded update: only untouched pending/draft rows can flip.
  const { data: updated, error } = await client
    .from("events")
    .update({
      moderation_status: "approved",
      publication_status: "published",
      decision_source: "automation",
      decision_reason: decisionReason,
      decision_at: nowIso,
      last_verified_at: nowIso,
    })
    .in("id", ids)
    .eq("experience", "event_discovery")
    .eq("source_type", preview.source.adapter_type)
    .eq("moderation_status", "pending")
    .eq("publication_status", "draft")
    .is("decision_source", null)
    .select("id");

  if (error) {
    return {
      ...preview,
      mode: "execute",
      attempted: ids.length,
      published: 0,
      failed: ids.length,
      publishedIds: [],
      failedIds: ids,
      error: error.message,
    };
  }

  const publishedIds = (updated ?? []).map((r) => r.id as string);
  const publishedSet = new Set(publishedIds);
  const failedIds = ids.filter((id) => !publishedSet.has(id));

  return {
    ...preview,
    mode: "execute",
    attempted: ids.length,
    published: publishedIds.length,
    failed: failedIds.length,
    publishedIds,
    failedIds,
    error:
      failedIds.length > 0
        ? `Partial failure: ${failedIds.length} of ${ids.length} rows did not update`
        : undefined,
  };
}
