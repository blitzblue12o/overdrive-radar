import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EventCard } from "@/components/events/EventCard";
import { EventDetail } from "@/components/events/EventDetail";
import { buildRecurrenceById } from "@/lib/events/recurrence";

vi.mock("@/components/experience/ExperienceProvider", () => ({
  useExperience: () => ({
    id: "event_discovery",
    name: "EventDiscovery",
    categories: [{ value: "community", label: "Community" }],
    fallbackArt: { community: "community" },
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

const source = "City of Poway — Community Events";
const venue = "Community Park";
const tz = "America/Los_Angeles";

function ff(id: string, starts: string) {
  return {
    id,
    title: "Feeling Fit",
    experience: "event_discovery" as const,
    category: "community",
    starts_at: starts,
    ends_at: new Date(new Date(starts).getTime() + 3600000).toISOString(),
    venue_name: venue,
    address: null,
    is_free: true,
    price_amount: null,
    price_currency: null,
    image_url: null,
    description: null,
    source_url: null,
    timezone: tz,
    all_day: false,
    source_key: source,
  };
}

describe("recurrence list/detail presentation", () => {
  const events = [
    ff("a", "2026-08-10T17:00:00.000Z"),
    ff("b", "2026-08-17T17:00:00.000Z"),
    ff("c", "2026-08-24T17:00:00.000Z"),
  ];
  const recurrenceById = buildRecurrenceById(events);

  it("list card shows subtle Weekly label", () => {
    render(
      <EventCard
        event={events[0]}
        recurrenceLabel={recurrenceById.get("a")?.label}
      />
    );
    expect(screen.getByText("Weekly")).toBeTruthy();
  });

  it("17. sibling date click opens correct event id", () => {
    const onSelect = vi.fn();
    render(
      <EventDetail
        event={events[0]}
        recurrence={recurrenceById.get("a")}
        onSelectOccurrence={onSelect}
      />
    );
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.getByText(/3 dates in this search/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Open Feeling Fit, Aug 17/i }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("does not show recurrence for a single occurrence", () => {
    render(<EventCard event={events[0]} recurrenceLabel={null} />);
    expect(screen.queryByText("Weekly")).toBeNull();
  });
});
