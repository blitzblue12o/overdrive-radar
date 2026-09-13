import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertExclusiveBatchAssignment,
  INITIAL_SYNC_BATCH_ASSIGNMENT,
  sourcesForBatch,
  SYNC_BATCH_IDS,
} from "@/lib/ingestion/batches";
import {
  authorizeCronRequest,
  cronAuthLogFields,
} from "@/lib/ingestion/cron-auth";
import {
  isEventMateriallyUnchanged,
  reuseCoordinatesIfPossible,
} from "@/lib/ingestion/event-diff";
import {
  classifyBatchRuntime,
  classifySourceFreshness,
  isZeroEventAnomaly,
  summarizeSchedulerHealth,
} from "@/lib/ingestion/health";
import {
  fetchFeedConditional,
  fetchWithRetry,
  isRetryableHttpStatus,
  NonRetryableHttpError,
  TransientHttpError,
} from "@/lib/ingestion/http";
import { summarizeSourceResults } from "@/lib/ingestion/pipeline-ledger";
import { syncActiveSources, syncOneSource } from "@/lib/ingestion/sync";
import type {
  NormalizedEventInsert,
  SourceRecord,
  SyncSourceResult,
} from "@/lib/ingestion/types";
import { GeocodeCache } from "@/lib/ingestion/geocode";
import { IcsAdapter } from "@/lib/ingestion/adapters/ics";
import { RssAdapter } from "@/lib/ingestion/adapters/rss";

const fixtures = join(__dirname, "fixtures");

const baseSource = (overrides: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Source",
  experience: "event_discovery",
  adapter_type: "ics",
  feed_url: "https://example.com/feed.ics",
  active: true,
  default_category_overdrive: null,
  default_category_event_discovery: "community",
  sync_batch: 0,
  ...overrides,
});

describe("batch source selection", () => {
  it("assigns every seeded name to exactly one batch", () => {
    expect(() => assertExclusiveBatchAssignment()).not.toThrow();
    const names = Object.keys(INITIAL_SYNC_BATCH_ASSIGNMENT);
    expect(names.length).toBeGreaterThanOrEqual(22);
    for (const id of SYNC_BATCH_IDS) {
      const inBatch = names.filter(
        (n) => INITIAL_SYNC_BATCH_ASSIGNMENT[n] === id
      );
      expect(inBatch.length).toBeGreaterThan(0);
    }
  });

  it("spreads known heavy sources across batches", () => {
    expect(
      INITIAL_SYNC_BATCH_ASSIGNMENT[
        "City of Yorba Linda — Parks & Recreation Events"
      ]
    ).toBe(0);
    expect(
      INITIAL_SYNC_BATCH_ASSIGNMENT["Thousand Oaks Library — Events Calendar"]
    ).toBe(1);
    expect(
      INITIAL_SYNC_BATCH_ASSIGNMENT["Camarillo Public Library — Events Calendar"]
    ).toBe(2);
    expect(
      INITIAL_SYNC_BATCH_ASSIGNMENT["City of Coronado — Main Calendar"]
    ).toBe(3);
    expect(
      INITIAL_SYNC_BATCH_ASSIGNMENT["Simi Valley Public Library — Events"]
    ).toBe(3);
    // PCA-LA paired with Thousand Oaks heavy ED source
    expect(
      INITIAL_SYNC_BATCH_ASSIGNMENT[
        "PCA-LA (Porsche Club of America — Los Angeles)"
      ]
    ).toBe(1);
  });

  it("filters sources by batch id", () => {
    const rows = [
      { name: "A", sync_batch: 0 },
      { name: "B", sync_batch: 1 },
      { name: "C", sync_batch: 0 },
    ];
    expect(sourcesForBatch(rows, 0).map((s) => s.name)).toEqual(["A", "C"]);
    expect(sourcesForBatch(rows, 2)).toHaveLength(0);
  });
});

