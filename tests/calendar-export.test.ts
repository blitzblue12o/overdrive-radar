import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/events/ics";

describe("calendar export regression (M2.1B)", () => {
  it("preserves timed cross-date DTSTART/DTEND without RRULE", () => {
    const ics = buildIcs({
      id: "8e8bea20-c238-480d-9288-e9b73ce34355",
      title: "Halloween Campout",
      starts_at: "2026-10-24T20:00:00.000Z",
      ends_at: "2026-10-25T17:00:00.000Z",
      timezone: "America/Los_Angeles",
      venue_name: "Lake Poway",
    });
    expect(ics).toContain("DTSTART:20261024T200000Z");
    expect(ics).toContain("DTEND:20261025T170000Z");
    expect(ics).not.toMatch(/RRULE/);
  });

  it("emits VALUE=DATE for authoritative all-day events", () => {
    const ics = buildIcs({
      id: "fef061c0-c6d7-4fd0-af5c-74bd3db61537",
      title: "Camarillo Reads",
      starts_at: "2026-09-01T12:00:00.000Z",
      ends_at: "2026-09-02T12:00:00.000Z",
      all_day: true,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    expect(ics).toContain("DTEND;VALUE=DATE:20260902");
  });
});

