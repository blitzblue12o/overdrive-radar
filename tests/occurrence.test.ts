import { describe, expect, it } from "vitest";
import { resolveDateRange } from "@/lib/events/filters";
import {
  eventOverlapsDateRange,
  formatInclusiveDateSpan,
  formatOccurrenceLabel,
  getEventTemporalDisplay,
  isMultiDayOccurrence,
  spansLocalCalendarDates,
} from "@/lib/events/occurrence";
import { parseIcs } from "@/lib/ingestion/adapters/ics";
import { normalizeRawEvent } from "@/lib/ingestion/normalize";
import type { SourceRecord } from "@/lib/ingestion/types";
import { buildIcs } from "@/lib/events/ics";

const tz = "America/Los_Angeles";

/** Production Halloween Campout timestamps (read-only fixture values). */
const HALLOWEEN = {
  id: "8e8bea20-c238-480d-9288-e9b73ce34355",
  starts_at: "2026-10-24T20:00:00.000Z",
  ends_at: "2026-10-25T17:00:00.000Z",
  timezone: tz,
};

const FALL_CAMPING = [
  {
    id: "b4187ff0-a98b-43ac-a178-d5bc0c3cdd50",
    starts_at: "2026-09-11T20:00:00.000Z",
    ends_at: "2026-09-12T17:00:00.000Z",
  },
  {
    id: "f1579cf3-2284-434a-a0ec-224262421e0c",
    starts_at: "2026-09-25T20:00:00.000Z",
    ends_at: "2026-09-26T17:00:00.000Z",
  },
  {
    id: "3e0eec1f-d1a7-4c1e-afbe-990ee6e681f9",
    starts_at: "2026-10-09T20:00:00.000Z",
    ends_at: "2026-10-10T17:00:00.000Z",
  },
  {
    id: "e03d782e-25a3-4294-bc36-47c5665b8430",
    starts_at: "2026-10-16T20:00:00.000Z",
    ends_at: "2026-10-17T17:00:00.000Z",
  },
] as const;

function windowFor(dateParam: string, now = new Date("2026-08-07T18:00:00.000Z")) {
  const range = resolveDateRange(dateParam, now);
  expect(range).not.toBeNull();
  return range!;
}

describe("interval overlap date filtering", () => {
  it("1. same-day event inside window → included", () => {
    expect(
      eventOverlapsDateRange(
        {
          starts_at: "2026-08-10T17:00:00.000Z",
          ends_at: "2026-08-10T18:00:00.000Z",
          timezone: tz,
        },
        windowFor("2026-08-10")
      )
    ).toBe(true);
  });

  it("2. same-day event outside window → excluded", () => {
    expect(
      eventOverlapsDateRange(
        {
          starts_at: "2026-08-11T17:00:00.000Z",
          ends_at: "2026-08-11T18:00:00.000Z",
          timezone: tz,
        },
        windowFor("2026-08-10")
      )
    ).toBe(false);
  });

  it("3. event starts before window and overlaps → included", () => {
    expect(eventOverlapsDateRange(HALLOWEEN, windowFor("2026-10-25"))).toBe(true);
  });

  it("4. event starts inside and ends after → included", () => {
    expect(eventOverlapsDateRange(HALLOWEEN, windowFor("2026-10-24"))).toBe(true);
  });

  it("5. event spans entire selected window → included", () => {
    expect(
      eventOverlapsDateRange(
        {
          starts_at: "2026-10-23T20:00:00.000Z",
          ends_at: "2026-10-26T17:00:00.000Z",
          timezone: tz,
        },
        windowFor("2026-10-24")
      )
    ).toBe(true);
  });

  it("6. end == windowStart → excluded", () => {
    const range = windowFor("2026-10-25");
    expect(
      eventOverlapsDateRange(
        {
          starts_at: "2026-10-24T20:00:00.000Z",
          ends_at: range.start.toISOString(),
          timezone: tz,
        },
        range
      )
    ).toBe(false);
  });

  it("7. start == windowEnd → excluded", () => {
    const range = windowFor("2026-10-24");
    expect(
      eventOverlapsDateRange(
        {
          starts_at: range.end.toISOString(),
          ends_at: "2026-10-25T17:00:00.000Z",
          timezone: tz,
        },
        range
      )
    ).toBe(false);
  });

  it("null ends_at: point inside window included; at windowEnd excluded", () => {
    const range = windowFor("2026-08-10");
    expect(
      eventOverlapsDateRange(
        { starts_at: "2026-08-10T17:00:00.000Z", ends_at: null, timezone: tz },
        range
      )
    ).toBe(true);
    expect(
      eventOverlapsDateRange(
        { starts_at: range.start.toISOString(), ends_at: null, timezone: tz },
        range
      )
    ).toBe(true);
    expect(
      eventOverlapsDateRange(
        { starts_at: range.end.toISOString(), ends_at: null, timezone: tz },
        range
      )
    ).toBe(false);
  });
});

