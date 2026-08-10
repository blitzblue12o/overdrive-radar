import { describe, expect, it, vi } from "vitest";
import {
  consumeViewportSuppress,
  countActiveUiFilters,
  CUSTOM_DATE_PENDING_PARAM,
  dateChipToParam,
  dateParamToChip,
  locationInputDisplay,
  locationDistanceContextLabel,
  locationNearLabel,
  parseCategoryParam,
  parseLocationFromSearchParams,
  resolveDateRange,
  setCurrentLocationParams,
  setSearchedLocationParams,
} from "@/lib/events/filters";
import {
  formatCityStateLabel,
  geocodePlaceEphemeral,
  reverseGeocodeEphemeral,
} from "@/lib/events/geocode-place";

describe("filter param parsing", () => {
  it("parses category comma lists", () => {
    expect(parseCategoryParam("car_meet,car_show")).toEqual([
      "car_meet",
      "car_show",
    ]);
    expect(parseCategoryParam("")).toEqual([]);
    expect(parseCategoryParam(null)).toEqual([]);
  });

  it("resolves today/tomorrow/weekend in America/Los_Angeles", () => {
    // Fixed instant: Friday 2026-08-07 18:00 UTC ≈ Friday morning/afternoon LA depending on DST
    const friday = new Date("2026-08-07T18:00:00.000Z");

    const today = resolveDateRange("today", friday);
    expect(today).not.toBeNull();
    expect(today!.end.getTime()).toBeGreaterThan(today!.start.getTime());

    const tomorrow = resolveDateRange("tomorrow", friday);
    expect(tomorrow!.start.getTime()).toBeGreaterThanOrEqual(today!.end.getTime() - 1);

    const weekend = resolveDateRange("weekend", friday);
    expect(weekend).not.toBeNull();
    // Weekend span should be ~48h
    const hours =
      (weekend!.end.getTime() - weekend!.start.getTime()) / (1000 * 60 * 60);
    expect(hours).toBeGreaterThanOrEqual(47);
    expect(hours).toBeLessThanOrEqual(49);

    const picked = resolveDateRange("2026-08-15", friday);
    expect(picked).not.toBeNull();
    const pickedHours =
      (picked!.end.getTime() - picked!.start.getTime()) / (1000 * 60 * 60);
    expect(pickedHours).toBeGreaterThanOrEqual(23);
    expect(pickedHours).toBeLessThanOrEqual(25);
  });

  it("Pick a Date persists before a day is chosen (A3)", () => {
    expect(dateChipToParam("Pick a Date", null)).toBe(
      CUSTOM_DATE_PENDING_PARAM
    );
    expect(dateParamToChip(CUSTOM_DATE_PENDING_PARAM)).toEqual({
      chip: "Pick a Date",
      pickedIsoDate: null,
    });
    expect(resolveDateRange(CUSTOM_DATE_PENDING_PARAM)).toBeNull();
    expect(dateChipToParam("Pick a Date", "2026-10-03")).toBe("2026-10-03");
    expect(dateParamToChip("2026-10-03")).toEqual({
      chip: "Pick a Date",
      pickedIsoDate: "2026-10-03",
    });
  });

  it("consumeViewportSuppress prevents flyTo refetch loops", () => {
    const ref = { current: true };
    expect(consumeViewportSuppress(ref)).toBe(true);
    expect(ref.current).toBe(false);
    expect(consumeViewportSuppress(ref)).toBe(false);
  });

  it("armViewportSuppressUntilMoveEnd clears after moveend microtask", async () => {
    const { armViewportSuppressUntilMoveEnd, isViewportFetchSuppressed } =
      await import("@/lib/events/filters");
    const ref = { current: false };
    let handler: (() => void) | undefined;
    armViewportSuppressUntilMoveEnd(ref, {
      once: (_e, fn) => {
        handler = fn;
      },
    });
    expect(isViewportFetchSuppressed(ref)).toBe(true);
    handler!();
    await Promise.resolve();
    expect(isViewportFetchSuppressed(ref)).toBe(false);
  });

  it("counts active UI filters including non-default distance", () => {
    expect(
      countActiveUiFilters({
        query: "",
        date: null,
        categories: [],
        distanceMiles: 25,
      })
    ).toBe(0);
    expect(
      countActiveUiFilters({
        query: "cars",
        date: "today",
        categories: ["car_meet"],
        distanceMiles: 50,
      })
    ).toBe(4);
  });

  it("parses current / searched / unknown location URL params", () => {
    expect(parseLocationFromSearchParams(new URLSearchParams())).toEqual({
      mode: "unknown",
      displayLocation: null,
      lat: null,
      lng: null,
    });

    const current = parseLocationFromSearchParams(
      new URLSearchParams("near=you&lat=34.17&lng=-118.83")
    );
    expect(current.mode).toBe("current");
    expect(current.displayLocation).toBeNull();
    expect(current.lat).toBeCloseTo(34.17);
    expect(current.lng).toBeCloseTo(-118.83);
    expect(locationNearLabel(current)).toBe("Near current location");
    expect(locationInputDisplay(current)).toBe("Current location");

    const searched = parseLocationFromSearchParams(
      new URLSearchParams("loc=San+Diego%2C+CA&lat=32.72&lng=-117.16")
    );
    expect(searched.mode).toBe("searched");
    expect(locationNearLabel(searched)).toBe("Near San Diego, CA");
    expect(locationInputDisplay(searched)).toBe("San Diego, CA");

    expect(
      locationNearLabel({
        mode: "unknown",
        displayLocation: null,
        lat: null,
        lng: null,
      })
    ).toBeNull();
  });

  it("writes current vs searched location params distinctly", () => {
    const currentParams = new URLSearchParams("loc=Old&lat=1&lng=2");
    setCurrentLocationParams(currentParams, {
      lat: 34.1,
      lng: -118.8,
    });
    expect(currentParams.get("near")).toBe("you");
    expect(currentParams.get("loc")).toBeNull();
    expect(currentParams.get("lat")).toBe("34.1");

    const searchedParams = new URLSearchParams("near=you&lat=34&lng=-118");
    setSearchedLocationParams(searchedParams, {
      loc: "San Diego, CA",
      lat: 32.72,
      lng: -117.16,
    });
    expect(searchedParams.get("near")).toBeNull();
    expect(searchedParams.get("loc")).toBe("San Diego, CA");
  });

  it("manual → device clears stale loc and keeps other filters", () => {
    const params = new URLSearchParams(
      "distance=100&category=outdoor&date=today&loc=Poway%2C+CA&lat=32.956&lng=-117.04"
    );
    setCurrentLocationParams(params, { lat: 34.05, lng: -118.25 });

    const location = parseLocationFromSearchParams(params);
    expect(location.mode).toBe("current");
    expect(location.lat).toBeCloseTo(34.05);
    expect(location.lng).toBeCloseTo(-118.25);
    expect(params.get("loc")).toBeNull();
    expect(locationInputDisplay(location)).toBe("Current location");
    expect(locationNearLabel(location)).toBe("Near current location");
    expect(locationDistanceContextLabel(location, 100)).toBe(
      "Near current location · 100 mi"
    );
    expect(params.get("distance")).toBe("100");
    expect(params.get("category")).toBe("outdoor");
    expect(params.get("date")).toBe("today");
  });

  it("locationDistanceContextLabel syncs with location + distance (no stale loc)", () => {
    const poway = parseLocationFromSearchParams(
      new URLSearchParams(
        "distance=100&loc=Poway%2C+CA&lat=32.956&lng=-117.04"
      )
    );
    expect(locationDistanceContextLabel(poway, 100)).toBe(
      "Near Poway, CA · 100 mi"
    );
    expect(locationDistanceContextLabel(poway, 25)).toBe(
      "Near Poway, CA · 25 mi"
    );

    const afterDevice = new URLSearchParams(
      "distance=100&loc=Poway%2C+CA&lat=32.956&lng=-117.04"
    );
    setCurrentLocationParams(afterDevice, { lat: 34.05, lng: -118.25 });
    const current = parseLocationFromSearchParams(afterDevice);
    expect(locationDistanceContextLabel(current, 100)).toBe(
      "Near current location · 100 mi"
    );
    expect(locationDistanceContextLabel(current, 100)).not.toContain("Poway");

    const camarillo = parseLocationFromSearchParams(
      new URLSearchParams(
        "distance=25&loc=Camarillo%2C+CA&lat=34.22&lng=-119.04"
      )
    );
    expect(locationDistanceContextLabel(camarillo, 25)).toBe(
      "Near Camarillo, CA · 25 mi"
    );

    expect(
      locationDistanceContextLabel(
        {
          mode: "unknown",
          displayLocation: null,
          lat: null,
          lng: null,
        },
        25
      )
    ).toBeNull();
  });

  it("device failure path leaves manual params untouched", () => {
    const before =
      "distance=100&loc=Poway%2C+CA&lat=32.956&lng=-117.04";
    const params = new URLSearchParams(before);
    // Simulate geolocation denial: no setCurrentLocationParams call.
    expect(params.toString()).toBe(
      new URLSearchParams(before).toString()
    );
    const location = parseLocationFromSearchParams(params);
    expect(location.mode).toBe("searched");
    expect(locationInputDisplay(location)).toBe("Poway, CA");
    expect(location.lat).toBeCloseTo(32.956);
  });

  it("device → manual replaces current mode completely", () => {
    const params = new URLSearchParams("near=you&lat=34.05&lng=-118.25&distance=100");
    setSearchedLocationParams(params, {
      loc: "Camarillo, CA",
      lat: 34.216,
      lng: -119.037,
    });
    const location = parseLocationFromSearchParams(params);
    expect(location.mode).toBe("searched");
    expect(params.get("near")).toBeNull();
    expect(locationInputDisplay(location)).toBe("Camarillo, CA");
    expect(location.lat).toBeCloseTo(34.216);
    expect(params.get("distance")).toBe("100");
  });

  it("manual A → device → manual B → device leaves no stale labels", () => {
    const params = new URLSearchParams();
    setSearchedLocationParams(params, {
      loc: "Poway, CA",
      lat: 32.956,
      lng: -117.04,
    });
    setCurrentLocationParams(params, { lat: 34.05, lng: -118.25 });
    expect(params.get("loc")).toBeNull();
    expect(parseLocationFromSearchParams(params).mode).toBe("current");

    setSearchedLocationParams(params, {
      loc: "Camarillo, CA",
      lat: 34.216,
      lng: -119.037,
    });
    expect(params.get("near")).toBeNull();
    expect(params.get("loc")).toBe("Camarillo, CA");

    setCurrentLocationParams(params, { lat: 33.9, lng: -118.4 });
    const final = parseLocationFromSearchParams(params);
    expect(final.mode).toBe("current");
    expect(params.get("loc")).toBeNull();
    expect(locationInputDisplay(final)).toBe("Current location");
    expect(final.lat).toBeCloseTo(33.9);
    expect(final.lng).toBeCloseTo(-118.4);
  });
});

