/**
 * Deterministic source → sync batch assignment helpers.
 * Batch IDs are 0..3. Each active source belongs to exactly one batch.
 */

export const SYNC_BATCH_IDS = [0, 1, 2, 3] as const;
export type SyncBatchId = (typeof SYNC_BATCH_IDS)[number];

export const SYNC_BATCH_COUNT = SYNC_BATCH_IDS.length;

/** Workload-balanced initial assignment (upcoming event volume proxy). */
export const INITIAL_SYNC_BATCH_ASSIGNMENT: Record<string, SyncBatchId> = {
  // Batch 0 — Yorba Linda heavy
  "City of Yorba Linda — Parks & Recreation Events": 0,
  "City of Anaheim — Calendar": 0,
  "City of Ventura — Parks & Recreation Events": 0,
  "City of Moorpark — Community Events": 0,
  "City of Fillmore — Community Events": 0,
  "City of Ojai — Events": 0,

  // Batch 1 — Thousand Oaks heavy + PCA-LA
  "Thousand Oaks Library — Events Calendar": 1,
  "PCA-LA (Porsche Club of America — Los Angeles)": 1,
  "City of Beverly Hills — City Events and Activities": 1,
  "Beverly Hills Public Library — Events and Activities": 1,
  "City of Port Hueneme — Recreation & Community Services": 1,
  "City of Escondido — City Events": 1,

  // Batch 2 — Camarillo heavy
  "Camarillo Public Library — Events Calendar": 2,
  "City of Poway — Community Events": 2,
  "City of Imperial Beach — Events Calendar": 2,
  "City of Westlake Village — Special Events": 2,
  "City of La Mesa — Community Events": 2,
  "City of Del Mar — Community Calendar": 2,

  // Batch 3 — Coronado + Simi Library heavies
  "City of Coronado — Main Calendar": 3,
  "Simi Valley Public Library — Events": 3,
  "City of Santa Paula — Calendar": 3,
  "City of Malibu — Special Events": 3,
};

export function isSyncBatchId(value: unknown): value is SyncBatchId {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

export function parseSyncBatchId(value: string | number): SyncBatchId {
  const n = typeof value === "number" ? value : Number(value);
  if (!isSyncBatchId(n)) {
    throw new Error(`Invalid sync batch id: ${value}`);
  }
  return n;
}

/** Assert every listed source name maps to exactly one batch (test helper). */
export function assertExclusiveBatchAssignment(
  assignment: Record<string, SyncBatchId> = INITIAL_SYNC_BATCH_ASSIGNMENT
): void {
  const seen = new Set<string>();
  for (const name of Object.keys(assignment)) {
    if (seen.has(name)) {
      throw new Error(`Source assigned twice: ${name}`);
    }
    seen.add(name);
  }
}

export function sourcesForBatch(
  sources: Array<{ name: string; sync_batch?: number | null }>,
  batchId: SyncBatchId
): typeof sources {
  return sources.filter((s) => (s.sync_batch ?? 0) === batchId);
}
