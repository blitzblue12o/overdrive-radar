import { getAdapter } from "@/lib/ingestion/adapters";
import { isSyncBatchId, type SyncBatchId } from "@/lib/ingestion/batches";
import { flagDuplicateIfNeeded } from "@/lib/ingestion/dedup";
import {
  isEventMateriallyUnchanged,
  reuseCoordinatesIfPossible,
  type ExistingEventSnapshot,
} from "@/lib/ingestion/event-diff";
import {
  createMapboxGeocoder,
  ensureCoordinates,
  GeocodeCache,
  type GeocodeFn,
} from "@/lib/ingestion/geocode";
import { isZeroEventAnomaly } from "@/lib/ingestion/health";
import { normalizeRawEvent, type NormalizeLog } from "@/lib/ingestion/normalize";
import {
  finishPipelineRun,
  recordSourceSyncRun,
  releaseSourceLock,
  startPipelineRun,
  summarizeSourceResults,
  tryAcquireSourceLock,
} from "@/lib/ingestion/pipeline-ledger";
import type {
  FetchEventsResult,
  NormalizedEventInsert,
  SourceRecord,
  SyncInvocation,
  SyncRunResult,
  SyncSourceResult,
  SyncSourceStatus,
} from "@/lib/ingestion/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const SOURCE_SELECT =
  "id,name,experience,adapter_type,feed_url,active,default_category_overdrive,default_category_event_discovery,geocode_context,geocode_override,location_overrides,publication_policy,sync_batch,http_etag,http_last_modified";

export type SyncDeps = {
  client: SupabaseClient;
  geocode?: GeocodeFn;
  now?: () => Date;
  log?: (message: string, extra?: Record<string, unknown>) => void;
  /** When set, only sync active sources in this batch. */
  batchId?: SyncBatchId | null;
  invocation?: SyncInvocation;
  /** Job type recorded in pipeline_runs. */
  jobType?: string;
  /**
   * When false, skip advisory locks (unit tests without RPC).
   * Production always uses locks (default true).
   */
  useSourceLocks?: boolean;
  /** When false, skip pipeline_runs / source_sync_runs ledger writes. */
  useLedger?: boolean;
};

function nowFn(deps: SyncDeps): Date {
  return (deps.now ?? (() => new Date()))();
}

export async function syncAllActiveSources(
  deps: SyncDeps
): Promise<SyncRunResult> {
  return syncActiveSources(deps);
}

/**
 * Shared sync engine used by batch cron routes and the legacy all-source route.
 */
