import { describe, expect, it } from "vitest";

import {
  buildGigChecksum,
  buildGigSlug,
  normalizeTitleForMatch,
  normalizeVenueName,
  normalizeVenueWebsiteUrl,
  slugify,
  slugifyVenueName
} from "./index";

describe("normalization helpers", () => {
  it("creates stable slugs", () => {
    expect(slugify("Milk Bar Presents: TIME!!!")).toBe("milk-bar-presents-time");
    expect(slugifyVenueName("Mojo's Bar")).toBe("mojos-bar");
    expect(slugifyVenueName("Mojos Bar")).toBe("mojos-bar");
    expect(slugifyVenueName("Clancy's Fish Pub | Freemantle")).toBe("clancys-fish-pub");
    expect(slugifyVenueName("Four5Nine Bar")).toBe("four5nine-bar-rosemount");
    expect(
      buildGigSlug({
        venueSlug: "milk-bar",
        startsAt: "2026-04-10T11:30:00.000Z",
        title: "TIME"
      })
    ).toBe("milk-bar-2026-04-10-time");
  });

  it("normalizes titles for canonical matching", () => {
    expect(normalizeTitleForMatch("TIME  ")).toBe("time");
    expect(normalizeTitleForMatch("Time")).toBe("time");
  });

  it("canonicalizes known venue labels before storing them", () => {
    expect(normalizeVenueName("Clancy's Fish Pub | Freemantle")).toBe("Clancy's Fish Pub");
    expect(normalizeVenueName("Clancy's Fish Pub | Fremantle")).toBe("Clancy's Fish Pub");
    expect(normalizeVenueName("Four5Nine Bar")).toBe("Four5Nine Bar @ Rosemount");
  });

  it("fills known venue website overrides without inventing generic source URLs", () => {
    expect(normalizeVenueWebsiteUrl("Rosemount Hotel", null)).toBe(
      "https://www.rosemounthotel.com.au/"
    );
    expect(normalizeVenueWebsiteUrl("Four5Nine Bar", null)).toBe(
      "https://www.rosemounthotel.com.au/"
    );
    expect(normalizeVenueWebsiteUrl("Milk Bar", null)).toBeNull();
    expect(normalizeVenueWebsiteUrl("Rosemount Hotel", " https://example.com ")).toBe(
      "https://example.com"
    );
  });

  it("builds deterministic gig checksums", () => {
    const input = {
      sourceSlug: "milk-bar",
      startsAt: "2026-04-10T11:30:00.000Z",
      title: "TIME",
      venueSlug: "milk-bar",
      sourceUrl:
        "https://tickets.avclive.com.au/outlet/event/f4fbba8d-7582-40fb-b5e5-4f0aedab965f"
    };

    expect(buildGigChecksum(input)).toBe(buildGigChecksum(input));
  });
});
