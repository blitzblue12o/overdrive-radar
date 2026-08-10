import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  extractLibraryCalendarEventPaths,
  extractLibraryCalendarPathCategories,
  libraryCalendarDayFeedUrl,
  libraryCalendarUidFromPath,
  parseLibraryCalendarEventPage,
} from "@/lib/ingestion/adapters/librarycalendar";

const dayHtml = readFileSync(
  join(__dirname, "fixtures/librarycalendar-day.html"),
  "utf8"
);
const detailHtml = readFileSync(
  join(__dirname, "fixtures/librarycalendar-detail.html"),
  "utf8"
);
const allDayHtml = readFileSync(
  join(__dirname, "fixtures/librarycalendar-detail-allday.html"),
  "utf8"
);

describe("LibraryCalendar path / uid helpers", () => {
  it("extracts stable /event/ paths from day feed HTML", () => {
    expect(extractLibraryCalendarEventPaths(dayHtml)).toEqual([
      "/event/english-conversation-group-131",
    ]);
  });

  it("derives uid from event path", () => {
    expect(
      libraryCalendarUidFromPath("/event/english-conversation-group-131")
    ).toBe("english-conversation-group-131");
    expect(libraryCalendarUidFromPath("/events/month")).toBeNull();
  });

  it("builds day feed URLs with required query params", () => {
    expect(
      libraryCalendarDayFeedUrl(
        "https://simivalley.librarycalendar.com/",
        "2026-08-10"
      )
    ).toBe(
      "https://simivalley.librarycalendar.com/events/feed/html?_wrapper_format=lc_calendar_feed&current_date=2026-08-10&ongoing_events=hide"
    );
  });
});

describe("LibraryCalendar detail JSON-LD parse", () => {
  it("parses timed event with LA offset, room, address, categories", () => {
    const event = parseLibraryCalendarEventPage(
      detailHtml,
      "https://simivalley.librarycalendar.com/event/english-conversation-group-131"
    );
    expect(event).not.toBeNull();
    expect(event!.uid).toBe("english-conversation-group-131");
    expect(event!.title).toBe("English Conversation Group");
    expect(event!.timezone).toBe("America/Los_Angeles");
    expect(event!.venueName).toMatch(/Community Room/i);
    expect(event!.venueName).toMatch(/Simi Valley Public Library/i);
    expect(event!.address).toMatch(/2969 Tapo Canyon Rd/i);
    expect(event!.address).toMatch(/Simi Valley/i);
    expect(event!.categories).toContain("Adults");
    expect(event!.description).toMatch(/Practice your English/i);
    expect(
      extractLibraryCalendarPathCategories(dayHtml).get(
        "/event/english-conversation-group-131"
      )
    ).toContain("Adults");
    expect(event!.metadata?.allDay).toBeUndefined();
    expect(event!.metadata?.cancelled).toBeUndefined();
    // 2026-08-10T17:00:00-07:00 → 2026-08-11T00:00:00.000Z
    expect(event!.startsAt.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(event!.endsAt?.toISOString()).toBe("2026-08-11T01:00:00.000Z");
  });

  it("marks all-day schema dates and uses UTC noon", () => {
    const event = parseLibraryCalendarEventPage(
      allDayHtml,
      "https://simivalley.librarycalendar.com/event/free-clinic-book-drop-861"
    );
    expect(event).not.toBeNull();
    expect(event!.metadata?.allDay).toBe(true);
    expect(event!.startsAt.toISOString().endsWith("T12:00:00.000Z")).toBe(true);
  });

  it("returns null for missing JSON-LD / malformed pages", () => {
    expect(
      parseLibraryCalendarEventPage(
        "<html><body>No event</body></html>",
        "https://simivalley.librarycalendar.com/event/missing-1"
      )
    ).toBeNull();
  });

  it("detects cancelled EventStatus without inventing a title rewrite", () => {
    const cancelled = detailHtml.replace(
      "EventScheduled",
      "https://schema.org/EventCancelled"
    );
    const event = parseLibraryCalendarEventPage(
      cancelled,
      "https://simivalley.librarycalendar.com/event/english-conversation-group-131"
    );
    expect(event?.metadata?.cancelled).toBe(true);
    expect(String(event?.metadata?.status)).toMatch(/EventCancelled|CANCELLED/i);
    expect(event?.title).toBe("English Conversation Group");
  });

  it("handles missing room / address fields gracefully", () => {
    const minimal = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Storytime",
      startDate: "2026-09-01T10:30:00-07:00",
      location: { "@type": "Place", name: "Simi Valley Public Library" },
    })}</script>`;
    const event = parseLibraryCalendarEventPage(
      minimal,
      "https://example.org/event/storytime-1"
    );
    expect(event?.title).toBe("Storytime");
    expect(event?.venueName).toBe("Simi Valley Public Library");
    expect(event?.address).toBe("Simi Valley Public Library");
  });
});