export async function syncActiveSources(
  deps: SyncDeps
): Promise<SyncRunResult> {
  const started = nowFn(deps);
  const log = deps.log ?? (() => undefined);
  const invocation = deps.invocation ?? "unknown";
  const useLocks = deps.useSourceLocks !== false;
  const useLedger = deps.useLedger !== false;
  const batchId =
    deps.batchId === undefined || deps.batchId === null
      ? null
      : deps.batchId;

  if (batchId !== null && !isSyncBatchId(batchId)) {
    throw new Error(`Invalid sync batch id: ${batchId}`);
  }

  const jobType =
    deps.jobType ??
    (batchId === null ? "sync-sources" : `sync-sources-batch-${batchId}`);

  let query = deps.client
    .from("sources")
    .select(SOURCE_SELECT)
    .eq("active", true);

  if (batchId !== null) {
    query = query.eq("sync_batch", batchId);
  }

  const { data: sources, error } = await query.order("name");

  if (error) {
    throw new Error(`Failed to load sources: ${error.message}`);
  }

  let runId: string | null = null;
  if (useLedger) {
    try {
      runId = await startPipelineRun(deps.client, {
        jobType,
        batchId,
        invocation,
        startedAt: started,
      });
    } catch (err) {
      log("pipeline_run_start_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const geocodeCache = new GeocodeCache(
    deps.geocode ?? createMapboxGeocoder()
  );
  const results: SyncSourceResult[] = [];

  for (const row of (sources ?? []) as SourceRecord[]) {
    const sourceStarted = nowFn(deps);
    try {
      const result = await syncOneSource(deps.client, row, geocodeCache, log, {
        useLocks,
      });
      const sourceFinished = nowFn(deps);
      result.durationMs = Math.max(
        0,
        sourceFinished.getTime() - sourceStarted.getTime()
      );
      results.push(result);
      if (runId) {
        await recordSourceSyncRun(deps.client, {
          runId,
          sourceId: row.id,
          startedAt: sourceStarted,
          finishedAt: sourceFinished,
          result,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("source_failed", { source: row.name, message });
      await updateSourceStatus(deps.client, row.id, "failure", message);
      const sourceFinished = nowFn(deps);
      const failure: SyncSourceResult = {
        sourceId: row.id,
        sourceName: row.name,
        status: "failure",
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        durationMs: Math.max(
          0,
          sourceFinished.getTime() - sourceStarted.getTime()
        ),
        error: message,
      };
      results.push(failure);
      if (runId) {
        await recordSourceSyncRun(deps.client, {
          runId,
          sourceId: row.id,
          startedAt: sourceStarted,
          finishedAt: sourceFinished,
          result: failure,
        });
      }
    }
  }

  const finished = nowFn(deps);
  const durationMs = Math.max(0, finished.getTime() - started.getTime());
  const summary = summarizeSourceResults(results);

  if (runId) {
    await finishPipelineRun(deps.client, runId, results, { finishedAt: finished });
  }

  log("sync_complete", {
    jobType,
    batchId,
    invocation,
    runId,
    status: summary.status,
    durationMs,
    sourcesAttempted: summary.sourcesAttempted,
    sourcesSucceeded: summary.sourcesSucceeded,
    sourcesFailed: summary.sourcesFailed,
  });

  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    batchId,
    runId,
    invocation,
    status: summary.status,
    durationMs,
    sources: results,
  };
}

export type SyncOneSourceOptions = {
  useLocks?: boolean;
};

export async function syncOneSource(
  client: SupabaseClient,
  source: SourceRecord,
  geocodeCache: GeocodeCache,
  log: (message: string, extra?: Record<string, unknown>) => void = () =>
    undefined,
  options: SyncOneSourceOptions = {}
): Promise<SyncSourceResult> {
  const useLocks = options.useLocks !== false;

  if (useLocks) {
    let locked = false;
    try {
      locked = await tryAcquireSourceLock(client, source.id);
    } catch (err) {
      // Unit tests without RPC: treat missing lock function as unlocked path
      // only when the error indicates the function is absent.
      const message = err instanceof Error ? err.message : String(err);
      if (/Could not find the function|schema cache|does not exist/i.test(message)) {
        locked = true;
        log("source_lock_unavailable", { source: source.name, message });
      } else {
        throw err;
      }
    }
    if (!locked) {
      log("source_skipped_locked", { source: source.name });
      await updateSourceStatus(client, source.id, "skipped_locked", "lock unavailable");
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "skipped_locked",
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: "skipped_locked",
      };
    }
  }

  try {
    return await syncOneSourceUnlocked(client, source, geocodeCache, log);
  } finally {
    if (useLocks) {
      try {
        await releaseSourceLock(client, source.id);
      } catch {
        // best-effort unlock
      }
    }
  }
}

async function syncOneSourceUnlocked(
  client: SupabaseClient,
  source: SourceRecord,
  geocodeCache: GeocodeCache,
  log: (message: string, extra?: Record<string, unknown>) => void
): Promise<SyncSourceResult> {
  const adapter = getAdapter(source.adapter_type);
  const fetchResult = await adapter.fetchEvents(source, {
    etag: source.http_etag,
    lastModified: source.http_last_modified,
    onRetry: (attempt, err) => {
      log("feed_retry", {
        source: source.name,
        attempt,
        message: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const normalizedFetch = normalizeFetchResult(fetchResult);

  if (normalizedFetch.notModified) {
    await persistHttpValidators(client, source.id, {
      etag: normalizedFetch.etag ?? source.http_etag ?? null,
      lastModified:
        normalizedFetch.lastModified ?? source.http_last_modified ?? null,
    });
    await updateSourceStatus(client, source.id, "success", null);
    log("feed_not_modified", { source: source.name });
    return {
      sourceId: source.id,
      sourceName: source.name,
      status: "success",
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      notModified: true,
    };
  }

  if (
    normalizedFetch.etag != null ||
    normalizedFetch.lastModified != null
  ) {
    await persistHttpValidators(client, source.id, {
      etag: normalizedFetch.etag ?? null,
      lastModified: normalizedFetch.lastModified ?? null,
    });
  }

  const rawEvents = normalizedFetch.events;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let softErrors = 0;

  for (const raw of rawEvents) {
    try {
      const normalizeLog: NormalizeLog = { unmappedCategories: [] };
      let event = normalizeRawEvent(raw, source, normalizeLog);
      if (normalizeLog.unmappedCategories.length) {
        log("unmapped_categories", {
          source: source.name,
          categories: normalizeLog.unmappedCategories,
        });
      }

      const { data: existingRow } = await client
        .from("events")
        .select(
          "id, title, description, starts_at, ends_at, timezone, venue_name, address, latitude, longitude, source_url, organizer_name, overdrive_category, event_discovery_category, moderation_status, publication_status"
        )
        .eq("source_type", event.source_type)
        .eq("source_id", event.source_id)
        .maybeSingle();

      const existing = existingRow as ExistingEventSnapshot | null;

      if (existing?.id && isEventMateriallyUnchanged(existing, event)) {
        // Cheap touch — preserve last_source_sync_at semantics without geocode/rewrite.
        const { error: touchError } = await client
          .from("events")
          .update({ last_source_sync_at: event.last_source_sync_at })
          .eq("id", existing.id);
        if (touchError) throw new Error(touchError.message);
        skipped += 1;
        continue;
      }

      event = reuseCoordinatesIfPossible(event, existing);

      event = await ensureCoordinates(event, geocodeCache, {
        geocodeContext: source.geocode_context,
        geocodeOverride: source.geocode_override,
        locationOverrides: source.location_overrides,
      });

      const upsert = await upsertIngestedEvent(client, event);
      if (upsert.wasInserted) {
        inserted += 1;
        if (upsert.eventId) {
          await flagDuplicateIfNeeded(client, upsert.eventId);
        }
      } else {
        updated += 1;
      }
    } catch (err) {
      softErrors += 1;
      skipped += 1;
      log("event_failed", {
        source: source.name,
        uid: raw.uid,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const historicalCount = await countSourceEvents(client, source.id);
  const emptyInfo = isZeroEventAnomaly({
    fetched: rawEvents.length,
    historicalEventCount: Math.max(0, historicalCount - inserted),
  });

  let status: SyncSourceStatus;
  let error: string | undefined;
  let anomalyWarning: string | undefined;

  if (softErrors === 0 && rawEvents.length === 0) {
    status = "success_empty";
    if (emptyInfo.anomaly || emptyInfo.warning) {
      anomalyWarning = emptyInfo.warning ?? undefined;
    }
    if (normalizedFetch.feedNote) {
      anomalyWarning = [anomalyWarning, normalizedFetch.feedNote]
        .filter(Boolean)
        .join("; ");
    }
  } else if (softErrors === 0) {
    status = "success";
  } else if (softErrors < rawEvents.length) {
    status = "partial_failure";
    error = `${softErrors} event(s) failed`;
  } else {
    status = "failure";
    error = `${softErrors} event(s) failed`;
  }

  await updateSourceStatus(
    client,
    source.id,
    status,
    error ?? anomalyWarning ?? null
  );

  return {
    sourceId: source.id,
    sourceName: source.name,
    status,
    fetched: rawEvents.length,
    inserted,
    updated,
    skipped,
    error,
    anomalyWarning,
  };
}

function normalizeFetchResult(
  result: FetchEventsResult | RawSourceEventArrayLegacy
): FetchEventsResult {
  if (Array.isArray(result)) {
    return { events: result };
  }
  return result;
}

/** @deprecated adapters should return FetchEventsResult */
type RawSourceEventArrayLegacy = import("@/lib/ingestion/types").RawSourceEvent[];

async function upsertIngestedEvent(
  client: SupabaseClient,
  event: NormalizedEventInsert
): Promise<{ eventId: string | null; wasInserted: boolean }> {
  const payload = {
    experience: event.experience,
    overdrive_category: event.overdrive_category,
    event_discovery_category: event.event_discovery_category,
    title: event.title,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    venue_name: event.venue_name,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    source_type: event.source_type,
    source_id: event.source_id,
    source_url: event.source_url,
    source_metadata: event.source_metadata,
    organizer_name: event.organizer_name,
    moderation_status: event.moderation_status,
    publication_status: event.publication_status,
    event_status: event.event_status,
    last_source_sync_at: event.last_source_sync_at,
  };

  const { data, error } = await client.rpc("upsert_ingested_event", {
    p_event: payload,
  });

  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.event_id) {
      return {
        eventId: row.event_id as string,
        wasInserted: Boolean(row.was_inserted),
      };
    }
  }

  const rpcMissing =
    error &&
    /Could not find the function|schema cache|does not exist/i.test(
      error.message
    );

  if (error && !rpcMissing) {
    // Non-missing RPC errors: still attempt conflict-safe insert/update below
    // only for duplicate-key races; otherwise rethrow after fallback fails.
  }

  const { data: created, error: insertError } = await client
    .from("events")
    .insert(event)
    .select("id")
    .single();

  if (!insertError && created?.id) {
    return { eventId: created.id as string, wasInserted: true };
  }

  const isConflict =
    insertError?.code === "23505" ||
    /duplicate key|unique constraint/i.test(insertError?.message ?? "");

  if (!isConflict) {
    throw new Error(insertError?.message ?? error?.message ?? "upsert failed");
  }

  const { data: existing, error: lookupError } = await client
    .from("events")
    .select("id")
    .eq("source_type", event.source_type)
    .eq("source_id", event.source_id)
    .maybeSingle();

  if (lookupError || !existing?.id) {
    throw new Error(
      lookupError?.message ??
        insertError?.message ??
        "upsert conflict but existing row not found"
    );
  }

  const { error: updateError } = await client
    .from("events")
    .update({
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      timezone: event.timezone,
      venue_name: event.venue_name,
      address: event.address,
      latitude: event.latitude,
      longitude: event.longitude,
      source_url: event.source_url,
      source_metadata: event.source_metadata,
      organizer_name: event.organizer_name,
      last_source_sync_at: event.last_source_sync_at,
      overdrive_category: event.overdrive_category,
      event_discovery_category: event.event_discovery_category,
    })
    .eq("id", existing.id);

  if (updateError) throw new Error(updateError.message);
  return { eventId: existing.id as string, wasInserted: false };
}

async function countSourceEvents(
  client: SupabaseClient,
  sourceId: string
): Promise<number> {
  const { count, error } = await client
    .from("events")
    .select("id", { count: "exact", head: true })
    .like("source_id", `${sourceId}:%`);
  if (error) return 0;
  return count ?? 0;
}

async function persistHttpValidators(
  client: SupabaseClient,
  sourceId: string,
  validators: { etag: string | null; lastModified: string | null }
) {
  await client
    .from("sources")
    .update({
      http_etag: validators.etag,
      http_last_modified: validators.lastModified,
    })
    .eq("id", sourceId);
}

async function updateSourceStatus(
  client: SupabaseClient,
  sourceId: string,
  status: SyncSourceStatus,
  error: string | null
) {
  // skipped_locked should not advance last_synced_at (sync did not refresh).
  const patch: Record<string, unknown> = {
    last_sync_status: status,
    last_sync_error: error,
  };
  if (status !== "skipped_locked") {
    patch.last_synced_at = new Date().toISOString();
  }
  await client.from("sources").update(patch).eq("id", sourceId);
}