describe("cron auth", () => {
  it("accepts Authorization Bearer matching CRON_SECRET", () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const req = new Request("https://example.com/api/cron", {
      headers: { Authorization: "Bearer test-secret" },
    });
    const auth = authorizeCronRequest(req);
    expect(auth.ok).toBe(true);
    expect(auth.authMethod).toBe("authorization_bearer");
    expect(auth.invocation).toBe("manual");
    vi.unstubAllEnvs();
  });

  it("identifies scheduled Vercel cron via x-vercel-cron", () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const req = new Request("https://example.com/api/cron", {
      headers: {
        Authorization: "Bearer test-secret",
        "x-vercel-cron": "1",
      },
    });
    const auth = authorizeCronRequest(req);
    expect(auth.ok).toBe(true);
    expect(auth.invocation).toBe("scheduled");
    vi.unstubAllEnvs();
  });

  it("rejects mismatch and missing secret without bypass", () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect(
      authorizeCronRequest(
        new Request("https://example.com", {
          headers: { Authorization: "Bearer wrong" },
        })
      ).ok
    ).toBe(false);

    vi.stubEnv("CRON_SECRET", "");
    expect(
      authorizeCronRequest(
        new Request("https://example.com", {
          headers: { Authorization: "Bearer anything" },
        })
      ).authMethod
    ).toBe("secret_unset");

    const fields = cronAuthLogFields(
      new Request("https://example.com"),
      { ok: false, authMethod: "missing", invocation: "unknown" },
      "/api/cron/sync-sources/batch-0"
    );
    expect(JSON.stringify(fields)).not.toMatch(/test-secret|Bearer /);
    vi.unstubAllEnvs();
  });

  it("trims accidental whitespace on secret comparison", () => {
    vi.stubEnv("CRON_SECRET", "  padded-secret\n");
    const auth = authorizeCronRequest(
      new Request("https://example.com", {
        headers: { Authorization: "Bearer padded-secret" },
      })
    );
    expect(auth.ok).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("source locking", () => {
  it("returns skipped_locked when advisory lock is unavailable", async () => {
    const client = {
      rpc: async (fn: string) => {
        if (fn === "try_acquire_source_sync_lock") {
          return { data: false, error: null };
        }
        if (fn === "release_source_sync_lock") {
          return { data: true, error: null };
        }
        return { data: null, error: { message: `unexpected ${fn}` } };
      },
      from: () => ({
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };

    const result = await syncOneSource(
      client as never,
      baseSource(),
      new GeocodeCache(async () => null)
    );
    expect(result.status).toBe("skipped_locked");
    expect(result.fetched).toBe(0);
  });
});

describe("atomic upsert under duplicate invocation", () => {
  it("recovers duplicate-key insert as update without throwing", async () => {
    const icsBody = readFileSync(join(fixtures, "sample.ics"), "utf8");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(icsBody, {
        status: 200,
        headers: { "Content-Type": "text/calendar" },
      })
    );

    let upsertCalls = 0;
    const client = {
      rpc: async (fn: string) => {
        if (fn === "upsert_ingested_event") {
          upsertCalls += 1;
          // Simulate concurrent insert winner already present: always "updated".
          return {
            data: [
              {
                event_id: `evt-${upsertCalls}`,
                was_inserted: false,
              },
            ],
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected ${fn}` } };
      },
      from: (table: string) => {
        if (table === "events") {
          return {
            select: (_c?: string, opts?: { head?: boolean }) => {
              if (opts?.head) {
                return { like: async () => ({ count: 2, error: null }) };
              }
              return {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              };
            },
          };
        }
        if (table === "sources") {
          return {
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    const result = await syncOneSource(
      client as never,
      baseSource(),
      new GeocodeCache(async () => null),
      () => undefined,
      { useLocks: false }
    );

    expect(result.status).toBe("success");
    expect(result.updated).toBeGreaterThan(0);
    expect(result.inserted).toBe(0);
    expect(upsertCalls).toBeGreaterThan(0);
    fetchMock.mockRestore();
  });

  it("falls back to update when insert hits 23505", async () => {
    const payload = {
      experience: "event_discovery",
      overdrive_category: null,
      event_discovery_category: "community",
      title: "X",
      description: null,
      starts_at: "2026-08-15T18:00:00.000Z",
      ends_at: null,
      timezone: "America/Los_Angeles",
      venue_name: null,
      address: null,
      latitude: null,
      longitude: null,
      source_type: "ics",
      source_id: "src:1",
      source_url: null,
      source_metadata: {},
      organizer_name: null,
      moderation_status: "pending",
      publication_status: "draft",
      event_status: "scheduled",
      last_source_sync_at: new Date().toISOString(),
    };

    // Exercise fallback path via a minimal sync of one unchanged-identity insert race.
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:race-1
DTSTART:20260815T180000Z
SUMMARY:Race Event
END:VEVENT
END:VCALENDAR`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(ics, {
        status: 200,
        headers: { "Content-Type": "text/calendar" },
      })
    );

    let phase: "pre" | "recover" = "pre";
    const client = {
      rpc: async (fn: string) => {
        if (fn === "upsert_ingested_event") {
          return {
            data: null,
            error: {
              message: "Could not find the function upsert_ingested_event",
            },
          };
        }
        return { data: null, error: { message: fn } };
      },
      from: (table: string) => {
        if (table === "events") {
          return {
            select: (_c?: string, opts?: { head?: boolean }) => {
              if (opts?.head) {
                return { like: async () => ({ count: 1, error: null }) };
              }
              return {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => {
                      if (phase === "pre") {
                        return { data: null, error: null };
                      }
                      return { data: { id: "existing-race" }, error: null };
                    },
                  }),
                }),
              };
            },
            insert: () => {
              phase = "recover";
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      code: "23505",
                      message:
                        'duplicate key value violates unique constraint "idx_events_source_identity"',
                    },
                  }),
                }),
              };
            },
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "sources") {
          return {
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    void payload;
    const result = await syncOneSource(
      client as never,
      baseSource(),
      new GeocodeCache(async () => null),
      () => undefined,
      { useLocks: false }
    );
    expect(result.status).toBe("success");
    expect(result.updated).toBe(1);
    fetchMock.mockRestore();
  });
});

describe("transient retries", () => {
  it("retries 503 then succeeds", async () => {
    let attempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("busy", { status: 503 });
      }
      return new Response("ok", { status: 200 });
    });

    const res = await fetchWithRetry({
      url: "https://example.com/feed",
      timeoutMs: 1000,
      maxAttempts: 3,
    });
    expect(res.status).toBe(200);
    expect(attempts).toBe(3);
    fetchMock.mockRestore();
  }, 20_000);

  it("does not retry non-retryable 400", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 400 })
    );
    await expect(
      fetchWithRetry({ url: "https://example.com/x", maxAttempts: 3 })
    ).rejects.toBeInstanceOf(NonRetryableHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("marks retryable statuses", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(504)).toBe(true);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(new TransientHttpError("timeout", "t").code).toBe("timeout");
  });
});

