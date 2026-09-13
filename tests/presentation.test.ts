import { describe, expect, it } from "vitest";
import {
  cardLocationLabel,
  displayEventTitle,
  extractDescriptionParts,
  formatSourceLabel,
  toDisplayTitleCase,
} from "@/lib/events/presentation";

describe("displayEventTitle", () => {
  it("strips leading emoji and source prefix", () => {
    expect(displayEventTitle("✨ PCA-LA CAR UNDER STARS", "PCA-LA")).toBe(
      "Car Under Stars"
    );
  });

  it("strips prefix from long PCA source_key blobs", () => {
    expect(
      displayEventTitle(
        "PCA-LA CAR UNDER STARS",
        "PCA-LA (Porsche Club of America — Los Angeles)"
      )
    ).toBe("Car Under Stars");
  });

  it("does not strip unrelated prefixes", () => {
    expect(displayEventTitle("LA Car Club Meetup", "PCA-LA")).toBe(
      "LA Car Club Meetup"
    );
  });

  it("leaves mixed-case titles alone", () => {
    expect(displayEventTitle("Cars & Coffee at Larchmont", "PCA-LA")).toBe(
      "Cars & Coffee at Larchmont"
    );
  });
});

describe("formatSourceLabel", () => {
  it("maps PCA-LA to a friendly label", () => {
    expect(formatSourceLabel("PCA-LA")).toBe("PCA Los Angeles");
  });

  it("maps long PCA source blobs to a friendly label", () => {
    expect(
      formatSourceLabel("PCA-LA (Porsche Club of America — Los Angeles)")
    ).toBe("PCA Los Angeles");
  });
});

describe("toDisplayTitleCase", () => {
  it("title-cases ALL CAPS", () => {
    expect(toDisplayTitleCase("FULL MOON DRIVE")).toBe("Full Moon Drive");
  });
});

describe("cardLocationLabel", () => {
  it("formats neighborhood · city", () => {
    expect(
      cardLocationLabel("Larchmont, Los Angeles, CA, USA")
    ).toBe("Larchmont · Los Angeles");
  });

  it("prefers venue with city from address", () => {
    expect(
      cardLocationLabel(
        "Mimi's Cafe",
        "25343 Crenshaw Blvd, Torrance, CA 90505, USA"
      )
    ).toBe("Mimi's Cafe · Torrance");
  });

  it("uses venue head with city when address includes street", () => {
    expect(
      cardLocationLabel(
        "Angeles Crest, 701 Angeles Crest Hwy, Tujunga, CA 91042, USA"
      )
    ).toBe("Angeles Crest · Tujunga");
  });
});

describe("extractDescriptionParts", () => {
  it("splits labeled URLs from prose", () => {
    const input =
      "Full Event Details https://example.com/event Follow us on Instagram https://instagram.com/example";
    const { prose, links } = extractDescriptionParts(input);
    expect(prose).toBeNull();
    expect(links).toEqual([
      { href: "https://example.com/event", label: "Full Event Details" },
      { href: "https://instagram.com/example", label: "Instagram" },
    ]);
  });

  it("keeps prose without URLs", () => {
    expect(extractDescriptionParts("Meet at the north parking lot.")).toEqual({
      prose: "Meet at the north parking lot.",
      links: [],
    });
  });

  it("labels Instagram follow lines", () => {
    const input =
      "Join us Saturday.\nFollow us on Instagram\nhttps://www.instagram.com/porscheclubla";
    // displayDescriptionText collapses whitespace first
    const { links } = extractDescriptionParts(input);
    expect(links.some((l) => /instagram\.com/i.test(l.href))).toBe(true);
  });
});
