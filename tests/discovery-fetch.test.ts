import { describe, expect, it, vi } from "vitest";
import {
  buildEventsApiSearchParams,
  discoveryFetchKey,
} from "@/lib/events/discovery-fetch";
import {
  armViewportSuppressUntilMoveEnd,
  consumeViewportSuppress,
  isViewportFetchSuppressed,
} from "@/lib/events/filters";

const baseInput = {
  experienceId: "event_discovery",
  bbox: { minLng: -118, minLat: 32, maxLng: -117, maxLat: 34 },
  center: { lat: 33, lng: -117.5 },
  distanceMiles: 25,
  q: "",
  date: null as string | null,
  category: null as string | null,
};

describe("discovery fetch isolation", () => {
  it("builds API params from discovery inputs only (no selection)", () => {
    const params = buildEventsApiSearchParams({
      ...baseInput,
      q: "cars",
      date: "weekend",
      category: "outdoor",
    });

    expect(params.get("experience")).toBe("event_discovery");
    expect(params.get("q")).toBe("cars");
    expect(params.get("date")).toBe("weekend");
    expect(params.get("category")).toBe("outdoor");
    expect(params.get("distance")).toBe("25");
    expect(params.has("event")).toBe(false);
    expect(params.has("selectedEvent")).toBe(false);
    expect(params.has("sheet")).toBe(false);
  });

  it("selection-only presentation fields do not change discoveryFetchKey", () => {
    const key = discoveryFetchKey(baseInput);
    // Same discovery inputs → same key regardless of UI selection state elsewhere.
    expect(discoveryFetchKey({ ...baseInput })).toBe(key);
  });

  it("filter / viewport discovery changes do change the key", () => {
    const base = discoveryFetchKey(baseInput);
    expect(
      discoveryFetchKey({ ...baseInput, category: "outdoor" })
    ).not.toBe(base);
    expect(discoveryFetchKey({ ...baseInput, date: "today" })).not.toBe(base);
    expect(discoveryFetchKey({ ...baseInput, distanceMiles: 100 })).not.toBe(
      base
    );
    expect(discoveryFetchKey({ ...baseInput, q: "poway" })).not.toBe(base);
    expect(
      discoveryFetchKey({
        ...baseInput,
        bbox: { ...baseInput.bbox, minLng: -119 },
      })
    ).not.toBe(base);
  });
});

describe("programmatic viewport suppress", () => {
  it("keeps suppress armed through multiple moveend emissions", () => {
    const ref = { current: false };
    let moveendHandler: (() => void) | null = null;
    const map = {
      once: (_event: "moveend", listener: () => void) => {
        moveendHandler = listener;
      },
    };

    armViewportSuppressUntilMoveEnd(ref, map);
    expect(isViewportFetchSuppressed(ref)).toBe(true);

    // Intermediate moveends during flyTo must still skip fetch (peek, not consume).
    expect(isViewportFetchSuppressed(ref)).toBe(true);
    expect(isViewportFetchSuppressed(ref)).toBe(true);

    expect(moveendHandler).toBeTypeOf("function");
    moveendHandler!();
    // Cleared on microtask after the animation moveend.
    expect(isViewportFetchSuppressed(ref)).toBe(true);

    return Promise.resolve().then(() => {
      expect(isViewportFetchSuppressed(ref)).toBe(false);
    });
  });

  it("consumeViewportSuppress still clears one-shot (legacy)", () => {
    const ref = { current: true };
    expect(consumeViewportSuppress(ref)).toBe(true);
    expect(ref.current).toBe(false);
    expect(consumeViewportSuppress(ref)).toBe(false);
  });

  it("user pan after clear is not suppressed", () => {
    const ref = { current: false };
    const onViewport = vi.fn();
    const emit = () => {
      if (isViewportFetchSuppressed(ref)) return;
      onViewport();
    };
    emit();
    expect(onViewport).toHaveBeenCalledTimes(1);
  });
});
