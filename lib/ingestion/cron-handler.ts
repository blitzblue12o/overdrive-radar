import { NextRequest, NextResponse } from "next/server";
import {
  authorizeCronRequest,
  cronAuthLogFields,
} from "@/lib/ingestion/cron-auth";
import { parseSyncBatchId, type SyncBatchId } from "@/lib/ingestion/batches";
import {
  BATCH_RUNTIME_WARNING_MS,
  classifyBatchRuntime,
} from "@/lib/ingestion/health";
import { syncActiveSources } from "@/lib/ingestion/sync";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Safety margin only — target p95 remains <120s per batch. */
export const SYNC_MAX_DURATION_SECONDS = 600;

export async function handleSyncCronRequest(
  request: NextRequest,
  options: {
    route: string;
    batchId?: SyncBatchId | null;
  }
): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  const authFields = cronAuthLogFields(request, auth, options.route);

  if (!auth.ok) {
    console.warn("[sync-cron] auth_failure", authFields);
    return NextResponse.json(
      {
        error: "Unauthorized",
        authMethod: auth.authMethod,
        invocation: auth.invocation,
      },
      { status: 401 }
    );
  }

  console.info("[sync-cron] auth_ok", authFields);

  try {
    const client = createServiceRoleClient();
    const result = await syncActiveSources({
      client,
      batchId: options.batchId ?? null,
      invocation: auth.invocation,
      jobType:
        options.batchId == null
          ? "sync-sources-manual-all"
          : `sync-sources-batch-${options.batchId}`,
      log: (message, extra) => {
        console.info(`[${options.route}]`, message, extra ?? "");
      },
    });

    const runtime = classifyBatchRuntime(result.durationMs);
    if (runtime.warning) {
      console.warn(`[${options.route}] batch_runtime_warning`, {
        durationMs: result.durationMs,
        thresholdMs: BATCH_RUNTIME_WARNING_MS,
        batchId: options.batchId,
      });
    }

    const hardFailures = result.sources.filter(
      (s) => s.status === "failure"
    ).length;

    return NextResponse.json({
      ok: hardFailures === 0 && result.status !== "failure",
      route: options.route,
      invocation: auth.invocation,
      authMethod: auth.authMethod,
      runtime: {
        durationMs: result.durationMs,
        targetMs: 120_000,
        warningMs: BATCH_RUNTIME_WARNING_MS,
        warning: runtime.warning,
      },
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error(`[${options.route}]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function batchIdFromParam(raw: string): SyncBatchId {
  return parseSyncBatchId(raw);
}
