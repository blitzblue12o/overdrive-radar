import { describe, expect, it } from "vitest";
import { getEvents } from "@/lib/events/queries";
import type { EventRecord } from "@/lib/events/types";
import { createMockEventsClient } from "@/tests/helpers/mockSupabase";

const bbox = {
  minLng: -119.5,
  minLat: 34.0,
  maxLng: -118.5,
  maxLat: 34.5,
};

function makePublished(
  index: number,
  overrides: Partial<EventRecord> = {}
): EventRecord {
  const day = 10 + Math.floor(index / 3);
  const starts = `2026-09-${String(day).padStart(2, "0")}T18:00:00.000Z`;
  return {
    id: `ed-bulk-${index}`,
    experience: "event_discovery",
    overdrive_category: null,
    event_discovery_category: index % 2 === 0 ? "community" : "educational",
    title: `Bulk Event ${index}`,
    description: null,
    starts_at: starts,
    ends_at: null,
    timezone: "America/Los_Angeles",
    venue_name: "Test Venue",
    address: null,
    is_free: true,
    price_amount: null,
    price_currency: "USD",
    latitude: 34.2,
    longitude: -119.0,
    image_url: null,
    source_url: null,
    organizer_name: null,
    event_status: "scheduled",
    publication_status: "published",
    moderation_status: "approved",
    ...overrides,
  };
}

describe("discovery completeness (A1 — no premature LIMIT 50)", () => {
  it("returns more than 50 distance-scoped events when the viewport has them", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => makePublished(i));
    const client = createMockEventsClient(rows);
    const result = await getEvents(
      "event_discovery",
      {
        bbox,
        distanceMiles: 25,
        center: { lat: 34.2, lng: -119.0 },
      },
      client
    );
    expect(result.length).toBeGreaterThan(50);
    expect(result.length).toBe(80);
  });

  it("date filtering cannot lose matches beyond the first 50 by starts_at", async () => {
    // 60 early community events + 5 late educational on the target day.
    const early = Array.from({ length: 60 }, (_, i) =>
      makePublished(i, {
        id: `early-${i}`,
        starts_at: "2026-09-01T17:00:00.000Z",
        event_discovery_category: "community",
      })
    );
    const targetDay = Array.from({ length: 5 }, (_, i) =>
      makePublished(i, {
        id: `target-${i}`,
        starts_at: "2026-10-15T19:00:00.000Z",
        ends_at: "2026-10-15T21:00:00.000Z",
        event_discovery_category: "educational",
        title: `Target Day ${i}`,
      })
    );
    const client = createMockEventsClient([...early, ...targetDay]);
    const result = await getEvents(
      "event_discovery",
      {
        bbox,
        distanceMiles: 25,
        center: { lat: 34.2, lng: -119.0 },
        dateRange: {
          start: new Date("2026-10-15T07:00:00.000Z"),
          end: new Date("2026-10-16T07:00:00.000Z"),
        },
      },
      client
    );
    expect(result.map((r) => r.id).sort()).toEqual(
      targetDay.map((r) => r.id).sort()
    );
    expect(result).toHaveLength(5);
  });

  it("category filtering cannot lose matches beyond the first 50", async () => {
    const community = Array.from({ length: 55 }, (_, i) =>
      makePublished(i, {
        id: `comm-${i}`,
        starts_at: `2026-08-${String(10 + (i % 18)).padStart(2, "0")}T18:00:00.000Z`,
        event_discovery_category: "community",
      })
    );
    const outdoor = Array.from({ length: 3 }, (_, i) =>
      makePublished(i, {
        id: `out-${i}`,
        starts_at: "2026-11-01T18:00:00.000Z",
        event_discovery_category: "outdoor",
        title: `Outdoor ${i}`,
      })
    );
    const client = createMockEventsClient([...community, ...outdoor]);
    const result = await getEvents(
      "event_discovery",
      {
        bbox,
        distanceMiles: 25,
        center: { lat: 34.2, lng: -119.0 },
        categories: ["outdoor"],
      },
      client
    );
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.event_discovery_category === "outdoor")).toBe(
      true
    );
  });

  it("text + date still finds matches that would be truncated by search LIMIT 50", async () => {
    const noise = Array.from({ length: 60 }, (_, i) =>
      makePublished(i, {
        id: `noise-${i}`,
        title: `Concert Noise ${i}`,
        starts_at: "2026-09-01T18:00:00.000Z",
      })
    );
    const hit = makePublished(0, {
      id: "hit-late",
      title: "Concert Finale",
      starts_at: "2026-12-01T19:00:00.000Z",
      ends_at: "2026-12-01T21:00:00.000Z",
    });
    const client = createMockEventsClient([...noise, hit]);
    const result = await getEvents(
      "event_discovery",
      {
        bbox,
        query: "Concert",
        dateRange: {
          start: new Date("2026-12-01T07:00:00.000Z"),
          end: new Date("2026-12-02T07:00:00.000Z"),
        },
      },
      client
    );
    expect(result.map((r) => r.id)).toEqual(["hit-late"]);
  });
});