describe("one source failure does not abort batch", () => {
  it("records failure and continues", async () => {
    const sources: SourceRecord[] = [
      baseSource({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "Broken",
        adapter_type: "motorsportreg",
        feed_url: null,
        sync_batch: 0,
      }),
      baseSource({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        name: "Good",
        adapter_type: "ics",
        feed_url: "https://example.com/good.ics",
        sync_batch: 0,
      }),
    ];
    const icsBody = readFileSync(join(fixtures, "sample.ics"), "utf8");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(icsBody, {
        status: 200,
        headers: { "Content-Type": "text/calendar" },
      })
    );

    const client = {
      from: (table: string) => {
        if (table === "sources") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: async () => ({ data: sources, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: (_c?: string, opts?: { head?: boolean }) => {
              if (opts?.head) {
                return { like: async () => ({ count: 0, error: null }) };
              }
              return {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              };
            },
            insert: (row: unknown) => ({
              select: () => ({
                single: async () => ({
                  data: { id: "new-1", row },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        throw new Error(table);
      },
      rpc: async (fn: string) => {
        if (fn === "upsert_ingested_event") {
          return {
            data: null,
            error: { message: "Could not find the function upsert_ingested_event" },
          };
        }
        if (fn === "find_possible_duplicates") {
          return { data: [], error: null };
        }
        return { data: null, error: { message: fn } };
      },
    };

    const result = await syncActiveSources({
      client: client as never,
      batchId: 0,
      geocode: async () => null,
      useSourceLocks: false,
      useLedger: false,
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources.some((s) => s.status === "failure")).toBe(true);
    expect(result.sources.some((s) => s.status === "success")).toBe(true);
    expect(result.status).toBe("partial_failure");
    fetchMock.mockRestore();
  });
});

describe("coordinate reuse + unchanged short-circuit", () => {
  it("reuses coords when address unchanged", () => {
    const next = reuseCoordinatesIfPossible(
      {
        latitude: null,
        longitude: null,
        address: "100 Main St",
        venue_name: "Hall",
      },
      {
        address: "100 Main St",
        venue_name: "Hall",
        latitude: 34.1,
        longitude: -118.2,
      }
    );
    expect(next.latitude).toBe(34.1);
    expect(next.longitude).toBe(-118.2);
  });

  it("detects materially unchanged events", () => {
    const existing = {
      id: "1",
      title: "Picnic",
      description: "Fun",
      starts_at: "2026-08-15T18:00:00.000Z",
      ends_at: null,
      timezone: "America/Los_Angeles",
      venue_name: "Park",
      address: "Park",
      latitude: 1,
      longitude: 2,
      source_url: null,
      organizer_name: null,
      overdrive_category: null,
      event_discovery_category: "community",
    };
    const next: NormalizedEventInsert = {
      experience: "event_discovery",
      overdrive_category: null,
      event_discovery_category: "community",
      title: "Picnic",
      description: "Fun",
      starts_at: "2026-08-15T18:00:00.000Z",
      ends_at: null,
      timezone: "America/Los_Angeles",
      venue_name: "Park",
      address: "Park",
      latitude: null,
      longitude: null,
      source_type: "ics",
      source_id: "x:1",
      source_url: null,
      source_metadata: {},
      organizer_name: null,
      moderation_status: "pending",
      publication_status: "draft",
      event_status: "scheduled",
      last_source_sync_at: new Date().toISOString(),
    };
    expect(isEventMateriallyUnchanged(existing, next)).toBe(true);
    expect(
      isEventMateriallyUnchanged(existing, { ...next, title: "Changed" })
    ).toBe(false);
  });
});

describe("conditional fetch 304", () => {
  it("returns not_modified without body parse", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 304,
        headers: { ETag: '"abc"' },
      })
    );
    const result = await fetchFeedConditional({
      url: "https://example.com/feed.ics",
      etag: '"abc"',
    });
    expect(result.status).toBe("not_modified");
    fetchMock.mockRestore();
  });

  it("marks source success on 304 via ICS adapter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 304, headers: { ETag: '"v1"' } })
    );
    const adapter = new IcsAdapter();
    const result = await adapter.fetchEvents(
      baseSource({ http_etag: '"v1"' }),
      { etag: '"v1"' }
    );
    expect(result.notModified).toBe(true);
    expect(result.events).toHaveLength(0);
    fetchMock.mockRestore();
  });
});

describe("run-level status", () => {
  it("computes success and partial_failure", () => {
    const success: SyncSourceResult[] = [
      {
        sourceId: "1",
        sourceName: "A",
        status: "success",
        fetched: 2,
        inserted: 1,
        updated: 1,
        skipped: 0,
      },
    ];
    expect(summarizeSourceResults(success).status).toBe("success");

    const partial: SyncSourceResult[] = [
      {
        sourceId: "1",
        sourceName: "A",
        status: "success",
        fetched: 1,
        inserted: 1,
        updated: 0,
        skipped: 0,
      },
      {
        sourceId: "2",
        sourceName: "B",
        status: "failure",
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: "boom",
      },
    ];
    expect(summarizeSourceResults(partial).status).toBe("partial_failure");
    expect(summarizeSourceResults(partial).sourcesFailed).toBe(1);
  });
});

describe("success_empty + Anaheim-style anomaly", () => {
  it("flags zero-result when history had events", () => {
    const anomaly = isZeroEventAnomaly({
      fetched: 0,
      historicalEventCount: 12,
    });
    expect(anomaly.anomaly).toBe(true);
    expect(anomaly.warning).toMatch(/historically had 12/);
  });

  it("notes empty channel without treating as hard failure", () => {
    const empty = isZeroEventAnomaly({
      fetched: 0,
      historicalEventCount: 0,
    });
    expect(empty.anomaly).toBe(false);
    expect(empty.warning).toMatch(/no prior history/);
  });

  it("RSS adapter notes empty channel XML", async () => {
    const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      })
    );
    const result = await new RssAdapter().fetchEvents(
      baseSource({
        adapter_type: "rss",
        feed_url: "https://example.com/empty.xml",
      })
    );
    expect(result.events).toHaveLength(0);
    expect(result.feedNote).toMatch(/zero item/i);
    fetchMock.mockRestore();
  });
});

