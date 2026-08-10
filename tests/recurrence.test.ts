import { describe, expect, it } from "vitest";
import {
  buildRecurrenceById,
  classifyCadence,
  localStartHm,
  localWeekday,
  recurrenceFingerprint,
  recurrenceLabel,
} from "@/lib/events/recurrence";
import type { Ymd } from "@/lib/events/occurrence";

const SOURCE = "City of Poway — Community Events";
const VENUE = "Community Park - Sycamore Hall - 13094 Civic Center Drive";
const TZ = "America/Los_Angeles";

/** Build a Monday Feeling Fit at local 10:00 — DST-aware via wall offsets. */
function feelingFit(id: string, utcIso: string) {
  return {
    id,
    title: "Feeling Fit",
    venue_name: VENUE,
    starts_at: utcIso,
    ends_at: new Date(new Date(utcIso).getTime() + 60 * 60 * 1000).toISOString(),
    timezone: TZ,
    source_key: SOURCE,
  };
}

describe("recurrence fingerprint", () => {
  it("1. Feeling Fit weekly grouping", () => {
    // Mon Aug 10 10:00 PDT = 17:00Z; Mon Aug 17 10:00 PDT = 17:00Z
    const events = [
      feelingFit("ff-1", "2026-08-10T17:00:00.000Z"),
      feelingFit("ff-2", "2026-08-17T17:00:00.000Z"),
      feelingFit("ff-3", "2026-08-24T17:00:00.000Z"),
    ];
    const map = buildRecurrenceById(events);
    expect(map.get("ff-1")?.kind).toBe("weekly");
    expect(map.get("ff-1")?.label).toBe("Weekly");
    expect(map.get("ff-1")?.occurrenceCount).toBe(3);
  });

  it("2. Rollin' & Strollin' weekly grouping", () => {
    const events = [
      {
        id: "rs-1",
        title: "Rollin' & Strollin'",
        venue_name: VENUE,
        starts_at: "2026-08-10T20:00:00.000Z", // 1:00 PM PDT
        ends_at: "2026-08-10T21:30:00.000Z",
        timezone: TZ,
        source_key: SOURCE,
      },
      {
        id: "rs-2",
        title: "Rollin' & Strollin'",
        venue_name: VENUE,
        starts_at: "2026-08-17T20:00:00.000Z",
        ends_at: "2026-08-17T21:30:00.000Z",
        timezone: TZ,
        source_key: SOURCE,
      },
    ];
    expect(buildRecurrenceById(events).get("rs-1")?.label).toBe("Weekly");
  });

  it("3. Line Dancing weekly grouping", () => {
    const events = [
      {
        id: "ld-1",
        title: "Line Dancing",
        venue_name: VENUE,
        starts_at: "2026-08-12T20:00:00.000Z", // Wed 1pm PDT
        ends_at: "2026-08-12T22:00:00.000Z",
        timezone: TZ,
        source_key: SOURCE,
      },
      {
        id: "ld-2",
        title: "Line Dancing",
        venue_name: VENUE,
        starts_at: "2026-08-19T20:00:00.000Z",
        ends_at: "2026-08-19T22:00:00.000Z",
        timezone: TZ,
        source_key: SOURCE,
      },
    ];
    expect(buildRecurrenceById(events).get("ld-1")?.kind).toBe("weekly");
  });

  it("4. DST transition does not split weekly fingerprint", () => {
    // 2026-03-08 spring forward. Mon Mar 2 is PST (UTC-8): 10:00 = 18:00Z
    // Mon Mar 9 is PDT (UTC-7): 10:00 = 17:00Z
    const pre = feelingFit("dst-a", "2026-03-02T18:00:00.000Z");
    const post = feelingFit("dst-b", "2026-03-09T17:00:00.000Z");
    expect(localStartHm(pre.starts_at, TZ)).toBe("10:00");
    expect(localStartHm(post.starts_at, TZ)).toBe("10:00");
    expect(localWeekday(pre.starts_at, TZ)).toBe("Mon");
    expect(localWeekday(post.starts_at, TZ)).toBe("Mon");
    expect(recurrenceFingerprint(pre)).toBe(recurrenceFingerprint(post));
    expect(buildRecurrenceById([pre, post]).get("dst-a")?.kind).toBe("weekly");
  });

  it("5. ELL same title/venue but different local times stays separate", () => {
    const base = {
      title: "English Language Learners Conversation Group",
      venue_name: "Library",
      timezone: TZ,
      source_key: SOURCE,
    };
    const a = {
      ...base,
      id: "ell-a",
      starts_at: "2026-08-11T17:00:00.000Z", // 10:00
      ends_at: "2026-08-11T18:00:00.000Z",
    };
    const b = {
      ...base,
      id: "ell-b",
      starts_at: "2026-08-11T18:00:00.000Z", // 11:00
      ends_at: "2026-08-11T19:00:00.000Z",
    };
    const a2 = {
      ...base,
      id: "ell-a2",
      starts_at: "2026-08-18T17:00:00.000Z",
      ends_at: "2026-08-18T18:00:00.000Z",
    };
    expect(recurrenceFingerprint(a)).not.toBe(recurrenceFingerprint(b));
    const map = buildRecurrenceById([a, b, a2]);
    expect(map.get("ell-a")?.kind).toBe("weekly");
    expect(map.has("ell-b")).toBe(false); // single slot alone
  });

  it("6. different weekday stays separate", () => {
    const mon = feelingFit("m", "2026-08-10T17:00:00.000Z");
    const wed = {
      ...feelingFit("w", "2026-08-12T17:00:00.000Z"),
      title: "Feeling Fit",
    };
    expect(recurrenceFingerprint(mon)).not.toBe(recurrenceFingerprint(wed));
  });

  it("7. different venue stays separate", () => {
    const a = feelingFit("a", "2026-08-10T17:00:00.000Z");
    const b = {
      ...feelingFit("b", "2026-08-17T17:00:00.000Z"),
      venue_name: "Lake Poway",
    };
    expect(recurrenceFingerprint(a)).not.toBe(recurrenceFingerprint(b));
    expect(buildRecurrenceById([a, b]).size).toBe(0);
  });

  it("8. different source stays separate", () => {
    const a = feelingFit("a", "2026-08-10T17:00:00.000Z");
    const b = {
      ...feelingFit("b", "2026-08-17T17:00:00.000Z"),
      source_key: "Other Source",
    };
    expect(recurrenceFingerprint(a)).not.toBe(recurrenceFingerprint(b));
  });

  it("9. different normalized title stays separate", () => {
    const a = feelingFit("a", "2026-08-10T17:00:00.000Z");
    const b = { ...feelingFit("b", "2026-08-17T17:00:00.000Z"), title: "Feeling Fit Yoga" };
    expect(recurrenceFingerprint(a)).not.toBe(recurrenceFingerprint(b));
  });

  it("10. single occurrence has no recurrence presentation", () => {
    const map = buildRecurrenceById([
      feelingFit("solo", "2026-08-10T17:00:00.000Z"),
    ]);
    expect(map.size).toBe(0);
  });

  it("11–12. two matching occurrences qualify as Weekly for 7-day cadence", () => {
    const map = buildRecurrenceById([
      feelingFit("a", "2026-08-10T17:00:00.000Z"),
      feelingFit("b", "2026-08-17T17:00:00.000Z"),
    ]);
    expect(map.get("a")?.kind).toBe("weekly");
    expect(recurrenceLabel("weekly")).toBe("Weekly");
  });

  it("13. stable 14-day cadence -> Every 2 weeks", () => {
    const events = [
      feelingFit("a", "2026-08-10T17:00:00.000Z"),
      feelingFit("b", "2026-08-24T17:00:00.000Z"),
      feelingFit("c", "2026-09-07T17:00:00.000Z"),
    ];
    expect(buildRecurrenceById(events).get("a")?.label).toBe("Every 2 weeks");
  });

  it("14. irregular matching dates -> Multiple dates", () => {
    const dates: Ymd[] = [
      { year: 2026, month: 8, day: 10 },
      { year: 2026, month: 8, day: 12 },
      { year: 2026, month: 8, day: 20 },
    ];
    expect(classifyCadence(dates)).toBe("multiple_dates");
    // Fri/Sat Night Fishing style — different weekdays → separate fingerprints
    const fri = {
      id: "nf-1",
      title: "Night Fishing",
      venue_name: "Lake Poway",
      starts_at: "2026-08-14T23:00:00.000Z",
      ends_at: "2026-08-15T06:30:00.000Z",
      timezone: TZ,
      source_key: SOURCE,
    };
    const sat = {
      id: "nf-2",
      title: "Night Fishing",
      venue_name: "Lake Poway",
      starts_at: "2026-08-15T23:00:00.000Z",
      ends_at: "2026-08-16T06:30:00.000Z",
      timezone: TZ,
      source_key: SOURCE,
    };
    expect(recurrenceFingerprint(fri)).not.toBe(recurrenceFingerprint(sat));
    expect(buildRecurrenceById([fri, sat]).size).toBe(0);
  });

  it("15. Fall Camping overnight span does not itself create recurrence", () => {
    // One overnight occurrence alone → no recurrence
    const solo = {
      id: "fc-1",
      title: "Fall Camping",
      venue_name: "Lake Poway",
      starts_at: "2026-09-11T20:00:00.000Z",
      ends_at: "2026-09-12T17:00:00.000Z",
      timezone: TZ,
      source_key: SOURCE,
    };
    expect(buildRecurrenceById([solo]).size).toBe(0);
  });

  it("16. recurrence grouping happens after active date filtering", () => {
    const all = [
      feelingFit("a", "2026-08-10T17:00:00.000Z"),
      feelingFit("b", "2026-08-17T17:00:00.000Z"),
      feelingFit("c", "2026-08-24T17:00:00.000Z"),
    ];
    // Simulate a filtered window that only keeps one occurrence.
    const filtered = all.filter((e) => e.id === "a");
    expect(buildRecurrenceById(filtered).size).toBe(0);
    // Window with two → weekly based on filtered count 2, not 3.
    const two = all.filter((e) => e.id !== "c");
    expect(buildRecurrenceById(two).get("a")?.occurrenceCount).toBe(2);
  });

  it("17. sibling date selection targets correct event ids", () => {
    const map = buildRecurrenceById([
      feelingFit("a", "2026-08-10T17:00:00.000Z"),
      feelingFit("b", "2026-08-17T17:00:00.000Z"),
      feelingFit("c", "2026-08-24T17:00:00.000Z"),
    ]);
    const siblings = map.get("a")?.upcomingSiblings ?? [];
    expect(siblings.map((s) => s.id)).toEqual(["b", "c"]);
    expect(map.get("b")?.upcomingSiblings.map((s) => s.id)).toEqual(["c"]);
  });
});
