/**
 * M1 dry-run: evaluate EventDiscovery ICS pending/draft eligibility.
 * READ-ONLY — never updates moderation_status or publication_status.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/dry-run-publication-policy.ts
 *   npx tsx --tsconfig tsconfig.json scripts/dry-run-publication-policy.ts --json=tmp/m1-dry-run.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  evaluatePublicationEligibility,
  type PublicationDisposition,
  type PublicationPolicyReason,
  type PublicationPolicyResult,
} from "@/lib/ingestion/publication-policy";
import { createServiceRoleClient } from "@/lib/supabase/admin";

loadEnvConfig(process.cwd());

type Row = {
  id: string;
  title: string;
  starts_at: string;
  venue_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  possible_duplicate_of: string | null;
  source_id: string | null;
  source_type: string;
  experience: string;
  moderation_status: string;
  publication_status: string;
  source_metadata: Record<string, unknown> | null;
};

type Evaluated = Row & {
  sourceName: string;
  result: PublicationPolicyResult;
};

const REASONS: PublicationPolicyReason[] = [
  "past_event",
  "beyond_publication_horizon",
  "administrative_event",
  "closure_or_observance",
  "missing_coordinates",
  "possible_duplicate",
];

function parseJsonPath(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg === "--json") return "tmp/m1-dry-run.json";
    if (arg.startsWith("--json=")) return arg.slice("--json=".length) || null;
  }
  return null;
}

function sourceNameFor(row: Row, sourceById: Map<string, string>): string {
  const meta = row.source_metadata?.source_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  if (row.source_id?.includes(":")) {
    const id = row.source_id.slice(0, row.source_id.indexOf(":"));
    return sourceById.get(id) ?? id;
  }
  return "Unknown source";
}

function pickSamples(
  rows: Evaluated[],
  disposition: PublicationDisposition,
  limit: number
): Evaluated[] {
  const pool = rows.filter((r) => r.result.disposition === disposition);
  if (disposition === "eligible") return pool.slice(0, limit);

  const picked: Evaluated[] = [];
  const seenReasons = new Set<string>();
  for (const row of pool) {
    const key = row.result.reasons.slice().sort().join("|") || "none";
    if (!seenReasons.has(key)) {
      seenReasons.add(key);
      picked.push(row);
    }
    if (picked.length >= limit) return picked;
  }
  for (const row of pool) {
    if (picked.includes(row)) continue;
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}

async function main() {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);

  const client = createServiceRoleClient();
  const now = new Date();

  const { data: sources, error: sourcesError } = await client
    .from("sources")
    .select("id,name");
  if (sourcesError) throw new Error(sourcesError.message);
  const sourceById = new Map(
    (sources ?? []).map((s) => [s.id as string, s.name as string])
  );

  // Read-only select of EventDiscovery ICS pending/draft only.
  // Paginate — PostgREST defaults to max 1000 rows per response.
  const pageSize = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("events")
      .select(
        "id,title,starts_at,venue_name,address,latitude,longitude,possible_duplicate_of,source_id,source_type,experience,moderation_status,publication_status,source_metadata"
      )
      .eq("experience", "event_discovery")
      .eq("source_type", "ics")
      .eq("moderation_status", "pending")
      .eq("publication_status", "draft")
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  // Defense in depth: never evaluate Overdrive or non-ICS.
  const evaluated: Evaluated[] = rows
    .filter(
      (r) =>
        r.experience === "event_discovery" &&
        r.source_type === "ics" &&
        r.moderation_status === "pending" &&
        r.publication_status === "draft"
    )
    .map((row) => {
      const name = sourceNameFor(row, sourceById);
      const result = evaluatePublicationEligibility(
        row,
        { name },
        now
      );
      return { ...row, sourceName: name, result };
    });

  const total = evaluated.length;
  const byDisposition = {
    eligible: evaluated.filter((e) => e.result.disposition === "eligible"),
    review: evaluated.filter((e) => e.result.disposition === "review"),
    ineligible: evaluated.filter((e) => e.result.disposition === "ineligible"),
  };
  const multiReason = evaluated.filter((e) => e.result.reasons.length > 1);

  const reasonCounts = Object.fromEntries(
    REASONS.map((reason) => [
      reason,
      evaluated.filter((e) => e.result.reasons.includes(reason)).length,
    ])
  ) as Record<PublicationPolicyReason, number>;

  const bySource = new Map<
    string,
    { total: number; eligible: number; review: number; ineligible: number; reasons: Record<string, number> }
  >();

  for (const row of evaluated) {
    const bucket = bySource.get(row.sourceName) ?? {
      total: 0,
      eligible: 0,
      review: 0,
      ineligible: 0,
      reasons: {},
    };
    bucket.total += 1;
    bucket[row.result.disposition] += 1;
    for (const reason of row.result.reasons) {
      bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
    }
    bySource.set(row.sourceName, bucket);
  }

  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : "0.0");

  console.log("============================================================");
  console.log("EventDiscovery M1 — Publication Policy DRY-RUN (read-only)");
  console.log(`Evaluated at: ${now.toISOString()}`);
  console.log("Scope: experience=event_discovery source_type=ics pending/draft");
  console.log("NOTE: eligible ≠ auto-publish (source trust deferred to M2)");
  console.log("============================================================");
  console.log("");
  console.log(`TOTAL EVALUATED: ${total}`);
  console.log(
    `ELIGIBLE:        ${byDisposition.eligible.length} (${pct(byDisposition.eligible.length)}%)`
  );
  console.log(
    `REVIEW:          ${byDisposition.review.length} (${pct(byDisposition.review.length)}%)`
  );
  console.log(
    `INELIGIBLE:      ${byDisposition.ineligible.length} (${pct(byDisposition.ineligible.length)}%)`
  );
  console.log(`MULTIPLE-REASON: ${multiReason.length}`);
  console.log("");
  console.log("REASON COUNTS (overlapping — an event may contribute to many):");
  for (const reason of REASONS) {
    console.log(`  ${reason.padEnd(28)} ${reasonCounts[reason]}`);
  }

  console.log("");
  console.log("SOURCE BREAKDOWN:");
  const sortedSources = Array.from(bySource.entries()).sort(
    (a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])
  );
  for (const [name, stats] of sortedSources) {
    const eligPct = stats.total
      ? ((stats.eligible / stats.total) * 100).toFixed(1)
      : "0.0";
    console.log(`- ${name}`);
    console.log(
      `    total=${stats.total} eligible=${stats.eligible} (${eligPct}%) review=${stats.review} ineligible=${stats.ineligible}`
    );
    const reasonBits = (Object.keys(stats.reasons) as string[])
      .map((r) => [r, stats.reasons[r]] as const)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `${r}=${n}`)
      .join(", ");
    if (reasonBits) console.log(`    reasons: ${reasonBits}`);
  }

  const printSample = (label: string, samples: Evaluated[]) => {
    console.log("");
    console.log(`${label} (up to ${samples.length}):`);
    for (const row of samples) {
      console.log(
        `  • ${row.title} | ${row.starts_at} | ${row.sourceName} | ${row.result.disposition} | [${row.result.reasons.join(", ") || "none"}]`
      );
    }
  };

  printSample("ELIGIBLE SAMPLES", pickSamples(evaluated, "eligible", 10));
  printSample("REVIEW SAMPLES", pickSamples(evaluated, "review", 10));
  printSample("INELIGIBLE SAMPLES", pickSamples(evaluated, "ineligible", 10));

  const jsonPath = parseJsonPath(process.argv.slice(2));
  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    const payload = {
      evaluatedAt: now.toISOString(),
      note: "eligible means event-level deterministic pass only; not authorized for auto-publish",
      total,
      dispositions: {
        eligible: byDisposition.eligible.length,
        review: byDisposition.review.length,
        ineligible: byDisposition.ineligible.length,
      },
      multipleReasonCount: multiReason.length,
      reasonCounts,
      events: evaluated.map((e) => ({
        id: e.id,
        title: e.title,
        source: e.sourceName,
        starts_at: e.starts_at,
        disposition: e.result.disposition,
        reasons: e.result.reasons,
      })),
    };
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
    console.log("");
    console.log(`Wrote machine-readable output: ${jsonPath}`);
  }

  console.log("");
  console.log("DRY-RUN COMPLETE — no rows were updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
