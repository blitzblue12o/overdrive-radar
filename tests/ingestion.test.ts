import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseIcs, parseIcsDate } from "@/lib/ingestion/adapters/ics";
import { parseRss } from "@/lib/ingestion/adapters/rss";
import { MotorsportRegAdapter } from "@/lib/ingestion/adapters/motorsportreg";
import { flagDuplicateIfNeeded } from "@/lib/ingestion/dedup";
import {
  mapCategory,
  normalizeRawEvent,
  type NormalizeLog,
} from "@/lib/ingestion/normalize";
import { syncAllActiveSources, syncOneSource } from "@/lib/ingestion/sync";
import type { NormalizedEventInsert, SourceRecord } from "@/lib/ingestion/types";
import {
  buildGeocodeQuery,
  ensureCoordinates,
  GeocodeCache,
  resolveGeocodeQuery,
} from "@/lib/ingestion/geocode";
import { isVirtualLocation } from "@/lib/ingestion/virtual-location";

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
  ...overrides,
});

describe("ICS adapter", () => {
  it("parses a sample fixture into raw events", () => {
    const text = readFileSync(join(fixtures, "sample.ics"), "utf8");
    const events = parseIcs(text);
    expect(events).toHaveLength(2);
    expect(events[0].title).toBe("Cars & Coffee Meetup");
    expect(events[0].latitude).toBeCloseTo(34.28);
    expect(events[0].longitude).toBeCloseTo(-119.29);
    expect(events[0].categories).toContain("Car Meet");
    expect(events[0].startsAt.toISOString()).toBe("2026-08-15T18:00:00.000Z");
    expect(events[1].title).toBe("Library Storytime");
    // All-day DATE → UTC noon (no calendar-day shift).
    expect(events[1].startsAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(events[1].endsAt?.toISOString()).toBe("2026-08-21T12:00:00.000Z");
    expect(events[1].metadata?.allDay).toBe(true);
    expect(events[0].metadata?.allDay).toBeUndefined();
  });

  it("converts America/Los_Angeles TZID summer (PDT / UTC-7) to UTC", () => {
    const start = parseIcsDate({
      value: "20260822T190000",
      params: { TZID: "America/Los_Angeles" },
    });
    expect(start?.toISOString()).toBe("2026-08-23T02:00:00.000Z");
  });

  it("converts America/Los_Angeles TZID winter (PST / UTC-8) to UTC", () => {
    const start = parseIcsDate({
      value: "20260115T190000",
      params: { TZID: "America/Los_Angeles" },
    });
    expect(start?.toISOString()).toBe("2026-01-16T03:00:00.000Z");
  });

  it("does not double-convert explicit Z timestamps", () => {
    const start = parseIcsDate({
      value: "20260823T020000Z",
      params: { TZID: "America/Los_Angeles" },
    });
    expect(start?.toISOString()).toBe("2026-08-23T02:00:00.000Z");
  });

  it("applies TZID conversion to DTEND as well as DTSTART", () => {
    const events = parseIcs(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:tzid-dtend@example.com
DTSTART;TZID=America/Los_Angeles:20260822T190000
DTEND;TZID=America/Los_Angeles:20260822T220000
SUMMARY:CineMalibu: The Sandlot
END:VEVENT
END:VCALENDAR`);
    expect(events).toHaveLength(1);
    expect(events[0].startsAt.toISOString()).toBe("2026-08-23T02:00:00.000Z");
    expect(events[0].endsAt?.toISOString()).toBe("2026-08-23T05:00:00.000Z");
  });

  it("preserves floating (no TZID) wall-clock-as-UTC semantics", () => {
    const start = parseIcsDate({
      value: "20260822T190000",
      params: {},
    });
    expect(start?.toISOString()).toBe("2026-08-22T19:00:00.000Z");
  });
});

describe("RSS adapter", () => {
  it("parses a sample fixture and skips undated items", () => {
    const text = readFileSync(join(fixtures, "sample.rss"), "utf8");
    const events = parseRss(text);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Community Picnic");
    expect(events[0].venueName).toContain("Central Park");
    expect(events[0].latitude).toBeCloseTo(33.835);
  });
});

describe("normalize", () => {
  it("maps known categories", () => {
    const log: NormalizeLog = { unmappedCategories: [] };
    const overdrive = mapCategory(
      "overdrive",
      ["Autocross"],
      baseSource({
        experience: "overdrive",
        default_category_overdrive: "other",
        default_category_event_discovery: null,
      }),
      log
    );
    expect(overdrive.overdrive).toBe("autocross");
    expect(log.unmappedCategories).toHaveLength(0);
  });

  it("falls back to source default and logs unmapped categories", () => {
    const log: NormalizeLog = { unmappedCategories: [] };
    const mapped = mapCategory(
      "event_discovery",
      ["Totally Unknown Genre"],
      baseSource(),
      log
    );
    expect(mapped.discovery).toBe("community");
    expect(log.unmappedCategories).toContain("Totally Unknown Genre");
  });

  it("always normalizes new events as pending/draft", () => {
    const raw = parseIcs(
      readFileSync(join(fixtures, "sample.ics"), "utf8")
    )[0];
    const normalized = normalizeRawEvent(raw, baseSource());
    expect(normalized.moderation_status).toBe("pending");
    expect(normalized.publication_status).toBe("draft");
    expect(normalized.source_type).toBe("ics");
  });
});

describe("MotorsportReg scaffold", () => {
  it("throws not-configured when called", async () => {
    const adapter = new MotorsportRegAdapter();
    await expect(
      adapter.fetchEvents(
        baseSource({ adapter_type: "motorsportreg", feed_url: null })
      )
    ).rejects.toThrow(/not yet configured/i);
  });
});

describe("dedup", () => {
  it("sets possible_duplicate_of without changing moderation_status", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      rpc: vi.fn(async () => ({
        data: [
          {
            candidate_id: "dup-1",
            candidate_title: "Other",
            title_similarity: 0.9,
            same_day: true,
            venue_similarity: 0.5,
          },
        ],
        error: null,
      })),
      from: vi.fn(() => ({
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        },
      })),
    };

    const id = await flagDuplicateIfNeeded(client as never, "event-1");
    expect(id).toBe("dup-1");
    expect(updates[0]).toEqual({ possible_duplicate_of: "dup-1" });
    expect(updates[0]).not.toHaveProperty("moderation_status");
  });
});

describe("sync isolation", () => {
  it("continues other sources when one adapter throws", async () => {
    const sources: SourceRecord[] = [
      baseSource({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "Broken Feed",
        adapter_type: "motorsportreg",
        feed_url: null,
      }),
      baseSource({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        name: "Good ICS",
        adapter_type: "ics",
        feed_url: "https://example.com/good.ics",
      }),
    ];

    const icsBody = readFileSync(join(fixtures, "sample.ics"), "utf8");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(icsBody, { status: 200 })
    );

    const statusUpdates: Array<{ id: string; status: string }> = [];
    const inserted: unknown[] = [];

    const client = {
      from: (table: string) => {
        if (table === "sources") {
          return {
            select: () => ({
              eq: async () => ({ data: sources, error: null }),
            }),
            update: (payload: { last_sync_status: string }) => ({
              eq: async (_col: string, id: string) => {
                statusUpdates.push({ id, status: payload.last_sync_status });
                return { error: null };
              },
            }),
          };
        }
        if (table === "events") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: (row: unknown) => {
              inserted.push(row);
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: `new-${inserted.length}` },
                    error: null,
                  }),
                }),
              };
            },
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: async () => ({ data: [], error: null }),
    };

    const result = await syncAllActiveSources({
      client: client as never,
      geocode: async () => null,
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].status).toBe("failure");
    expect(result.sources[0].error).toMatch(/not yet configured/i);
    expect(result.sources[1].status).toBe("success");
    expect(result.sources[1].inserted).toBeGreaterThan(0);
    expect(inserted.length).toBeGreaterThan(0);
    expect(
      (inserted[0] as { moderation_status: string }).moderation_status
    ).toBe("pending");

    fetchMock.mockRestore();
  });
});

describe("geocode cache", () => {
  it("dedupes address lookups within a run", async () => {
    const geocode = vi.fn(async () => ({
      latitude: 34.1,
      longitude: -118.2,
    }));
    const cache = new GeocodeCache(geocode);
    await cache.resolve("100 Main St, Ventura, CA");
    await cache.resolve("100 main st,  ventura, ca");
    expect(geocode).toHaveBeenCalledTimes(1);
  });
});

describe("isVirtualLocation", () => {
  const virtualCases = [
    "ZOOM",
    "ZOOM -",
    "Zoom",
    "Virtual",
    "Virtual Event",
    "Online",
    "Online Event",
    "via Zoom",
    "<p>ZOOM</p> -",
  ];

  for (const input of virtualCases) {
    it(`treats "${input}" as virtual`, () => {
      expect(isVirtualLocation(input)).toBe(true);
    });
  }

  const physicalCases = [
    "Community Room",
    "Camarillo Public Library",
    "1000 E Ventura Blvd",
    "City Hall",
  ];

  for (const input of physicalCases) {
    it(`does not treat "${input}" as virtual`, () => {
      expect(isVirtualLocation(input)).toBe(false);
    });
  }
});

describe("contextual geocoding", () => {
  it("builds query with source geocode_context", () => {
    expect(
      buildGeocodeQuery("Community Room", "Community Room", "Camarillo, CA")
    ).toBe("Community Room, Camarillo, CA");
  });

  it("omits context when absent (no-context regression)", () => {
    expect(buildGeocodeQuery("City Hall", "City Hall", null)).toBe("City Hall");
    expect(buildGeocodeQuery("City Hall", null, undefined)).toBe("City Hall");
  });

  it("sends contextual query to mocked geocoder and does not rewrite address", async () => {
    const geocode = vi.fn(async () => ({
      latitude: 34.2164,
      longitude: -119.0376,
    }));
    const cache = new GeocodeCache(geocode);
    const event = {
      latitude: null as number | null,
      longitude: null as number | null,
      address: "Community Room",
      venue_name: "Community Room",
    };

    const result = await ensureCoordinates(event, cache, {
      geocodeContext: "Camarillo, CA",
    });

    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith("Community Room, Camarillo, CA");
    expect(result.latitude).toBeCloseTo(34.2164);
    expect(result.longitude).toBeCloseTo(-119.0376);
    expect(result.address).toBe("Community Room");
    expect(result.venue_name).toBe("Community Room");
  });

  it("does not call Mapbox for virtual locations and clears coordinates", async () => {
    const geocode = vi.fn(async () => ({
      latitude: 30.231075,
      longitude: -85.90144,
    }));
    const cache = new GeocodeCache(geocode);
    const result = await ensureCoordinates(
      {
        latitude: 30.231075,
        longitude: -85.90144,
        address: "ZOOM -",
        venue_name: "ZOOM -",
      },
      cache,
      { geocodeContext: "Santa Paula, CA" }
    );

    expect(geocode).not.toHaveBeenCalled();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.address).toBe("ZOOM -");
  });

  it("uses geocode_override instead of room + context", async () => {
    const override = "4101 Las Posas Road, Camarillo, CA 93010";
    expect(
      resolveGeocodeQuery({
        address: "Homework Center",
        venueName: "Homework Center",
        geocodeContext: "Camarillo, CA",
        geocodeOverride: override,
      })
    ).toBe(override);

    const geocode = vi.fn(async () => ({
      latitude: 34.2215,
      longitude: -119.0308,
    }));
    const cache = new GeocodeCache(geocode);
    const result = await ensureCoordinates(
      {
        latitude: null,
        longitude: null,
        address: "Homework Center",
        venue_name: "Homework Center",
      },
      cache,
      {
        geocodeContext: "Camarillo, CA",
        geocodeOverride: override,
      }
    );

    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith(override);
    expect(geocode).not.toHaveBeenCalledWith("Homework Center");
    expect(geocode).not.toHaveBeenCalledWith("Homework Center, Camarillo, CA");
    expect(result.venue_name).toBe("Homework Center");
    expect(result.address).toBe("Homework Center");
    expect(result.latitude).toBeCloseTo(34.2215);
  });

  it("keeps virtual above geocode_override", async () => {
    const geocode = vi.fn(async () => ({
      latitude: 34.2215,
      longitude: -119.0308,
    }));
    const cache = new GeocodeCache(geocode);
    const result = await ensureCoordinates(
      {
        latitude: null,
        longitude: null,
        address: "ZOOM -",
        venue_name: "ZOOM -",
      },
      cache,
      {
        geocodeOverride: "4101 Las Posas Road, Camarillo, CA 93010",
      }
    );

    expect(geocode).not.toHaveBeenCalled();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("uses context when override is absent", () => {
    expect(
      resolveGeocodeQuery({
        address: "City Hall",
        venueName: "City Hall",
        geocodeContext: "Poway, CA",
        geocodeOverride: null,
      })
    ).toBe("City Hall, Poway, CA");
  });

  it("defaults to location alone with no context or override", () => {
    expect(
      resolveGeocodeQuery({
        address: "Teague Park",
        venueName: "Teague Park",
      })
    ).toBe("Teague Park");
  });

  it("location_overrides beat geocode_override and fix stale pins", async () => {
    const brimhall = {
      match: "grant r. brimhall",
      address: "1401 E Janss Road, Thousand Oaks, CA 91362",
      latitude: 34.201162,
      longitude: -118.852605,
    };
    const newbury = {
      match: "newbury park library",
      address: "2331 Borchard Road, Newbury Park, CA 91320",
      latitude: 34.1845,
      longitude: -118.9132,
    };
    const overrides = [newbury, brimhall];

    expect(
      resolveGeocodeQuery({
        address: "Newbury Park Library Meeting Room",
        venueName: "Newbury Park Library Meeting Room",
        geocodeOverride: brimhall.address,
        locationOverrides: overrides,
      })
    ).toBe(newbury.address);

    const geocode = vi.fn(async () => ({
      latitude: 99,
      longitude: 99,
    }));
    const cache = new GeocodeCache(geocode);

    // Stale Brimhall pin on a Newbury venue is corrected without Mapbox.
    const fixed = await ensureCoordinates(
      {
        latitude: brimhall.latitude,
        longitude: brimhall.longitude,
        address: "Newbury Park Library Meeting Room, Newbury Park Library",
        venue_name: "Newbury Park Library Meeting Room, Newbury Park Library",
      },
      cache,
      {
        geocodeOverride: brimhall.address,
        locationOverrides: overrides,
      }
    );
    expect(geocode).not.toHaveBeenCalled();
    expect(fixed.latitude).toBeCloseTo(newbury.latitude);
    expect(fixed.longitude).toBeCloseTo(newbury.longitude);

    const goebel = await ensureCoordinates(
      {
        latitude: null,
        longitude: null,
        address: "Goebel Adult Community Center, Grant R. Brimhall Library",
        venue_name: "Goebel Adult Community Center, Grant R. Brimhall Library",
      },
      cache,
      {
        geocodeOverride: brimhall.address,
        locationOverrides: [
          {
            match: "goebel",
            address: "1385 E Janss Road, Thousand Oaks, CA 91362",
            latitude: 34.2008,
            longitude: -118.8519,
          },
          ...overrides,
        ],
      }
    );
    expect(goebel.latitude).toBeCloseTo(34.2008);

    // Ambiguous / unmatched keeps source override path when coords missing.
    const unknown = await ensureCoordinates(
      {
        latitude: null,
        longitude: null,
        address: "Both Libraries",
        venue_name: "Both Libraries",
      },
      cache,
      {
        geocodeOverride: brimhall.address,
        locationOverrides: overrides,
      }
    );
    expect(geocode).toHaveBeenCalledWith(brimhall.address);
    expect(unknown.latitude).toBe(99);
  });
});

describe("stale coordinate clearing on re-sync", () => {
  it("updates existing event to null lat/lng when location becomes virtual", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const source = baseSource({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      name: "City of Santa Paula — Calendar",
    });

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:firewise-zoom-1@example.com
DTSTART:20260901T180000Z
DTEND:20260901T190000Z
SUMMARY:Firewise USA - Live Monthly Workshops - VIA ZOOM
LOCATION:ZOOM -
END:VEVENT
END:VCALENDAR`;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(ics, {
          status: 200,
          headers: { "Content-Type": "text/calendar" },
        })
      );

    const client = {
      from: vi.fn((table: string) => {
        if (table === "events") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "existing-firewise",
                      moderation_status: "pending",
                      publication_status: "draft",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              updates.push(payload);
              return {
                eq: async () => ({ error: null }),
              };
            },
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: "should not insert" },
                }),
              }),
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
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const geocode = vi.fn(async () => ({
      latitude: 30.231075,
      longitude: -85.90144,
    }));
    const cache = new GeocodeCache(geocode);

    const result = await syncOneSource(
      client as never,
      source,
      cache,
      () => undefined
    );

    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(geocode).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0].latitude).toBeNull();
    expect(updates[0].longitude).toBeNull();
    expect(updates[0].venue_name).toBe("ZOOM -");

    // Shape check: update carries nullable coords (clears geography via DB trigger).
    const coords = updates[0] as Pick<NormalizedEventInsert, "latitude" | "longitude">;
    expect(coords.latitude).toBeNull();
    expect(coords.longitude).toBeNull();

    fetchMock.mockRestore();
  });
});
