import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchAreaChip } from "@/components/location/SearchAreaChip";

afterEach(() => {
  cleanup();
});

describe("SearchAreaChip", () => {
  it("renders Near label and recenters on click", () => {
    const onRecenter = vi.fn();
    render(
      <SearchAreaChip
        nearLabel="Near Poway, CA · 100 mi"
        away={false}
        onRecenter={onRecenter}
        size="sm"
      />
    );
    expect(screen.getByText("Near Poway, CA · 100 mi")).toBeTruthy();
    expect(screen.getByTestId("search-area-chip").getAttribute("data-away")).toBe(
      "false"
    );
    fireEvent.click(screen.getByTestId("search-area-chip"));
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it("renders Return to label when away", () => {
    const onRecenter = vi.fn();
    render(
      <SearchAreaChip
        nearLabel="Near Poway, CA"
        away
        onRecenter={onRecenter}
      />
    );
    expect(screen.getByText("Return to Poway, CA")).toBeTruthy();
    expect(screen.getByTestId("search-area-chip").getAttribute("data-away")).toBe(
      "true"
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
