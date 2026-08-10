import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClusterEventPicker } from "@/components/map/ClusterEventPicker";

afterEach(() => cleanup());

describe("ClusterEventPicker", () => {
  const events = [
    {
      id: "a",
      title: "Feeling Fit",
      starts_at: "2026-08-10T17:00:00.000Z",
      ends_at: "2026-08-10T18:00:00.000Z",
      timezone: "America/Los_Angeles",
      venue_name: "Community Park - Sycamore Hall",
      address: null,
    },
    {
      id: "b",
      title: "Rollin' & Strollin'",
      starts_at: "2026-08-10T20:00:00.000Z",
      ends_at: "2026-08-10T21:30:00.000Z",
      timezone: "America/Los_Angeles",
      venue_name: "Community Park - Sycamore Hall",
      address: null,
    },
  ];

  it("lists all colocated events and opens the chosen occurrence", () => {
    const onSelect = vi.fn();
    render(
      <ClusterEventPicker events={events} onSelect={onSelect} onClose={() => {}} />
    );
    expect(screen.getByText(/2 events at Community Park/i)).toBeTruthy();
    expect(screen.getByText("Feeling Fit")).toBeTruthy();
    expect(screen.getByText("Rollin' & Strollin'")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Open Rollin' & Strollin'/i })
    );
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
