import { describe, expect, it, vi } from "vitest";
import {
  assertM2PublishLimit,
  assertSourceMayPublish,
  assertTrustedEventDiscoverySource,
  decisionReasonForSource,
  executePublishEligible,
  isHumanProtected,
  M2_MAX_PUBLISH_LIMIT,
  PublishEligibleError,
  selectEligibleForPublish,
  type PublishCandidateEvent,
  type PublishSource,
} from "@/lib/ingestion/publish-eligible";

const NOW = new Date("2026-08-09T20:00:00.000Z");

const trustedPoway: PublishSource = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "City of Poway — Community Events",
  experience: "event_discovery",
  adapter_type: "ics",
  publication_policy: "trusted",
};

function candidate(
  overrides: Partial<PublishCandidateEvent> = {}
): PublishCandidateEvent {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Feeling Fit",
    starts_at: "2026-08-15T17:00:00.000Z",
    venue_name: "Community Park",
    address: "Community Park",
    latitude: 32.96,
    longitude: -117.04,
    possible_duplicate_of: null,
    experience: "event_discovery",
    source_type: "ics",
    moderation_status: "pending",
    publication_status: "draft",
    decision_source: null,
    decision_reason: null,
    decision_at: null,
    ...overrides,
  };
}

describe("assertM2PublishLimit", () => {
  it("requires an explicit limit", () => {
    expect(() => assertM2PublishLimit(undefined)).toThrow(/Missing --limit/i);
  });

  it("refuses limits above M2 ceiling", () => {
    expect(() => assertM2PublishLimit(M2_MAX_PUBLISH_LIMIT + 1)).toThrow(
      /hard ceiling/i
    );
  });

  it("accepts 1..10", () => {
    expect(assertM2PublishLimit(10)).toBe(10);
  });
});

describe("source policy fail-closed", () => {
  it("blocks probation + eligible", () => {
    expect(() =>
      assertTrustedEventDiscoverySource({
        ...trustedPoway,
        publication_policy: "probation",
      })
    ).toThrow(/fail closed|trusted/i);
  });

  it("blocks unknown policy", () => {
    expect(() =>
      assertTrustedEventDiscoverySource({
        ...trustedPoway,
        publication_policy: "maybe",
      })
    ).toThrow(/fail closed|trusted/i);
  });

  it("blocks Overdrive experience", () => {
    expect(() =>
      assertTrustedEventDiscoverySource({
        ...trustedPoway,
        experience: "overdrive",
      })
    ).toThrow(/event_discovery/i);
  });

  it("allows trusted EventDiscovery", () => {
    expect(() => assertTrustedEventDiscoverySource(trustedPoway)).not.toThrow();
  });

  it("allows probation only with explicit allowlist", () => {
    const probation = {
      ...trustedPoway,
      publication_policy: "probation",
    };
    expect(() => assertSourceMayPublish(probation)).toThrow(/allowlist/i);
    expect(() =>
      assertSourceMayPublish(probation, { hasAllowlist: true })
    ).not.toThrow();
    expect(decisionReasonForSource(probation)).toBe(
      "controlled_allowlist+eligible"
    );
    expect(decisionReasonForSource(trustedPoway)).toBe(
      "trusted_source+eligible"
    );
  });
});

describe("human override protection", () => {
  it("protects human-approved/published", () => {
    expect(
      isHumanProtected({
        moderation_status: "approved",
        publication_status: "published",
        decision_source: "manual",
      })
    ).toBe(true);
  });

  it("protects human-rejected", () => {
    expect(
      isHumanProtected({
        moderation_status: "rejected",
        publication_status: "draft",
        decision_source: "manual",
      })
    ).toBe(true);
  });

  it("protects legacy approved without needing decision_source", () => {
    expect(
      isHumanProtected({
        moderation_status: "approved",
        publication_status: "published",
        decision_source: null,
      })
    ).toBe(true);
  });

  it("allows untouched pending/draft", () => {
    expect(
      isHumanProtected({
        moderation_status: "pending",
        publication_status: "draft",
        decision_source: null,
      })
    ).toBe(false);
  });
});

