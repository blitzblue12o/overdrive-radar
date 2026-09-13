import { describe, expect, it } from "vitest";
import { cleanIngestedText } from "@/lib/ingestion/text-clean";
import {
  isAbsoluteHttpUrl,
  resolveAbsoluteHttpUrl,
} from "@/lib/ingestion/urls";
import {
  buildEventSlug,
  eventIdFromSlug,
} from "@/lib/events/slug";
import { buildEventJsonLd } from "@/lib/events/json-ld";
import { AnalyticsEvents } from "@/lib/analytics/track";
import { normalizeRawEvent } from "@/lib/ingestion/normalize";
import type { SourceRecord } from "@/lib/ingestion/types";

const source = (overrides: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Source",
  experience: "event_discovery",
  adapter_type: "ics",
  feed_url: "https://example.com/calendar/feed.ics",
  active: true,
  default_category_overdrive: null,
  default_category_event_discovery: "community",
  ...overrides,
});

describe("ingest text cleanup", () => {
  it("strips HTML and leading hyphens from venues", () => {
    expect(cleanIngestedText("<b>City Hall</b> - Room A")).toBe(
      "City Hall - Room A"
    );
    expect(cleanIngestedText("- Community Room")).toBe("Community Room");
    expect(cleanIngestedText("Library &amp; Center")).toBe("Library & Center");
  });
});

describe("URL resolution", () => {
  it("resolves relative URLs against feed base", () => {
    expect(
      resolveAbsoluteHttpUrl(
        "/Calendar.aspx?EID=1",
        "https://www.example.com/common/modules/iCalendar/feed.ics"
      )
    ).toBe("https://www.example.com/Calendar.aspx?EID=1");
  });

  it("rejects unsafe protocols", () => {
    expect(resolveAbsoluteHttpUrl("javascript:alert(1)")).toBeNull();
    expect(resolveAbsoluteHttpUrl("data:text/html,hi")).toBeNull();
    expect(isAbsoluteHttpUrl("https://ok.example")).toBe(true);
  });

  it("leaves unresolved relative URLs null without base", () => {
    expect(resolveAbsoluteHttpUrl("/Calendar.aspx?EID=1")).toBeNull();
  });
});

describe("normalizeRawEvent URL + venue", () => {
  it("stores cleaned venue and absolute source URL", () => {
    const event = normalizeRawEvent(
      {
        uid: "1",
        title: "Picnic",
        startsAt: new Date("2026-10-01T18:00:00Z"),
        venueName: "<p>Central Park</p>",
        url: "/events/picnic",
      },
      source()
    );
    expect(event.venue_name).toBe("Central Park");
    expect(event.source_url).toBe("https://example.com/events/picnic");
  });
});

describe("event slug", () => {
  it("builds stable slug and recovers full uuid", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const slug = buildEventSlug("Cars & Coffee Meetup!", id);
    expect(slug).toContain("cars-coffee-meetup");
    expect(slug.endsWith(id)).toBe(true);
    expect(eventIdFromSlug(slug)).toBe(id);
  });
});

describe("JSON-LD", () => {
  it("emits Event schema without invented offers", () => {
    const json = buildEventJsonLd({
      id: "1",
      title: "Cars & Coffee",
      description: "Morning meetup",
      startsAt: "2026-10-01T15:00:00.000Z",
      endsAt: null,
      venueName: "Lot A",
      address: "100 Main St",
      latitude: 34.1,
      longitude: -118.2,
      sourceUrl: "https://example.com/e",
      canonicalUrl: "https://www.overdriveradar.com/events/cars-coffee-aaaaaaaaaa",
      isFree: true,
    });
    expect(json["@type"]).toBe("Event");
    expect(json).not.toHaveProperty("offers");
    expect(json).not.toHaveProperty("performer");
    expect(json.isAccessibleForFree).toBe(true);
  });
});

describe("analytics taxonomy", () => {
  it("exports stable event names", () => {
    expect(AnalyticsEvents.eventOpened).toBe("event_opened");
    expect(AnalyticsEvents.zeroResults).toBe("zero_results");
    expect(AnalyticsEvents.directionsClicked).toBe("directions_clicked");
  });
});
