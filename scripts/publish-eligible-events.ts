/**
 * M2 controlled trusted-source auto-publication (manual only).
 *
 * Preview (default, zero writes):
 *   npx tsx --tsconfig tsconfig.json scripts/publish-eligible-events.ts \
 *     --source="City of Poway — Community Events" --limit=10
 *
 * Execute (requires --execute):
 *   npx tsx --tsconfig tsconfig.json scripts/publish-eligible-events.ts \
 *     --source="City of Poway — Community Events" --limit=10 --execute
 */
import { loadEnvConfig } from "@next/env";
import {
  executePublishEligible,
  M2_MAX_PUBLISH_LIMIT,
  PublishEligibleError,
} from "@/lib/ingestion/publish-eligible";
import { createServiceRoleClient } from "@/lib/supabase/admin";

loadEnvConfig(process.cwd());

function argValue(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  for (const arg of argv) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return null;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const source = argValue(argv, "source");
  const limitRaw = argValue(argv, "limit");
  const idsRaw = argValue(argv, "ids");
  const execute = hasFlag(argv, "execute");

  if (!source) {
    throw new PublishEligibleError(
      'Missing --source. Example: --source="City of Poway — Community Events"'
    );
  }
  if (limitRaw == null) {
    throw new PublishEligibleError(
      `Missing --limit. M2 requires an explicit limit (1–${M2_MAX_PUBLISH_LIMIT}).`
    );
  }
  const limit = Number(limitRaw);
  const eventIds = idsRaw
    ? idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);

  const client = createServiceRoleClient();
  const result = await executePublishEligible(client, {
    sourceIdOrName: source,
    limit,
    execute,
    eventIds,
  });

  console.log("============================================================");
  console.log(
    execute
      ? "EventDiscovery M2 — EXECUTE (mutation)"
      : "EventDiscovery M2 — PREVIEW (read-only)"
  );
  console.log(`source: ${result.source.name}`);
  console.log(`source_id: ${result.source.id}`);
  console.log(`experience: ${result.source.experience}`);
  console.log(`publication_policy: ${result.source.publication_policy}`);
  console.log(`evaluated_at: ${result.now}`);
  console.log(`limit: ${result.limit}`);
  console.log(`eligible_upcoming_selected: ${result.selected.length}`);
  console.log(
    `skipped: review=${result.skipped.review} ineligible=${result.skipped.ineligible} humanProtected=${result.skipped.humanProtected} notUpcoming=${result.skipped.notUpcoming}`
  );
  console.log("");
  console.log("SELECTED:");
  for (const row of result.selected) {
    console.log(
      `  • ${row.id} | ${row.title} | ${row.starts_at} | ${row.moderation_status}/${row.publication_status} | ${row.disposition} | [${row.reasons.join(", ") || "none"}] | decision_source=${row.decision_source ?? "null"}`
    );
  }

  if (!execute) {
    console.log("");
    console.log("Preview complete — zero writes.");
    console.log("Re-run with --execute to mutate (still capped at --limit).");
    return;
  }

  console.log("");
  console.log(
    `attempted=${result.attempted} published=${result.published} failed=${result.failed}`
  );
  if (result.publishedIds.length) {
    console.log("published_ids:");
    for (const id of result.publishedIds) console.log(`  ${id}`);
  }
  if (result.failedIds.length) {
    console.log("failed_ids:");
    for (const id of result.failedIds) console.log(`  ${id}`);
  }
  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }
  console.log("Execute complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
