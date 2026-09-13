import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  materializeSeriesEvents,
  parseCamarilloCruiseSchedule,
  parseConejoCarsCoffeeSchedule,
  parseVenturaCarsCoffeeSchedule,
} from "@/lib/ingestion/adapters/html-series";
import {
  filterTribeEventsAutomotive,
  mapTribeEventToRaw,
  type TribeEventsApiEvent,
} from "@/lib/ingestion/adapters/tribe-events";
import {
  evaluateOverdriveAutomotiveRelevance,
  isAutomotiveOverdriveCandidate,
} from "@/lib/ingestion/overdrive-relevance";
import {
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  seriesOccurrenceUid,
  upcomingOccurrenceDates,
  ymdToIso,
} from "@/lib/ingestion/series-occurrences";
import { normalizeRawEvent } from "@/lib/ingestion/normalize";
import { resolveAbsoluteHttpUrl } from "@/lib/ingestion/urls";
import type { SourceRecord } from "@/lib/ingestion/types";

const fromSep13: { year: number; month: number; day: number } = {
  year: 2026,
  month: 9,
  day: 13,
};

const camarilloHtml = `
<html><body>
<h1>FRIDAY NIGHT CAR CRUISES MARCH - OCTOBER 2026 EVERY 4TH FRIDAY FROM 4PM - 7PM</h1>
<p>Event Details: 2026 Car Cruise Dates: March 27th, April 24th, May 22nd, June 26th, July 24th, August 28th, September 25th, and October 23rd!</p>
<p>Location: Studio Channel Islands Art Center, 2222 Ventura Blvd, Camarillo, CA 93010</p>
<p>Time: 4pm - 7pm</p>
</body></html>
`;

const conejoHtml = `
<html><body>
<meta name="description" content="Conejo Valley Cars & Coffee every first and third Saturday morning from 7am - 9am" />
<h2>We Meet every FIRST & Third SATURDAY 7am - 10am @ Firestone Tire Thousand Oaks Mall 598 W. Hillcrest Dr. Thousand Oaks, CA</h2>
</body></html>
`;

const venturaHtml = `
<html><body>
<h1>Cars & Coffee Ventura</h1>
<p>Where? 4360 East Main Street , Ventura, 93003</p>
<p>When? Every Last Sunday 7AM - 10AM</p>
<p>We meet from 7am-10am on the last Sunday of every month.</p>
</body></html>
`;

describe("Overdrive automotive relevance", () => {
  it("keeps car shows and excludes swap meets / festivals", () => {
    expect(
      isAutomotiveOverdriveCandidate("2026 Ventura Super Indoor Custom Car Show")
    ).toBe(true);
    expect(
      isAutomotiveOverdriveCandidate(
        "23rd Annual Ventura Nationals",
        "live music, tattooing, vendors, and CARS, CARS, CARS!"
      )
    ).toBe(true);
    expect(isAutomotiveOverdriveCandidate("Wednesday Swap Meet")).toBe(false);
    expect(isAutomotiveOverdriveCandidate("2nd Annual Oktoberfest")).toBe(false);
    expect(
      evaluateOverdriveAutomotiveRelevance("Harvest Festival").reason
    ).toBe("non_automotive");
  });
});

describe("series occurrence horizon", () => {
  it("computes nth and last weekdays", () => {
    expect(ymdToIso(nthWeekdayOfMonth(2026, 9, "friday", 4)!)).toBe(
      "2026-09-25"
    );
    expect(ymdToIso(lastWeekdayOfMonth(2026, 9, "sunday"))).toBe("2026-09-27");
  });

  it("limits twice-monthly and monthly horizons", () => {
    const bi = upcomingOccurrenceDates(
      { kind: "nth_weekdays", weekday: "saturday", nth: [1, 3] },
      { from: fromSep13, limit: 8 }
    );
    expect(bi).toHaveLength(8);
    expect(ymdToIso(bi[0])).toBe("2026-09-19");

    const monthly = upcomingOccurrenceDates(
      { kind: "last_weekday", weekday: "sunday" },
      { from: fromSep13, limit: 6 }
    );
    expect(monthly).toHaveLength(6);
    expect(ymdToIso(monthly[0])).toBe("2026-09-27");
  });

  it("builds stable occurrence uids", () => {
    expect(
      seriesOccurrenceUid("conejo-valley-cars-coffee", {
        year: 2026,
        month: 9,
        day: 19,
      })
    ).toBe("conejo-valley-cars-coffee:2026-09-19");
  });
});

describe("Camarillo html series", () => {
  it("parses seasonal dates and stable ids without inventing past rows", () => {
    const series = parseCamarilloCruiseSchedule(
      camarilloHtml,
      "https://www.camarillomerchant.org/camarillo-old-town-car-cruises",
      fromSep13
    );
    expect(series).not.toBeNull();
    expect(series!.dates.map(ymdToIso)).toEqual([
      "2026-09-25",
      "2026-10-23",
    ]);
    const events = materializeSeriesEvents(series!);
    expect(events).toHaveLength(2);
    expect(events[0].uid).toBe("camarillo-old-town-cruise:2026-09-25");
    expect(events[0].categories).toContain("cruise");
    expect(events[0].url).toContain("camarillomerchant.org");
  });
});

