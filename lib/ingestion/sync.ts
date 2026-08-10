import { getAdapter } from "@/lib/ingestion/adapters";
import { flagDuplicateIfNeeded } from "@/lib/ingestion/dedup";
import {
  createMapboxGeocoder,
  ensureCoordinates,
  GeocodeCache,
  type GeocodeFn,
} from "@/lib/ingestion/geocode";
import { normalizeRawEvent, type NormalizeLog } from "@/lib/ingestion/normalize";
import type {
  SourceRecord,
  SyncRunResult,
  SyncSourceResult,
} from "@/lib/ingestion/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncDeps = {
  client: SupabaseClient;
  geocode?: GeocodeFn;
  now?: () => Date;
  log?: (message: string, extra?: Record<string, unknown>) => void;
};

export async function syncAllActiveSources(
  deps: SyncDeps
): Promise<SyncRunResult> {
  const started = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => undefined);

  const { data: sources, error } = await deps.client
    .from("sources")
    .select(
      "id,name,experience,adapter_type,feed_url,active,default_category_overdrive,default_category_event_discovery,geocode_context,geocode_override,location_overrides,publication_policy"
    )
    .eq("active", true);

  if (error) {
    throw new Error(`Failed to load sources: ${error.message}`);
  }

  const geocodeCache = new GeocodeCache(
    deps.geocode ?? createMapboxGeocoder()
  );
  const results: SyncSourceResult[] = [];

  for (const row of (sources ?? []) as SourceRecord[]) {
    try {
      const result = await syncOneSource(deps.client, row, geocodeCache, log);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("source_failed", { source: row.name, message });
      await updateSourceStatus(deps.client, row.id, "failure", message);
      results.push({
        sourceId: row.id,
        sourceName: row.name,
        status: "failure",
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: message,
      });
    }
  }

  const finished = (deps.now ?? (() => new Date()))();
  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    sources: results,
  };
}

export async function syncOneSource(
  client: SupabaseClient,
  source: SourceRecord,
  geocodeCache: GeocodeCache,
  log: (message: string, extra?: Record<string, unknown>) => void = () =>
    undefined
): Promise<SyncSourceResult> {
  const adapter = getAdapter(source.adapter_type);
  const rawEvents = await adapter.fetchEvents(source);
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

      event = await ensureCoordinates(event, geocodeCache, {
        geocodeContext: source.geocode_context,
        geocodeOverride: source.geocode_override,
        locationOverrides: source.location_overrides,
      });

      const { data: existing } = await client
        .from("events")
        .select("id, moderation_status, publication_status")
        .eq("source_type", event.source_type)
        .eq("source_id", event.source_id)
        .maybeSingle();

      if (existing?.id) {
        // Update content; never downgrade moderation/publication of existing rows.
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
        updated += 1;
        continue;
      }

      const { data: created, error: insertError } = await client
        .from("events")
        .insert(event)
        .select("id")
        .single();

      if (insertError) throw new Error(insertError.message);
      inserted += 1;

      if (created?.id) {
        await flagDuplicateIfNeeded(client, created.id);
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

  const status =
    softErrors === 0
      ? "success"
      : softErrors < rawEvents.length
        ? "partial_failure"
        : "failure";

  await updateSourceStatus(
    client,
    source.id,
    status,
    softErrors ? `${softErrors} event(s) failed` : null
  );

  return {
    sourceId: source.id,
    sourceName: source.name,
    status,
    fetched: rawEvents.length,
    inserted,
    updated,
    skipped,
    error: softErrors ? `${softErrors} event(s) failed` : undefined,
  };
}

async function updateSourceStatus(
  client: SupabaseClient,
  sourceId: string,
  status: "success" | "partial_failure" | "failure",
  error: string | null
) {
  await client
    .from("sources")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: error,
    })
    .eq("id", sourceId);
}
