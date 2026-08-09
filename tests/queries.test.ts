import { describe, expect, it } from "vitest";
import { getEventById, getEventsInViewport } from "@/lib/events/queries";
import { getPriceBadge } from "@/lib/events/pricing";
import {
  createMockEventsClient,
  sampleEvents,
} from "@/tests/helpers/mockSupabase";

const socalBbox = {
  minLng: -119.2,
  minLat: 33.8,
  maxLng: -117.8,
  maxLat: 34.5,
};

describe("getEventsInViewport filters", () => {
  it("applies bbox filtering", async () => {
    const client = createMockEventsClient(sampleEvents());
    const rows = await getEventsInViewport("overdrive", socalBbox, client);
    expect(rows.map((r) => r.id)).toContain("od-1");
    expect(rows.map((r) => r.id)).not.toContain("od-outside");
  });

  it("excludes cancelled, unpublished, and past events", async () => {
    const client = createMockEventsClient(sampleEvents());
    const rows = await getEventsInViewport("overdrive", socalBbox, client);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain("od-cancelled");
    expect(ids).not.toContain("od-draft");
    expect(ids).not.toContain("od-past");
  });

  it("selects is_free / price_amount / price_currency fields", async () => {
    const client = createMockEventsClient(sampleEvents());
    const rows = await getEventsInViewport("overdrive", socalBbox, client);
    const free = rows.find((r) => r.id === "od-1");
    expect(free).toBeTruthy();
    expect(free).toHaveProperty("is_free", true);
    expect(free).toHaveProperty("price_amount", null);
    expect(free).toHaveProperty("price_currency", "USD");

    const ed = await getEventsInViewport("event_discovery", socalBbox, client);
    const priced = ed.find((r) => r.id === "ed-1");
    expect(priced?.is_free).toBe(false);
    expect(priced?.price_amount).toBe(12.5);
  });
});

describe("getEventById", () => {
  it("scopes by experience", async () => {
    const client = createMockEventsClient(sampleEvents());
    const ok = await getEventById("overdrive", "od-1", client);
    expect(ok?.title).toBe("Overdrive Meet A");

    const leaked = await getEventById("overdrive", "ed-1", client);
    expect(leaked).toBeNull();
  });
});

describe("pricing display rules", () => {
  it("maps free / paid / unknown / absent correctly", () => {
    expect(getPriceBadge({ is_free: true })?.label).toBe("Free");
    expect(getPriceBadge({ is_free: true }, "detail")?.label).toBe("Free entry");
    expect(
      getPriceBadge({
        is_free: false,
        price_amount: 15,
        price_currency: "USD",
      })?.kind
    ).toBe("paid");
    expect(
      getPriceBadge({ is_free: false, price_amount: null })?.label
    ).toBe("Paid");
    expect(getPriceBadge({ is_free: null })).toBeNull();
  });
});
