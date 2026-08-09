import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import OverdrivePage from "@/app/page";
import EventDiscoveryPage from "@/app/events/page";

vi.mock("@/components/map/EventMap", () => ({
  EventMap: () => <div data-testid="map-stub" />,
}));

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "--font-sans", className: "" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("route smoke", () => {
  it("renders Overdrive at / without throwing", () => {
    const { getAllByText } = render(<OverdrivePage />);
    expect(getAllByText("Overdrive").length).toBeGreaterThan(0);
  });

  it("renders EventDiscovery at /events without throwing", () => {
    const { getAllByText } = render(<EventDiscoveryPage />);
    expect(getAllByText("EventDiscovery").length).toBeGreaterThan(0);
  });
});
