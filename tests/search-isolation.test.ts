import { describe, expect, it } from "vitest";
import { searchEvents } from "@/lib/events/queries";
import {
  createMockEventsClient,
  sampleEvents,
} from "@/tests/helpers/mockSupabase";

const socalBbox = {
  minLng: -119.2,
  minLat: 33.8,
  maxLng: -117.8,
  maxLat: 34.5,
};

describe("search_events experience isolation", () => {
  it("searchEvents('overdrive', ...) never returns event_discovery rows", async () => {
    const client = createMockEventsClient(sampleEvents());
    const rows = await searchEvents("overdrive", "Meet", socalBbox, client);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.experience === "overdrive")).toBe(true);
    expect(rows.some((r) => r.experience === "event_discovery")).toBe(false);
    expect(rows.map((r) => r.id)).not.toContain("ed-1");
  });

  it("searchEvents('event_discovery', ...) never returns overdrive rows", async () => {
    const client = createMockEventsClient(sampleEvents());
    const rows = await searchEvents(
      "event_discovery",
      "Discovery",
      socalBbox,
      client
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.experience === "event_discovery")).toBe(true);
    expect(rows.some((r) => r.experience === "overdrive")).toBe(false);
    expect(rows.map((r) => r.id)).not.toContain("od-1");
  });
});
