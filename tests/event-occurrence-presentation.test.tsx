import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EventCard } from "@/components/events/EventCard";
import { EventDetail } from "@/components/events/EventDetail";
import {
  formatEventDateTime,
  formatOccurrenceDetailLines,
  formatOccurrenceLabel,
  getEventTemporalDisplay,
} from "@/lib/events/format";

vi.mock("@/components/experience/ExperienceProvider", () => ({
  useExperience: () => ({
    id: "event_discovery",
    name: "EventDiscovery",
    categories: [{ value: "outdoor", label: "Outdoor" }],
    fallbackArt: { outdoor: "community", community: "community" },
    theme: { mode: "light" },
  }),
}));

vi.mock("@/components/events/FallbackArt", () => ({
  FallbackArt: () => <div data-testid="fallback-art" />,
}));

vi.mock("@/components/calendar/CalendarAction", () => ({
  CalendarAction: () => null,
}));

afterEach(() => cleanup());

const halloween = {
  id: "8e8bea20-c238-480d-9288-e9b73ce34355",
  title: "Halloween Campout",
  experience: "event_discovery" as const,
  category: "outdoor",
  starts_at: "2026-10-24T20:00:00.000Z",
  ends_at: "2026-10-25T17:00:00.000Z",
  venue_name: "Lake Poway",
  address: null,
  is_free: true,
  price_amount: null,
  price_currency: null,
  image_url: null,
  description: null,
  source_url: null,
  timezone: "America/Los_Angeles",
  all_day: false,
};

const camarillo = {
  ...halloween,
  id: "fef061c0-c6d7-4fd0-af5c-74bd3db61537",
  title: "Camarillo Reads: The Mystery of the Missing Mascot (Ages 3-12)",
  starts_at: "2026-09-01T12:00:00.000Z",
  ends_at: "2026-09-02T12:00:00.000Z",
  all_day: true,
};

describe("EventCard / EventDetail centralized temporal presentation", () => {
  it("Halloween Campout card shows both dates without Multi-day", () => {
    render(<EventCard event={halloween} />);
    const expected = formatOccurrenceLabel({
      starts_at: halloween.starts_at,
      ends_at: halloween.ends_at,
      timezone: halloween.timezone,
      all_day: halloween.all_day,
    });
    expect(screen.getByText(expected)).toBeTruthy();
    expect(expected).toMatch(/Oct 24/);
    expect(expected).toMatch(/Oct 25/);
    expect(expected).not.toMatch(/Multi-day/);
    expect(getEventTemporalDisplay(halloween).isMultiDay).toBe(false);
  });

  it("Halloween Campout detail uses start/end day lines", () => {
    render(<EventDetail event={halloween} />);
    const lines = formatOccurrenceDetailLines({
      starts_at: halloween.starts_at,
      ends_at: halloween.ends_at,
      timezone: halloween.timezone,
      all_day: halloween.all_day,
    });
    for (const line of lines) {
      expect(screen.getByText(line)).toBeTruthy();
    }
  });

  it("all-day single-day is All day, not Multi-day / Sep 1–2", () => {
    render(<EventCard event={camarillo} />);
    const label = screen.getByText(/All day/i);
    expect(label.textContent).toMatch(/Sep 1/);
    expect(label.textContent).not.toMatch(/Multi-day/);
    expect(label.textContent).not.toMatch(/Sep 1–2/);
  });

  it("formatEventDateTime delegates including all_day", () => {
    expect(
      formatEventDateTime(
        camarillo.starts_at,
        camarillo.ends_at,
        camarillo.timezone,
        true
      )
    ).toBe(
      formatOccurrenceLabel({
        starts_at: camarillo.starts_at,
        ends_at: camarillo.ends_at,
        timezone: camarillo.timezone,
        all_day: true,
      })
    );
  });

  it("Ventura VALUE=DATE concert stored as UTC noon presents as All day not 5am", () => {
    const music = {
      starts_at: "2026-08-15T12:00:00.000Z",
      ends_at: "2026-08-15T12:00:00.000Z",
      timezone: "America/Los_Angeles",
      all_day: true,
    };
    const label = formatOccurrenceLabel(music);
    expect(label).toMatch(/All day/i);
    expect(label).not.toMatch(/5:00/);
    expect(getEventTemporalDisplay(music).kind).toBe("all_day_single");
  });
});
