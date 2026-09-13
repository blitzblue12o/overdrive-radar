/**
 * Pipeline run ledger helpers (pipeline_runs + source_sync_runs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PipelineRunStatus,
  SyncInvocation,
  SyncSourceResult,
  SyncSourceStatus,
} from "@/lib/ingestion/types";

export type PipelineRunRow = {
  id: string;
  job_type: string;
  batch_id: number | null;
  invocation: SyncInvocation;
  started_at: string;
  finished_at: string | null;
  status: PipelineRunStatus;
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  sources_skipped_locked: number;
  events_fetched: number;
  events_inserted: number;
  events_updated: number;
  events_skipped: number;
  duration_ms: number | null;
  error_summary: string | null;
};

export async function startPipelineRun(
  client: SupabaseClient,
  options: {
    jobType: string;
    batchId?: number | null;
    invocation: SyncInvocation;
    startedAt?: Date;
  }
): Promise<string> {
  const { data, error } = await client
    .from("pipeline_runs")
    .insert({
      job_type: options.jobType,
      batch_id: options.batchId ?? null,
      invocation: options.invocation,
      started_at: (options.startedAt ?? new Date()).toISOString(),
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to start pipeline run: ${error?.message ?? "no id"}`);
  }
  return data.id as string;
}

export function summarizeSourceResults(sources: SyncSourceResult[]): {
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  sourcesSkippedLocked: number;
  eventsFetched: number;
  eventsInserted: number;
  eventsUpdated: number;
  eventsSkipped: number;
  status: PipelineRunStatus;
  errorSummary: string | null;
} {
  const sourcesAttempted = sources.length;
  const sourcesSkippedLocked = sources.filter(
    (s) => s.status === "skipped_locked"
  ).length;
  const sourcesFailed = sources.filter((s) => s.status === "failure").length;
  const sourcesSucceeded = sources.filter(
    (s) =>
      s.status === "success" ||
      s.status === "success_empty" ||
      s.status === "partial_failure"
  ).length;

  const eventsFetched = sources.reduce((n, s) => n + s.fetched, 0);
  const eventsInserted = sources.reduce((n, s) => n + s.inserted, 0);
  const eventsUpdated = sources.reduce((n, s) => n + s.updated, 0);
  const eventsSkipped = sources.reduce((n, s) => n + s.skipped, 0);

  const hardFailures = sourcesFailed;
  const partials = sources.filter((s) => s.status === "partial_failure").length;
  const anomalies = sources.filter((s) => s.status === "success_empty").length;

  let status: PipelineRunStatus = "success";
  if (sourcesAttempted === 0) {
    status = "success";
  } else if (hardFailures === sourcesAttempted - sourcesSkippedLocked && hardFailures > 0) {
    status = "failure";
  } else if (hardFailures > 0 || partials > 0) {
    status = "partial_failure";
  } else if (anomalies > 0 && hardFailures === 0) {
    // Empty-feed anomalies are still a completed run with warnings.
    status = "success";
  }

  const errors = sources
    .filter((s) => s.error || s.anomalyWarning)
    .map((s) => `${s.sourceName}: ${s.error ?? s.anomalyWarning}`)
    .slice(0, 10);

  return {
    sourcesAttempted,
    sourcesSucceeded,
    sourcesFailed,
    sourcesSkippedLocked,
    eventsFetched,
    eventsInserted,
    eventsUpdated,
    eventsSkipped,
    status,
    errorSummary: errors.length ? errors.join("; ") : null,
  };
}

export async function finishPipelineRun(
  client: SupabaseClient,
  runId: string,
  sources: SyncSourceResult[],
  options: {
    finishedAt?: Date;
    statusOverride?: PipelineRunStatus;
  } = {}
): Promise<PipelineRunRow | null> {
  const summary = summarizeSourceResults(sources);
  const finishedAt = options.finishedAt ?? new Date();

  const { data: existing } = await client
    .from("pipeline_runs")
    .select("started_at")
    .eq("id", runId)
    .maybeSingle();

  const startedMs = existing?.started_at
    ? Date.parse(existing.started_at as string)
    : NaN;
  const durationMs = Number.isFinite(startedMs)
    ? Math.max(0, finishedAt.getTime() - startedMs)
    : null;

  const { data, error } = await client
    .from("pipeline_runs")
    .update({
      finished_at: finishedAt.toISOString(),
      status: options.statusOverride ?? summary.status,
      sources_attempted: summary.sourcesAttempted,
      sources_succeeded: summary.sourcesSucceeded,
      sources_failed: summary.sourcesFailed,
      sources_skipped_locked: summary.sourcesSkippedLocked,
      events_fetched: summary.eventsFetched,
      events_inserted: summary.eventsInserted,
      events_updated: summary.eventsUpdated,
      events_skipped: summary.eventsSkipped,
      duration_ms: durationMs,
      error_summary: summary.errorSummary,
    })
    .eq("id", runId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[pipeline_runs] finish failed", error.message);
    return null;
  }
  return data as PipelineRunRow | null;
}

export async function recordSourceSyncRun(
  client: SupabaseClient,
  options: {
    runId: string;
    sourceId: string;
    startedAt: Date;
    finishedAt: Date;
    result: SyncSourceResult;
  }
): Promise<void> {
  const durationMs = Math.max(
    0,
    options.finishedAt.getTime() - options.startedAt.getTime()
  );
  const status: SyncSourceStatus = options.result.status;
  const { error } = await client.from("source_sync_runs").insert({
    run_id: options.runId,
    source_id: options.sourceId,
    started_at: options.startedAt.toISOString(),
    finished_at: options.finishedAt.toISOString(),
    status,
    fetched: options.result.fetched,
    inserted: options.result.inserted,
    updated: options.result.updated,
    skipped: options.result.skipped,
    duration_ms: durationMs,
    error: options.result.error ?? null,
    anomaly_warning: options.result.anomalyWarning ?? null,
  });
  if (error) {
    console.error("[source_sync_runs] insert failed", error.message);
  }
}

export async function tryAcquireSourceLock(
  client: SupabaseClient,
  sourceId: string
): Promise<boolean> {
  const { data, error } = await client.rpc("try_acquire_source_sync_lock", {
    p_source_id: sourceId,
  });
  if (error) {
    // If lock RPC is unavailable (tests / pre-migration), proceed without lock
    // only when explicitly in a non-production mock — otherwise deny overlap safety.
    throw new Error(`Source lock acquire failed: ${error.message}`);
  }
  return Boolean(data);
}

export async function releaseSourceLock(
  client: SupabaseClient,
  sourceId: string
): Promise<void> {
  const { error } = await client.rpc("release_source_sync_lock", {
    p_source_id: sourceId,
  });
  if (error) {
    console.error("[source_lock] release failed", error.message);
  }
}
