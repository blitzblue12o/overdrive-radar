import { describe, expect, it } from "vitest";
import { splitTextWithUrls, splitUrlMatch } from "@/lib/events/autolink";

describe("splitUrlMatch", () => {
  it("strips trailing period", () => {
    expect(splitUrlMatch("https://example.com/event.")).toEqual({
      href: "https://example.com/event",
      trailing: ".",
    });
  });

  it("keeps balanced parentheses inside the URL", () => {
    expect(splitUrlMatch("https://en.wikipedia.org/wiki/Porsche_(car)")).toEqual({
      href: "https://en.wikipedia.org/wiki/Porsche_(car)",
      trailing: "",
    });
  });

  it("strips an unmatched closing parenthesis", () => {
    expect(splitUrlMatch("https://example.com/event)")).toEqual({
      href: "https://example.com/event",
      trailing: ")",
    });
  });
});

describe("splitTextWithUrls", () => {
  it("returns plain text unchanged when there is no URL", () => {
    expect(splitTextWithUrls("Meet at the north parking lot.")).toEqual([
      { type: "text", value: "Meet at the north parking lot." },
    ]);
  });

  it("links a single URL", () => {
    expect(splitTextWithUrls("More info https://example.com")).toEqual([
      { type: "text", value: "More info " },
      { type: "url", value: "https://example.com" },
    ]);
  });

  it("supports multiple URLs and preserves surrounding text", () => {
    const input =
      "Website https://example.com\nInstagram https://instagram.com/example";
    expect(splitTextWithUrls(input)).toEqual([
      { type: "text", value: "Website " },
      { type: "url", value: "https://example.com" },
      { type: "text", value: "\nInstagram " },
      { type: "url", value: "https://instagram.com/example" },
    ]);
  });

  it("does not link non-http text", () => {
    expect(splitTextWithUrls("See ftp://files.example or example.com")).toEqual([
      { type: "text", value: "See ftp://files.example or example.com" },
    ]);
  });

  it("keeps punctuation outside the href", () => {
    expect(
      splitTextWithUrls("Details: https://example.com/event.")
    ).toEqual([
      { type: "text", value: "Details: " },
      { type: "url", value: "https://example.com/event" },
      { type: "text", value: "." },
    ]);
  });
});