describe("ephemeral place geocoding", () => {
  it("formats City, ST from Mapbox feature context", () => {
    expect(
      formatCityStateLabel({
        text: "91301",
        place_type: ["postcode"],
        context: [
          { id: "place.1", text: "Agoura Hills" },
          { id: "region.1", text: "California", short_code: "US-CA" },
        ],
      })
    ).toBe("Agoura Hills, CA");

    expect(
      formatCityStateLabel({
        text: "Thousand Oaks",
        place_type: ["place"],
        context: [
          { id: "region.1", text: "California", short_code: "US-CA" },
        ],
      })
    ).toBe("Thousand Oaks, CA");
  });

  it("forward geocodes without permanent=true and normalizes label", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            center: [-118.76, 34.15],
            place_name: "91301, Agoura Hills, California, United States",
            text: "91301",
            place_type: ["postcode"],
            context: [
              { id: "place.1", text: "Agoura Hills" },
              { id: "region.1", text: "California", short_code: "US-CA" },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePlaceEphemeral("91301", "test-token");
    expect(result).toEqual({
      lat: 34.15,
      lng: -118.76,
      label: "Agoura Hills, CA",
      placeName: "91301, Agoura Hills, California, United States",
    });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("mapbox.com/geocoding");
    expect(calledUrl).not.toContain("permanent=true");

    vi.unstubAllGlobals();
  });

  it("reverse geocodes to City, ST without permanent=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            text: "Thousand Oaks",
            place_type: ["place"],
            place_name: "Thousand Oaks, California, United States",
            context: [
              { id: "region.1", text: "California", short_code: "US-CA" },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const label = await reverseGeocodeEphemeral(34.17, -118.83, "test-token");
    expect(label).toBe("Thousand Oaks, CA");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("-118.83,34.17");
    expect(calledUrl).not.toContain("permanent=true");

    vi.unstubAllGlobals();
  });

  it("keeps GPS usable when reverse geocode fails (returns null label)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );
    const label = await reverseGeocodeEphemeral(34.17, -118.83, "test-token");
    expect(label).toBeNull();
    vi.unstubAllGlobals();
  });
});
