import { describe, expect, it, vi } from "vitest";
import {
  consumeViewportSuppress,
  countActiveUiFilters,
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

  it("consumeViewportSuppress prevents flyTo refetch loops", () => {
    const ref = { current: true };
    expect(consumeViewportSuppress(ref)).toBe(true);
    expect(ref.current).toBe(false);
    expect(consumeViewportSuppress(ref)).toBe(false);
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
      new URLSearchParams(
        "near=you&lat=34.17&lng=-118.83&loc=Thousand+Oaks%2C+CA"
      )
    );
    expect(current.mode).toBe("current");
    expect(current.displayLocation).toBe("Thousand Oaks, CA");
    expect(current.lat).toBeCloseTo(34.17);
    expect(current.lng).toBeCloseTo(-118.83);
    expect(locationNearLabel(current)).toBe("Near Thousand Oaks, CA");

    const searched = parseLocationFromSearchParams(
      new URLSearchParams("loc=San+Diego%2C+CA&lat=32.72&lng=-117.16")
    );
    expect(searched.mode).toBe("searched");
    expect(locationNearLabel(searched)).toBe("Near San Diego, CA");

    expect(
      locationNearLabel({
        mode: "current",
        displayLocation: null,
        lat: 34,
        lng: -118,
      })
    ).toBe("Near Current location");

    expect(locationNearLabel({
      mode: "unknown",
      displayLocation: null,
      lat: null,
      lng: null,
    })).toBeNull();
  });

  it("writes current vs searched location params distinctly", () => {
    const currentParams = new URLSearchParams("loc=Old&lat=1&lng=2");
    setCurrentLocationParams(currentParams, {
      lat: 34.1,
      lng: -118.8,
      loc: "Thousand Oaks, CA",
    });
    expect(currentParams.get("near")).toBe("you");
    expect(currentParams.get("loc")).toBe("Thousand Oaks, CA");
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
