import { describe, expect, it } from "vitest";
import {
  consumeViewportSuppress,
  parseCategoryParam,
  resolveDateRange,
} from "@/lib/events/filters";

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
});
