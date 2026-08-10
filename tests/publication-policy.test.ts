import { describe, expect, it } from "vitest";
import {
  evaluatePublicationEligibility,
  PUBLICATION_HORIZON_MS,
  type PublicationPolicyEvent,
} from "@/lib/ingestion/publication-policy";

const NOW = new Date("2026-08-09T20:00:00.000Z");

function event(
  overrides: Partial<PublicationPolicyEvent> = {}
): PublicationPolicyEvent {
  return {
    title: "Preschool Storytime (Ages 3-5)",
    starts_at: "2026-09-15T18:00:00.000Z",
    venue_name: "Community Room",
    address: "Community Room",
    latitude: 34.24,
    longitude: -119.01,
    possible_duplicate_of: null,
    ...overrides,
  };
}

describe("evaluatePublicationEligibility", () => {
  it("marks a clean future physical event eligible", () => {
    const result = evaluatePublicationEligibility(event(), null, NOW);
    expect(result.disposition).toBe("eligible");
    expect(result.reasons).toEqual([]);
  });

  it("marks past events ineligible", () => {
    const result = evaluatePublicationEligibility(
      event({ starts_at: "2026-08-01T12:00:00.000Z" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("past_event");
  });

  it("marks events beyond 12 months ineligible", () => {
    const result = evaluatePublicationEligibility(
      event({ starts_at: "2027-08-10T20:00:00.000Z" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("beyond_publication_horizon");
  });

  it("marks City Council Regular Meeting administrative", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "City Council Regular Meeting" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("administrative_event");
  });

  it("marks Parks and Recreation Commission Meeting administrative", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "Parks and Recreation Commission Meeting" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("administrative_event");
  });

  it("does not treat ordinary community language as administrative", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "Community Picnic in the Park" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("eligible");
    expect(result.reasons).not.toContain("administrative_event");
  });

  it("marks bare Regular Meeting administrative", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "Regular Meeting" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("administrative_event");
  });

  it("marks advisory board / water agency meetings administrative", () => {
    for (const title of [
      "Cultural Recreation Advisory Board (CRAB) Meeting",
      "Casitas Municipal Water Agency Meeting",
    ]) {
      const result = evaluatePublicationEligibility(event({ title }), null, NOW);
      expect(result.disposition).toBe("ineligible");
      expect(result.reasons).toContain("administrative_event");
    }
  });

  it("marks canceled titles ineligible without killing consumer workshops", () => {
    expect(
      evaluatePublicationEligibility(
        event({ title: "CANCELED: Storytime" }),
        null,
        NOW
      ).reasons
    ).toContain("cancelled_event");
    expect(
      evaluatePublicationEligibility(
        event({ title: "Cancelled - Concert in the Park" }),
        null,
        NOW
      ).disposition
    ).toBe("ineligible");
    expect(
      evaluatePublicationEligibility(
        event({ title: "Yoga Workshop — free cancellation anytime" }),
        null,
        NOW
      ).disposition
    ).toBe("eligible");
  });

  it("marks Administrative Offices Closed as closure", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "Administrative Offices Closed" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("closure_or_observance");
  });

  it("marks Holiday Closure as closure", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "Holiday Closure" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toContain("closure_or_observance");
  });

  it("does not reject Holiday Festival merely for containing Holiday", () => {
    const result = evaluatePublicationEligibility(
      event({ title: "Holiday Festival" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("eligible");
    expect(result.reasons).not.toContain("closure_or_observance");
  });

  it("sends physical events with missing coordinates to review", () => {
    const result = evaluatePublicationEligibility(
      event({ latitude: null, longitude: null }),
      null,
      NOW
    );
    expect(result.disposition).toBe("review");
    expect(result.reasons).toEqual(["missing_coordinates"]);
  });

  it("does not flag valid virtual events for missing coordinates", () => {
    const result = evaluatePublicationEligibility(
      event({
        title: "Firewise USA - Live Monthly Workshops - VIA ZOOM",
        venue_name: "ZOOM -",
        address: "ZOOM -",
        latitude: null,
        longitude: null,
      }),
      null,
      NOW
    );
    expect(result.disposition).toBe("eligible");
    expect(result.reasons).not.toContain("missing_coordinates");
  });

  it("sends possible duplicates to review", () => {
    const result = evaluatePublicationEligibility(
      event({ possible_duplicate_of: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
      null,
      NOW
    );
    expect(result.disposition).toBe("review");
    expect(result.reasons).toContain("possible_duplicate");
  });

  it("preserves both reasons when duplicate + far future", () => {
    const result = evaluatePublicationEligibility(
      event({
        starts_at: "2028-01-01T00:00:00.000Z",
        possible_duplicate_of: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "beyond_publication_horizon",
        "possible_duplicate",
      ])
    );
    expect(result.reasons).toHaveLength(2);
  });

  it("preserves admin + closure + missing coords reasons", () => {
    const result = evaluatePublicationEligibility(
      event({
        title: "City Council Meeting — Administrative Offices Closed",
        latitude: null,
        longitude: null,
      }),
      null,
      NOW
    );
    expect(result.disposition).toBe("ineligible");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "administrative_event",
        "closure_or_observance",
        "missing_coordinates",
      ])
    );
  });

  it("treats exactly-at-horizon as not beyond (exclusive upper bound)", () => {
    const atHorizon = new Date(NOW.getTime() + PUBLICATION_HORIZON_MS);
    const result = evaluatePublicationEligibility(
      event({ starts_at: atHorizon.toISOString() }),
      null,
      NOW
    );
    expect(result.reasons).not.toContain("beyond_publication_horizon");
    expect(result.disposition).toBe("eligible");
  });

  it("treats event exactly at now as not past (strict less-than)", () => {
    const result = evaluatePublicationEligibility(
      event({ starts_at: NOW.toISOString() }),
      null,
      NOW
    );
    expect(result.reasons).not.toContain("past_event");
    expect(result.disposition).toBe("eligible");
  });

  it("is pure: does not mutate input event fields", () => {
    const input = event({
      title: "City Council Regular Meeting",
      possible_duplicate_of: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });
    const snapshot = structuredClone(input);
    evaluatePublicationEligibility(input, { name: "Test" }, NOW);
    expect(input).toEqual(snapshot);
  });
});