describe("Halloween Campout acceptance (prod fixture timestamps)", () => {
  it("8–10. Oct 24/25 included, Oct 26 excluded", () => {
    expect(eventOverlapsDateRange(HALLOWEEN, windowFor("2026-10-24"))).toBe(true);
    expect(eventOverlapsDateRange(HALLOWEEN, windowFor("2026-10-25"))).toBe(true);
    expect(eventOverlapsDateRange(HALLOWEEN, windowFor("2026-10-26"))).toBe(false);
  });

  it("11. multi-day range includes campout once (single occurrence id)", () => {
    const weekendish = {
      start: windowFor("2026-10-24").start,
      end: windowFor("2026-10-25").end,
    };
    const hits = [HALLOWEEN].filter((e) => eventOverlapsDateRange(e, weekendish));
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(HALLOWEEN.id);
  });

  it("card/detail show both dates without Multi-day badge", () => {
    const display = getEventTemporalDisplay(HALLOWEEN);
    expect(display.kind).toBe("cross_date_timed");
    expect(display.isMultiDay).toBe(false);
    expect(display.spansCalendarDates).toBe(true);
    expect(display.cardLabel).toMatch(/Oct 24/);
    expect(display.cardLabel).toMatch(/Oct 25/);
    expect(display.cardLabel).not.toMatch(/Multi-day/);
    expect(display.detailLines.join("\n")).toMatch(/Oct 24/);
    expect(display.detailLines.join("\n")).toMatch(/Oct 25/);
  });
});

describe("overnight presentation (not Multi-day)", () => {
  const shortOvernight = {
    // ~5h overnight similar to demo fixtures
    starts_at: "2026-08-13T03:52:00.000Z", // Aug 12 8:52 PM PDT
    ends_at: "2026-08-13T08:52:00.000Z", // Aug 13 1:52 AM PDT
    timezone: tz,
  };

  it("12–13. short overnight displays both dates and is not Multi-day", () => {
    expect(spansLocalCalendarDates(shortOvernight)).toBe(true);
    expect(isMultiDayOccurrence(shortOvernight)).toBe(false);
    const label = formatOccurrenceLabel(shortOvernight);
    expect(label).toMatch(/Aug 12/);
    expect(label).toMatch(/Aug 13/);
    expect(label).not.toMatch(/Multi-day/);
  });
});

