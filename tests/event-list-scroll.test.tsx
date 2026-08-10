import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExperienceProvider } from "@/components/experience/ExperienceProvider";
import { EventList } from "@/components/events/EventList";
import { MobileBottomSheet } from "@/components/layout/MobileBottomSheet";
import { eventDiscoveryConfig } from "@/lib/config/experiences";
import type { EventCardData } from "@/components/events/EventCard";

afterEach(() => {
  cleanup();
});

function makeEvent(id: string, title: string): EventCardData {
  return {
    id,
    title,
    experience: "event_discovery",
    category: "community",
    starts_at: "2026-08-10T18:00:00.000Z",
    ends_at: null,
    venue_name: "Venue",
    address: null,
    is_free: true,
    price_amount: null,
    price_currency: null,
    image_url: null,
    description: null,
    source_url: null,
    timezone: "America/Los_Angeles",
    latitude: 32.96,
    longitude: -117.03,
  };
}

const manyEvents = Array.from({ length: 30 }, (_, i) =>
  makeEvent(`e-${i + 1}`, `Event ${i + 1}`)
);

function wrap(ui: ReactNode) {
  return (
    <ExperienceProvider config={eventDiscoveryConfig}>{ui}</ExperienceProvider>
  );
}

describe("EventList loading vs selection", () => {
  it("keeps existing list mounted while loading (no skeleton swap)", () => {
    const { rerender } = render(
      wrap(
        <EventList
          events={manyEvents}
          selectedEventId={null}
          onSelect={() => {}}
          loading={false}
        />
      )
    );

    expect(screen.getByLabelText("Events")).toBeTruthy();
    expect(screen.queryByLabelText("Loading events")).toBeNull();

    rerender(
      wrap(
        <EventList
          events={manyEvents}
          selectedEventId="e-20"
          onSelect={() => {}}
          loading={true}
        />
      )
    );

    expect(screen.getByLabelText("Events")).toBeTruthy();
    expect(screen.queryByLabelText("Loading events")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Event 20/i }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("shows skeletons only when loading with an empty list", () => {
    render(
      wrap(
        <EventList
          events={[]}
          selectedEventId={null}
          onSelect={() => {}}
          loading
        />
      )
    );
    expect(screen.getByLabelText("Loading events")).toBeTruthy();
  });
});

describe("MobileBottomSheet list scroll ownership", () => {
  it("keeps list scroll container mounted across list → event-detail → list", () => {
    const onStateChange = vi.fn();
    const list = (
      <div style={{ height: 2000 }} data-testid="tall-list">
        tall
      </div>
    );

    const { rerender } = render(
      wrap(
        <div style={{ height: 400, position: "relative" }}>
          <MobileBottomSheet
            state="list"
            onStateChange={onStateChange}
            eventCount={30}
            list={list}
            eventDetail={<div data-testid="detail">detail</div>}
          />
        </div>
      )
    );

    const scroll = screen.getByTestId("mobile-event-list-scroll");
    Object.defineProperty(scroll, "scrollTop", {
      configurable: true,
      writable: true,
      value: 420,
    });
    expect(scroll.scrollTop).toBe(420);
    expect(scroll.classList.contains("hidden")).toBe(false);

    rerender(
      wrap(
        <div style={{ height: 400, position: "relative" }}>
          <MobileBottomSheet
            state="event-detail"
            onStateChange={onStateChange}
            eventCount={30}
            list={list}
            eventDetail={<div data-testid="detail">detail</div>}
          />
        </div>
      )
    );

    const scrollWhileDetail = screen.getByTestId("mobile-event-list-scroll");
    expect(scrollWhileDetail).toBe(scroll);
    expect(scrollWhileDetail.classList.contains("hidden")).toBe(true);
    expect(scrollWhileDetail.scrollTop).toBe(420);
    expect(screen.getByTestId("detail")).toBeTruthy();

    rerender(
      wrap(
        <div style={{ height: 400, position: "relative" }}>
          <MobileBottomSheet
            state="list"
            onStateChange={onStateChange}
            eventCount={30}
            list={list}
            eventDetail={<div data-testid="detail">detail</div>}
          />
        </div>
      )
    );

    const scrollBack = screen.getByTestId("mobile-event-list-scroll");
    expect(scrollBack).toBe(scroll);
    expect(scrollBack.classList.contains("hidden")).toBe(false);
    expect(scrollBack.scrollTop).toBe(420);
  });

  it("preserves scroll across repeated detail browsing", () => {
    const onStateChange = vi.fn();
    const list = <div style={{ height: 2400 }}>list</div>;
    const detail = <div>detail</div>;

    const { rerender } = render(
      wrap(
        <MobileBottomSheet
          state="list"
          onStateChange={onStateChange}
          eventCount={10}
          list={list}
          eventDetail={detail}
        />
      )
    );

    const scroll = screen.getByTestId("mobile-event-list-scroll");
    Object.defineProperty(scroll, "scrollTop", {
      configurable: true,
      writable: true,
      value: 880,
    });

    for (let i = 0; i < 3; i++) {
      rerender(
        wrap(
          <MobileBottomSheet
            state="event-detail"
            onStateChange={onStateChange}
            eventCount={10}
            list={list}
            eventDetail={detail}
          />
        )
      );
      rerender(
        wrap(
          <MobileBottomSheet
            state="list"
            onStateChange={onStateChange}
            eventCount={10}
            list={list}
            eventDetail={detail}
          />
        )
      );
      expect(screen.getByTestId("mobile-event-list-scroll").scrollTop).toBe(
        880
      );
    }
  });
});
