/**
 * Scheduler vs source health derived from the run ledger + source columns.
 * Publication health remains informational (auto-publish not enabled).
 */

export type SourceFreshness = "healthy" | "warning" | "stale" | "unknown";

export type CadenceMode = "daily" | "every_8h" | "every_4h";

export const HEALTH_THRESHOLDS: Record<
  CadenceMode,
  { healthyMs: number; warningMs: number }
> = {
  // Daily stabilization
  daily: {
    healthyMs: 36 * 60 * 60 * 1000,
    warningMs: 48 * 60 * 60 * 1000,
  },
  every_8h: {
    healthyMs: 16 * 60 * 60 * 1000,
    warningMs: 24 * 60 * 60 * 1000,
  },
  // After 4-hour cadence ramp
  every_4h: {
    healthyMs: 8 * 60 * 60 * 1000,
    warningMs: 12 * 60 * 60 * 1000,
  },
};

/** Current stabilization cadence — do not ramp until gate is met. */
export const CURRENT_CADENCE_MODE: CadenceMode = "daily";

export const BATCH_RUNTIME_TARGET_MS = 120_000;
export const BATCH_RUNTIME_WARNING_MS = 180_000;
export const SOURCE_RUNTIME_TYPICAL_MS = 30_000;

export function classifySourceFreshness(
  lastSuccessfulSyncAt: string | Date | null | undefined,
  now: Date = new Date(),
  mode: CadenceMode = CURRENT_CADENCE_MODE
): SourceFreshness {
  if (!lastSuccessfulSyncAt) return "unknown";
  const ts =
    typeof lastSuccessfulSyncAt === "string"
      ? Date.parse(lastSuccessfulSyncAt)
      : lastSuccessfulSyncAt.getTime();
  if (!Number.isFinite(ts)) return "unknown";
  const age = now.getTime() - ts;
  const { healthyMs, warningMs } = HEALTH_THRESHOLDS[mode];
  if (age < healthyMs) return "healthy";
  if (age < warningMs) return "warning";
  return "stale";
}

export type SchedulerBatchHealth = {
  batchId: number;
  status: "healthy" | "missing" | "failed" | "stale";
  lastFinishedAt: string | null;
  lastStatus: string | null;
};

export type SchedulerHealthSummary = {
  overall: "healthy" | "degraded" | "unhealthy";
  batches: SchedulerBatchHealth[];
};

/**
 * Scheduler health: each expected batch completed successfully recently.
 * Uses pipeline_runs ledger rows, not sources.last_synced_at.
 */
export function summarizeSchedulerHealth(
  latestByBatch: Array<{
    batchId: number;
    finishedAt: string | null;
    status: string | null;
  }>,
  now: Date = new Date(),
  mode: CadenceMode = CURRENT_CADENCE_MODE
): SchedulerHealthSummary {
  const expected = [0, 1, 2, 3];
  const byId = new Map(latestByBatch.map((b) => [b.batchId, b]));
  const batches: SchedulerBatchHealth[] = expected.map((batchId) => {
    const row = byId.get(batchId);
    if (!row?.finishedAt) {
      return {
        batchId,
        status: "missing",
        lastFinishedAt: null,
        lastStatus: row?.status ?? null,
      };
    }
    if (row.status === "failure" || row.status === "abandoned" || row.status === "timed_out") {
      return {
        batchId,
        status: "failed",
        lastFinishedAt: row.finishedAt,
        lastStatus: row.status,
      };
    }
    if (row.status === "partial_failure") {
      return {
        batchId,
        status: "failed",
        lastFinishedAt: row.finishedAt,
        lastStatus: row.status,
      };
    }
    const freshness = classifySourceFreshness(row.finishedAt, now, mode);
    if (freshness === "stale" || freshness === "unknown" || freshness === "warning") {
      return {
        batchId,
        status: "stale",
        lastFinishedAt: row.finishedAt,
        lastStatus: row.status,
      };
    }
    return {
      batchId,
      status: "healthy",
      lastFinishedAt: row.finishedAt,
      lastStatus: row.status,
    };
  });

  const unhealthy = batches.some((b) => b.status === "missing" || b.status === "failed");
  const degraded = batches.some((b) => b.status === "stale");
  return {
    overall: unhealthy ? "unhealthy" : degraded ? "degraded" : "healthy",
    batches,
  };
}

export type SourceHealthRow = {
  sourceId: string;
  sourceName: string;
  status: SourceFreshness;
  lastSyncStatus: string | null;
  lastSuccessfulAt: string | null;
  anomaly: boolean;
};

export function classifySourceHealth(options: {
  sourceId: string;
  sourceName: string;
  lastSyncStatus: string | null;
  /** Prefer latest successful source_sync_runs finished_at when available. */
  lastSuccessfulRunAt: string | null;
  lastSyncedAt?: string | null;
  now?: Date;
  mode?: CadenceMode;
}): SourceHealthRow {
  const lastSuccessfulAt =
    options.lastSuccessfulRunAt ?? options.lastSyncedAt ?? null;
  const status = classifySourceFreshness(
    lastSuccessfulAt,
    options.now,
    options.mode
  );
  return {
    sourceId: options.sourceId,
    sourceName: options.sourceName,
    status,
    lastSyncStatus: options.lastSyncStatus,
    lastSuccessfulAt,
    anomaly: options.lastSyncStatus === "success_empty",
  };
}

export function classifyBatchRuntime(durationMs: number): {
  ok: boolean;
  warning: boolean;
  overBudget: boolean;
} {
  return {
    ok: durationMs < BATCH_RUNTIME_TARGET_MS,
    warning: durationMs >= BATCH_RUNTIME_WARNING_MS,
    overBudget: durationMs >= BATCH_RUNTIME_WARNING_MS,
  };
}

/**
 * Flag sudden empty feeds when the source historically produced events.
 */
export function isZeroEventAnomaly(options: {
  fetched: number;
  historicalEventCount: number;
  fetchFailed?: boolean;
}): { anomaly: boolean; warning: string | null } {
  if (options.fetchFailed) {
    return { anomaly: false, warning: null };
  }
  if (options.fetched > 0) {
    return { anomaly: false, warning: null };
  }
  if (options.historicalEventCount > 0) {
    return {
      anomaly: true,
      warning: `Feed returned 0 events but source historically had ${options.historicalEventCount} event(s)`,
    };
  }
  return {
    anomaly: false,
    warning: "Feed returned 0 events (no prior history)",
  };
}
