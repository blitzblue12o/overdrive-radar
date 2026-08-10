import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { EventList } from "@/components/events/EventList";

afterEach(() => {
  cleanup();
});

describe("EventList empty / sparse actions (A4)", () => {
  it("exposes Expand distance when radius can grow", () => {
    const onExpand = vi.fn();
    render(
      <EventList
        events={[]}
        selectedEventId={null}
        onSelect={() => {}}
        filtersActive={false}
        onExpandDistance={onExpand}
        canExpandDistance
      />
    );
    const btn = screen.getByRole("button", { name: /expand distance/i });
    fireEvent.click(btn);
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("keeps Clear filters when filters are active", () => {
    render(
      <EventList
        events={[]}
        selectedEventId={null}
        onSelect={() => {}}
        filtersActive
        onClearFilters={() => {}}
        onExpandDistance={() => {}}
        canExpandDistance
      />
    );
    expect(
      screen.getByRole("button", { name: /clear filters/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /expand distance/i })
    ).toBeTruthy();
  });
});