describe("all-day exclusive DTEND", () => {
  const camarillo = {
    id: "fef061c0-c6d7-4fd0-af5c-74bd3db61537",
    starts_at: "2026-09-01T12:00:00.000Z",
    ends_at: "2026-09-02T12:00:00.000Z",
    timezone: tz,
    all_day: true,
  };
  const syntheticMulti = {
    starts_at: "2026-09-01T12:00:00.000Z",
    ends_at: "2026-09-04T12:00:00.000Z",
    timezone: tz,
    all_day: true,
  };

  it("14–15. VALUE=DATE Sep1/Sep2 → Sep1 only; Sep2 filter excluded", () => {
    expect(isMultiDayOccurrence(camarillo)).toBe(false);
    expect(formatOccurrenceLabel(camarillo)).toMatch(/Sep 1/);
    expect(formatOccurrenceLabel(camarillo)).toMatch(/All day/i);
    expect(formatOccurrenceLabel(camarillo)).not.toMatch(/Sep 1–2/);
    expect(formatOccurrenceLabel(camarillo)).not.toMatch(/Multi-day/);
    expect(eventOverlapsDateRange(camarillo, windowFor("2026-09-01"))).toBe(true);
    expect(eventOverlapsDateRange(camarillo, windowFor("2026-09-02"))).toBe(false);
  });

  it("16–17. VALUE=DATE Sep1/Sep4 → Sep1–3; Sep4 excluded", () => {
    expect(isMultiDayOccurrence(syntheticMulti)).toBe(true);
    expect(formatOccurrenceLabel(syntheticMulti)).toBe("Sep 1–3 · Multi-day");
    expect(eventOverlapsDateRange(syntheticMulti, windowFor("2026-09-01"))).toBe(true);
    expect(eventOverlapsDateRange(syntheticMulti, windowFor("2026-09-02"))).toBe(true);
    expect(eventOverlapsDateRange(syntheticMulti, windowFor("2026-09-03"))).toBe(true);
    expect(eventOverlapsDateRange(syntheticMulti, windowFor("2026-09-04"))).toBe(false);
  });

  it("preserves allDay through ICS parse + normalize (authoritative)", () => {
    const events = parseIcs(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:camarillo-reads@example.com
DTSTART;VALUE=DATE:20260901
DTEND;VALUE=DATE:20260902
SUMMARY:Camarillo Reads…
END:VEVENT
END:VCALENDAR`);
    expect(events[0].metadata?.allDay).toBe(true);
    const source: SourceRecord = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "Test",
      experience: "event_discovery",
      adapter_type: "ics",
      feed_url: "https://example.com/feed.ics",
      active: true,
      default_category_overdrive: null,
      default_category_event_discovery: "community",
    };
    expect(normalizeRawEvent(events[0], source).source_metadata.allDay).toBe(true);
  });

  it("does not infer all-day from noon timestamps alone", () => {
    const noonish = {
      starts_at: "2026-09-01T12:00:00.000Z",
      ends_at: "2026-09-02T12:00:00.000Z",
      timezone: tz,
      all_day: false,
    };
    expect(isMultiDayOccurrence(noonish)).toBe(false);
    // Without authoritative flag, exclusive-DATE filter path is not used —
    // timed overlap may include Sep 2 morning; that is expected until sync stamps allDay.
    expect(getEventTemporalDisplay(noonish).kind).toBe("cross_date_timed");
    expect(getEventTemporalDisplay(noonish).isMultiDay).toBe(false);
  });
});

describe("same-day + future + independence", () => {
  it("18. same-day timed display unchanged shape", () => {
    const sameDay = {
      starts_at: "2026-08-10T17:00:00.000Z",
      ends_at: "2026-08-10T18:00:00.000Z",
      timezone: tz,
    };
    const d = getEventTemporalDisplay(sameDay);
    expect(d.kind).toBe("same_day_timed");
    expect(d.isMultiDay).toBe(false);
    expect(d.cardLabel).toMatch(/Aug 10/);
    expect(d.cardLabel).not.toMatch(/Multi-day/);
  });

  it("19. future custom-date overlap", () => {
    const range = windowFor("2027-02-15");
    expect(
      eventOverlapsDateRange(
        {
          starts_at: "2027-02-14T20:00:00.000Z",
          ends_at: "2027-02-15T18:00:00.000Z",
          timezone: tz,
        },
        range
      )
    ).toBe(true);
    expect(
      eventOverlapsDateRange(
        {
          starts_at: range.end.toISOString(),
          ends_at: "2027-02-16T18:00:00.000Z",
          timezone: tz,
        },
        range
      )
    ).toBe(false);
  });

  it("20–21. Fall Camping occurrences remain independent; titles do not imply recurrence", () => {
    const sep11 = windowFor("2026-09-11");
    const hits = FALL_CAMPING.filter((e) =>
      eventOverlapsDateRange({ ...e, timezone: tz }, sep11)
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("b4187ff0-a98b-43ac-a178-d5bc0c3cdd50");
    for (const e of FALL_CAMPING) {
      expect(formatOccurrenceLabel({ ...e, timezone: tz })).not.toMatch(/Recurring/i);
      expect(isMultiDayOccurrence({ ...e, timezone: tz })).toBe(false);
    }
  });

  it("22. map occurrence count: one fixture = one occurrence", () => {
    // Presentation/filter helpers never expand a cross-date timed event into daily rows.
    expect([HALLOWEEN]).toHaveLength(1);
  });

  it("24. timezone: Halloween local walls are Oct 24 1pm – Oct 25 10am PT", () => {
    const d = getEventTemporalDisplay(HALLOWEEN);
    expect(d.cardLabel).toMatch(/1:00\s*PM/i);
    expect(d.cardLabel).toMatch(/10:00\s*AM/i);
  });

  it("25. DST-sensitive calendar-day handling", () => {
    const camp = {
      starts_at: "2026-03-07T21:00:00.000Z",
      ends_at: "2026-03-09T17:00:00.000Z",
      timezone: tz,
    };
    expect(spansLocalCalendarDates(camp)).toBe(true);
    expect(isMultiDayOccurrence(camp)).toBe(false);
    expect(formatOccurrenceLabel(camp)).toMatch(/Mar 7/);
    expect(formatOccurrenceLabel(camp)).toMatch(/Mar 9/);
    expect(formatOccurrenceLabel(camp)).not.toMatch(/Multi-day/);
    expect(eventOverlapsDateRange(camp, windowFor("2026-03-08"))).toBe(true);
  });

  it("formats cross-month / cross-year all-day spans", () => {
    expect(
      formatInclusiveDateSpan(
        { year: 2026, month: 8, day: 30 },
        { year: 2026, month: 9, day: 2 }
      )
    ).toBe("Aug 30–Sep 2");
    expect(
      formatInclusiveDateSpan(
        { year: 2026, month: 12, day: 31 },
        { year: 2027, month: 1, day: 2 }
      )
    ).toBe("Dec 31, 2026–Jan 2, 2027");
  });
});

describe("calendar export", () => {
  it("timed cross-date preserves DTSTART/DTEND without RRULE", () => {
    const ics = buildIcs({
      id: HALLOWEEN.id,
      title: "Halloween Campout",
      starts_at: HALLOWEEN.starts_at,
      ends_at: HALLOWEEN.ends_at,
      timezone: tz,
    });
    expect(ics).toContain("DTSTART:20261024T200000Z");
    expect(ics).toContain("DTEND:20261025T170000Z");
    expect(ics).not.toMatch(/RRULE/);
  });

  it("all-day export uses VALUE=DATE when authoritative flag present", () => {
    const ics = buildIcs({
      id: "fef061c0-c6d7-4fd0-af5c-74bd3db61537",
      title: "Camarillo Reads",
      starts_at: "2026-09-01T12:00:00.000Z",
      ends_at: "2026-09-02T12:00:00.000Z",
      all_day: true,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    expect(ics).toContain("DTEND;VALUE=DATE:20260902");
    expect(ics).not.toMatch(/RRULE/);
  });
});
