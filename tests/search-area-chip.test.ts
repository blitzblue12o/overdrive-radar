import { describe, expect, it } from "vitest";
import {
  haversineMiles,
  isMapAwayFromSearchArea,
  MAP_AWAY_RADIUS_FACTOR,
  searchAreaChipDisplayLabel,
} from "@/lib/events/filters";

const poway = { lat: 32.956363, lng: -117.039718 };
const la = { lat: 34.052235, lng: -118.243683 };

describe("search-area away / recenter helpers", () => {
  it("haversineMiles approximates Poway → LA", () => {
    const miles = haversineMiles(poway, la);
    expect(miles).toBeGreaterThan(90);
    expect(miles).toBeLessThan(130);
  });

  it("inside radius stays normal (Near)", () => {
    const near = { lat: poway.lat + 0.05, lng: poway.lng }; // ~3.5 mi
    expect(isMapAwayFromSearchArea(near, poway, 25)).toBe(false);
    expect(searchAreaChipDisplayLabel("Near Poway, CA", false)).toBe(
      "Near Poway, CA"
    );
  });

  it("outside threshold × radius shows away", () => {
    expect(isMapAwayFromSearchArea(la, poway, 25)).toBe(true);
    expect(
      searchAreaChipDisplayLabel("Near Poway, CA", true)
    ).toBe("Return to Poway, CA");
    expect(
      searchAreaChipDisplayLabel("Near Poway, CA · 100 mi", true)
    ).toBe("Return to Poway, CA · 100 mi");
  });

  it("uses current distance — same pan may be inside 100 mi but outside 10 mi", () => {
    // ~30 miles north of Poway
    const offset = { lat: poway.lat + 0.43, lng: poway.lng };
    const d = haversineMiles(poway, offset);
    expect(d).toBeGreaterThan(10 * MAP_AWAY_RADIUS_FACTOR);
    expect(d).toBeLessThan(100 * MAP_AWAY_RADIUS_FACTOR);
    expect(isMapAwayFromSearchArea(offset, poway, 10)).toBe(true);
    expect(isMapAwayFromSearchArea(offset, poway, 100)).toBe(false);
  });

  it("location label change does not keep prior place wording", () => {
    expect(
      searchAreaChipDisplayLabel("Near Camarillo, CA", false)
    ).toBe("Near Camarillo, CA");
    expect(
      searchAreaChipDisplayLabel("Near current location", true)
    ).toBe("Return to current location");
  });

  it("recenter target is the search center (identity check for callers)", () => {
    // Contract: away math compares map center to search center — not event coords.
    const search = { ...poway };
    const map = { ...la };
    expect(isMapAwayFromSearchArea(map, search, 25)).toBe(true);
    expect(isMapAwayFromSearchArea(search, search, 25)).toBe(false);
  });
});