describe("selectEligibleForPublish", () => {
  it("selects trusted + eligible earliest upcoming", () => {
    const events = [
      candidate({
        id: "b",
        title: "Later",
        starts_at: "2026-09-01T17:00:00.000Z",
      }),
      candidate({
        id: "a",
        title: "Sooner",
        starts_at: "2026-08-12T17:00:00.000Z",
      }),
      candidate({
        id: "past",
        title: "Past",
        starts_at: "2026-08-01T17:00:00.000Z",
      }),
    ];
    const { selected } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 10,
    });
    expect(selected.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("skips review and ineligible", () => {
    const events = [
      candidate({
        id: "review",
        latitude: null,
        longitude: null,
      }),
      candidate({
        id: "admin",
        title: "City Council Regular Meeting",
      }),
      candidate({ id: "ok", title: "Farmers Market" }),
    ];
    const { selected, skipped } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 10,
    });
    expect(selected.map((e) => e.id)).toEqual(["ok"]);
    expect(skipped.review).toBe(1);
    expect(skipped.ineligible).toBe(1);
  });

  it("skips human-protected and does not resurrect rejected", () => {
    const events = [
      candidate({
        id: "rejected",
        moderation_status: "rejected",
        decision_source: "manual",
      }),
      candidate({
        id: "manual-pub",
        moderation_status: "approved",
        publication_status: "published",
        decision_source: "manual",
      }),
      candidate({ id: "fresh" }),
    ];
    const { selected, skipped } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 10,
    });
    expect(selected.map((e) => e.id)).toEqual(["fresh"]);
    expect(skipped.humanProtected).toBe(2);
  });

  it("optional eventIds allowlist still requires eligibility and limit", () => {
    const events = [
      candidate({
        id: "keep-a",
        title: "Feeling Fit",
        starts_at: "2026-08-12T17:00:00.000Z",
      }),
      candidate({
        id: "skip-earlier-global",
        title: "Earlier Other",
        starts_at: "2026-08-11T17:00:00.000Z",
      }),
      candidate({
        id: "keep-b",
        title: "Feeling Fit",
        starts_at: "2026-08-19T17:00:00.000Z",
      }),
      candidate({
        id: "review",
        title: "Feeling Fit",
        starts_at: "2026-08-26T17:00:00.000Z",
        latitude: null,
        longitude: null,
      }),
    ];
    const { selected, skipped } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 10,
      eventIds: ["keep-a", "keep-b", "review"],
    });
    expect(selected.map((e) => e.id)).toEqual(["keep-a", "keep-b"]);
    expect(skipped.review).toBe(1);
  });

  it("respects execution limit", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      candidate({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        starts_at: `2026-08-${10 + i}T17:00:00.000Z`,
      })
    );
    const { selected } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 3,
    });
    expect(selected).toHaveLength(3);
  });

  it("ignores manual/demo source_type", () => {
    const events = [
      candidate({ id: "manual", source_type: "manual" }),
      candidate({ id: "ics" }),
    ];
    const { selected } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 10,
    });
    expect(selected.map((e) => e.id)).toEqual(["ics"]);
  });

  it("ignores Overdrive rows", () => {
    const events = [
      candidate({ id: "od", experience: "overdrive" }),
      candidate({ id: "ed" }),
    ];
    const { selected } = selectEligibleForPublish({
      source: trustedPoway,
      events,
      now: NOW,
      limit: 10,
    });
    expect(selected.map((e) => e.id)).toEqual(["ed"]);
  });

  it("probation source cannot select without allowlist", () => {
    expect(() =>
      selectEligibleForPublish({
        source: { ...trustedPoway, publication_policy: "probation" },
        events: [candidate()],
        now: NOW,
        limit: 10,
      })
    ).toThrow(PublishEligibleError);
  });

  it("probation source can select with explicit allowlist", () => {
    const ok = candidate({ id: "prob-ok" });
    const { selected } = selectEligibleForPublish({
      source: { ...trustedPoway, publication_policy: "probation" },
      events: [ok, candidate({ id: "other" })],
      now: NOW,
      limit: 10,
      eventIds: ["prob-ok"],
    });
    expect(selected.map((e) => e.id)).toEqual(["prob-ok"]);
  });

  it("selects librarycalendar rows when source adapter matches", () => {
    const librarySource: PublishSource = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      name: "Simi Valley Public Library — Events",
      experience: "event_discovery",
      adapter_type: "librarycalendar",
      publication_policy: "probation",
    };
    const ok = candidate({
      id: "lc-ok",
      source_type: "librarycalendar",
      title: "Baby Storytime",
    });
    const wrongAdapter = candidate({
      id: "ics-other",
      source_type: "ics",
      title: "Other",
    });
    const { selected } = selectEligibleForPublish({
      source: librarySource,
      events: [ok, wrongAdapter],
      now: NOW,
      limit: 10,
      eventIds: ["lc-ok", "ics-other"],
    });
    expect(selected.map((e) => e.id)).toEqual(["lc-ok"]);
  });
});

describe("executePublishEligible preview/execute", () => {
  it("preview performs zero writes", async () => {
    const updates: unknown[] = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === "sources") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: trustedPoway, error: null }),
              }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      like: () => ({
                        order: () => ({
                          order: () => ({
                            range: async () => ({
                              data: [candidate({ id: "sel" })],
                              error: null,
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: (payload: unknown) => {
              updates.push(payload);
              return {
                in: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        eq: () => ({
                          is: () => ({
                            select: async () => ({ data: [], error: null }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        throw new Error(table);
      }),
    };

    const result = await executePublishEligible(client as never, {
      sourceIdOrName: trustedPoway.id,
      limit: 10,
      now: NOW,
      execute: false,
    });

    expect(result.mode).toBe("preview");
    expect(result.published).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("execute writes automation provenance for selected rows", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === "sources") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: trustedPoway, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    like: () => ({
                      order: () => ({
                        order: () => ({
                          range: async () => ({
                            data: [candidate({ id: "sel" })],
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return {
              in: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        is: () => ({
                          select: async () => ({
                            data: [{ id: "sel" }],
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }),
    };

    const result = await executePublishEligible(client as never, {
      sourceIdOrName: trustedPoway.id,
      limit: 10,
      now: NOW,
      execute: true,
    });

    expect(result.published).toBe(1);
    expect(updates[0]).toMatchObject({
      moderation_status: "approved",
      publication_status: "published",
      decision_source: "automation",
      decision_reason: "trusted_source+eligible",
    });
    expect(updates[0]).not.toHaveProperty("title");
  });
});
