import { describe, expect, it } from "vitest";
import {
  cardVenueLabel,
  displayDescriptionText,
  displayLocationLines,
  isUrlOnlyDescription,
  normalizeDisplayText,
  resolveEventWebsiteUrl,
  splitDescriptionSourceUrl,
} from "@/lib/events/display-text";

describe("normalizeDisplayText", () => {
  it("decodes common HTML entities", () => {
    expect(normalizeDisplayText("McDonald&apos;s")).toBe("McDonald's");
  });

  it("decodes CivicEngage-escaped entities with a backslash before semicolon", () => {
    expect(
      normalizeDisplayText(
        "<p>McDonald&apos\\;s</p> - 138 E. Harvard Blvd.   Santa Paula CA 93060"
      )
    ).toBe("McDonald's - 138 E. Harvard Blvd. Santa Paula CA 93060");
  });

  it("strips simple HTML tags", () => {
    expect(normalizeDisplayText("<p>Teague Park</p>")).toBe("Teague Park");
    expect(normalizeDisplayText("<p>ZOOM</p> -")).toBe("ZOOM -");
  });

  it("collapses unnecessary whitespace", () => {
    expect(normalizeDisplayText("  Malibu   Bluffs\nPark  ")).toBe(
      "Malibu Bluffs Park"
    );
  });
});

describe("cardVenueLabel", () => {
  it("prefers facility name before CivicEngage address suffix", () => {
    expect(
      cardVenueLabel(
        "<p>Olivas Adobe Historical Park</p> - 4200 Olivas Park Drive  Ventura CA 93001"
      )
    ).toBe("Olivas Adobe Historical Park");
  });

  it("falls back to normalized venue when no address suffix", () => {
    expect(cardVenueLabel("<p>Community Room</p>")).toBe("Community Room");
  });
});

describe("displayLocationLines", () => {
  it("suppresses duplicate normalized venue/address", () => {
    expect(
      displayLocationLines(
        "Malibu Bluffs Park - 24250 Pacific Coast Highway Malibu CA 90265",
        "Malibu Bluffs Park - 24250 Pacific Coast Highway Malibu CA 90265"
      )
    ).toEqual({
      primary:
        "Malibu Bluffs Park - 24250 Pacific Coast Highway Malibu CA 90265",
      secondary: null,
    });
  });

  it("dedupes when one side has trivial HTML differences", () => {
    expect(
      displayLocationLines("<p>Teague Park</p>", "Teague Park")
    ).toEqual({ primary: "Teague Park", secondary: null });
  });

  it("keeps distinct venue and address", () => {
    expect(
      displayLocationLines(
        "Homework Center",
        "4101 Las Posas Road, Camarillo, CA 93010"
      )
    ).toEqual({
      primary: "Homework Center",
      secondary: "4101 Las Posas Road, Camarillo, CA 93010",
    });
  });
});

describe("displayDescriptionText / trailing source URLs", () => {
  it("strips a trailing Poway calendar URL and keeps prose", () => {
    const input =
      "Enjoy fishing and boating past hours at Lake Poway and try for the night bite! https://www.poway.org/calendar.aspx?EID=5840";
    expect(displayDescriptionText(input)).toBe(
      "Enjoy fishing and boating past hours at Lake Poway and try for the night bite!"
    );
    expect(splitDescriptionSourceUrl(input).sourceUrl).toBe(
      "https://www.poway.org/calendar.aspx?EID=5840"
    );
  });

  it("hides URL-only descriptions", () => {
    expect(
      displayDescriptionText(
        "https://www.malibucity.org/calendar.aspx?EID=15388"
      )
    ).toBeNull();
  });

  it("leaves normal prose unchanged", () => {
    expect(
      displayDescriptionText(
        "Discover the joy of gardening with our fun, interactive program."
      )
    ).toBe(
      "Discover the joy of gardening with our fun, interactive program."
    );
  });

  it("does not strip mid-sentence URLs that are part of prose meaning", () => {
    const input =
      "Register at https://example.com/signup before Friday for limited seats.";
    expect(displayDescriptionText(input)).toBe(input);
    expect(splitDescriptionSourceUrl(input).sourceUrl).toBeNull();
  });
});

describe("isUrlOnlyDescription", () => {
  it("detects URL-only descriptions", () => {
    expect(isUrlOnlyDescription("https://example.com/event/123")).toBe(true);
    expect(
      isUrlOnlyDescription(
        "  https://www.malibucity.org/calendar.aspx?EID=15388  "
      )
    ).toBe(true);
  });

  it("keeps prose descriptions", () => {
    expect(isUrlOnlyDescription("Learn about our event.")).toBe(false);
  });

  it("keeps prose that also contains a URL as not URL-only", () => {
    expect(
      isUrlOnlyDescription("Learn about our event. https://example.com")
    ).toBe(false);
  });

  it("keeps genuine Camarillo-style descriptions", () => {
    expect(
      isUrlOnlyDescription(
        "Discover the joy of gardening with our fun, interactive program for all ages."
      )
    ).toBe(false);
  });
});

describe("resolveEventWebsiteUrl", () => {
  it("prefers absolute source_url", () => {
    expect(
      resolveEventWebsiteUrl(
        "https://camarillolibrary.libcal.com/event/15948678",
        "Discover the joy of gardening. https://example.com/ignored"
      )
    ).toBe("https://camarillolibrary.libcal.com/event/15948678");
  });

  it("uses URL-only description when source_url is relative", () => {
    expect(
      resolveEventWebsiteUrl(
        "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=43",
        " https://www.malibucity.org/calendar.aspx?EID=15388"
      )
    ).toBe("https://www.malibucity.org/calendar.aspx?EID=15388");
  });

  it("uses trailing description URL when source_url is relative", () => {
    expect(
      resolveEventWebsiteUrl(
        "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=32",
        "Enjoy fishing and boating past hours at Lake Poway and try for the night bite! https://www.poway.org/calendar.aspx?EID=5840"
      )
    ).toBe("https://www.poway.org/calendar.aspx?EID=5840");
  });

  it("omits Website when no valid absolute URL can be resolved", () => {
    expect(
      resolveEventWebsiteUrl(
        "/relative",
        "Discover the joy of gardening with our fun, interactive program."
      )
    ).toBeNull();
    expect(
      resolveEventWebsiteUrl(null, "Community picnic at the park.")
    ).toBeNull();
  });
});