describe("Conejo html series", () => {
  it("materializes rolling 1st/3rd Saturday horizon", () => {
    const series = parseConejoCarsCoffeeSchedule(
      conejoHtml,
      "https://www.cvcarsandcoffee.com/",
      fromSep13
    );
    expect(series).not.toBeNull();
    expect(series!.dates).toHaveLength(8);
    expect(ymdToIso(series!.dates[0])).toBe("2026-09-19");
    const again = parseConejoCarsCoffeeSchedule(
      conejoHtml,
      "https://www.cvcarsandcoffee.com/",
      fromSep13
    );
    expect(materializeSeriesEvents(again!).map((e) => e.uid)).toEqual(
      materializeSeriesEvents(series!).map((e) => e.uid)
    );
  });
});

describe("Ventura Cars & Coffee html series", () => {
  it("keeps monthly horizon and directory provenance", () => {
    const series = parseVenturaCarsCoffeeSchedule(
      venturaHtml,
      "https://www.lacar.com/car-events-la/cars-and-coffee-ventura",
      fromSep13
    );
    expect(series).not.toBeNull();
    expect(series!.provenance).toBe("directory");
    expect(series!.dates).toHaveLength(6);
    expect(ymdToIso(series!.dates[0])).toBe("2026-09-27");
  });
});

describe("Tribe events automotive filter", () => {
  const mixed: TribeEventsApiEvent[] = [
    {
      id: 1,
      title: "Wednesday Swap Meet",
      description: "Everything from the sublime to the ridiculous.",
      start_date: "2026-09-16 07:00:00",
      end_date: "2026-09-16 14:00:00",
      url: "https://venturacountyfair.org/event/swap/",
      venue: {
        venue: "Ventura County Fairgrounds",
        address: "10 W Harbor Blvd",
        city: "Ventura",
        state: "CA",
        zip: "93001",
      },
    },
    {
      id: 2,
      title: "2026 Ventura Super Indoor Custom Car Show",
      description: "Celebration of automotive culture!",
      start_date: "2026-09-20 11:00:00",
      end_date: "2026-09-20 17:00:00",
      url: "https://venturacountyfair.org/event/car-show/",
      venue: {
        venue: "Ventura County Fairgrounds",
        address: "10 W Harbor Blvd",
        city: "Ventura",
        state: "CA",
        zip: "93001",
      },
    },
    {
      id: 3,
      title: "23rd Annual Ventura Nationals",
      description: "vendors, and CARS, CARS, CARS!",
      start_date: "2026-09-05 09:00:00",
      end_date: "2026-09-05 17:00:00",
      url: "https://venturacountyfair.org/event/nationals/",
      venue: {
        venue: "Ventura County Fairgrounds",
        address: "10 W Harbor Blvd",
        city: "Ventura",
        state: "CA",
        zip: "93001",
      },
    },
  ];

  it("excludes non-auto and keeps automotive rows", () => {
    const { kept, fetched, relevant } = filterTribeEventsAutomotive(mixed);
    expect(fetched).toBe(3);
    expect(relevant).toBe(2);
    expect(kept.map((e) => e.uid).sort()).toEqual(["tec:2", "tec:3"]);
    expect(mapTribeEventToRaw(mixed[0])).toBeNull();
  });
});

describe("probation publication safety for new Overdrive sources", () => {
  it("normalize always lands pending/draft", () => {
    const source: SourceRecord = {
      id: "00000000-0000-4000-8000-000000000099",
      name: "Camarillo Old Town Car Cruises",
      experience: "overdrive",
      adapter_type: "html_series",
      feed_url: "https://www.camarillomerchant.org/camarillo-old-town-car-cruises",
      active: true,
      default_category_overdrive: "drive_cruise",
      default_category_event_discovery: null,
      publication_policy: "probation",
    };
    const series = parseCamarilloCruiseSchedule(
      camarilloHtml,
      source.feed_url!,
      fromSep13
    )!;
    const raw = materializeSeriesEvents(series)[0];
    const row = normalizeRawEvent(raw, source);
    expect(row.moderation_status).toBe("pending");
    expect(row.publication_status).toBe("draft");
    expect(row.overdrive_category).toBe("drive_cruise");
    expect(row.source_url).toMatch(/^https:\/\//);
    expect(
      resolveAbsoluteHttpUrl("/relative", "https://example.com/base")
    ).toBe("https://example.com/relative");
  });
});

describe("fixture smoke (optional live snapshots unused)", () => {
  it("keeps test fixtures directory readable", () => {
    // Guard: ensure vitest can still read existing fixtures folder.
    expect(
      readFileSync(join(__dirname, "fixtures/sample.ics"), "utf8").length
    ).toBeGreaterThan(10);
  });
});