describe("batch runtime accounting", () => {
  it("warns above 180s and targets under 120s", () => {
    expect(classifyBatchRuntime(90_000).ok).toBe(true);
    expect(classifyBatchRuntime(150_000).ok).toBe(false);
    expect(classifyBatchRuntime(150_000).warning).toBe(false);
    expect(classifyBatchRuntime(181_000).warning).toBe(true);
  });
});

describe("health distinction: scheduler vs source", () => {
  it("scheduler uses batch ledger completion", () => {
    const now = new Date("2026-09-13T20:00:00Z");
    const healthy = summarizeSchedulerHealth(
      [
        { batchId: 0, finishedAt: "2026-09-13T14:05:00Z", status: "success" },
        { batchId: 1, finishedAt: "2026-09-13T14:15:00Z", status: "success" },
        { batchId: 2, finishedAt: "2026-09-13T14:25:00Z", status: "success" },
        { batchId: 3, finishedAt: "2026-09-13T14:35:00Z", status: "success" },
      ],
      now,
      "daily"
    );
    expect(healthy.overall).toBe("healthy");

    const missing = summarizeSchedulerHealth(
      [{ batchId: 0, finishedAt: "2026-09-13T14:05:00Z", status: "success" }],
      now,
      "daily"
    );
    expect(missing.overall).toBe("unhealthy");
    expect(missing.batches.filter((b) => b.status === "missing")).toHaveLength(
      3
    );
  });

  it("source freshness thresholds for daily cadence", () => {
    const now = new Date("2026-09-13T20:00:00Z");
    expect(
      classifySourceFreshness("2026-09-13T10:00:00Z", now, "daily")
    ).toBe("healthy");
    expect(
      classifySourceFreshness("2026-09-12T00:00:00Z", now, "daily")
    ).toBe("warning");
    expect(
      classifySourceFreshness("2026-09-11T00:00:00Z", now, "daily")
    ).toBe("stale");
  });
});
