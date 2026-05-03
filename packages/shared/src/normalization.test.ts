import { describe, expect, it } from "vitest";

import {
  areCanonicalTitlesCompatible,
  buildGigChecksum,
  buildGigSlug,
  decodeHtmlEntities,
  normalizeCanonicalTitleForMatch,
  normalizeVenueAddress,
  normalizeTitleForMatch,
  normalizeVenueName,
  normalizeVenueSuburb,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
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

  it("decodes common HTML entities before normalizing display text", () => {
    expect(decodeHtmlEntities("Mojo&#39;s Bar &amp; Grill")).toBe("Mojo's Bar & Grill");
    expect(normalizeWhitespace("Cleaver Street &amp; Co. Studio")).toBe(
      "Cleaver Street & Co. Studio"
    );
  });

  it("normalizes canonical titles without changing checksum matching rules", () => {
    expect(
      normalizeCanonicalTitleForMatch(
        "CANCELLED - Sophie Lilah 'Busy Being in Love' Album Launch 2026"
      )
    ).toBe("sophie-lilah-busy-being-in-love");
    expect(normalizeCanonicalTitleForMatch("Bootleg Beatles In Concert")).toBe(
      "bootleg-beatles"
    );
    expect(
      normalizeCanonicalTitleForMatch("THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY")
    ).toBe("the-bird-sweet-16-carpark-party");
  });

  it("matches conservative canonical title variants without collapsing distinct events", () => {
    expect(
      areCanonicalTitlesCompatible("Bootleg Beatles In Concert", "Bootleg Beatles")
    ).toBe(true);
    expect(
      areCanonicalTitlesCompatible(
        "Sophie Lilah 'Busy Being in Love' Album Launch",
        "Sophie Lilah Busy Being in Love"
      )
    ).toBe(true);
    expect(
      areCanonicalTitlesCompatible(
        "THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY",
        "Sweet 16 Carpark Party"
      )
    ).toBe(true);
    expect(areCanonicalTitlesCompatible("Late Show", "Rosemount Late Show")).toBe(
      false
    );
    expect(
      areCanonicalTitlesCompatible(
        "Christmas in the Quad 2026",
        "Christmas in the Quad Choir"
      )
    ).toBe(false);
  });

  it("canonicalizes known venue labels before storing them", () => {
    expect(normalizeVenueName("Clancy's Fish Pub | Freemantle")).toBe("Clancy's Fish Pub");
    expect(normalizeVenueName("Clancy's Fish Pub | Fremantle")).toBe("Clancy's Fish Pub");
    expect(normalizeVenueName("Four5Nine Bar")).toBe("Four5Nine Bar @ Rosemount");
    expect(normalizeVenueName("Seasonal Brewing Co")).toBe("The Seasonal Brewing Co");
    expect(normalizeVenueName("The Seasonal Brewing Co.")).toBe("The Seasonal Brewing Co");
    expect(normalizeVenueName("The Court Hotel")).toBe("The Court");
    expect(normalizeVenueName("Old Habits")).toBe("Old Habits Neighbourhood Bar");
    expect(normalizeVenueName("Music on Murray st")).toBe("Music on Murray St");
    expect(normalizeVenueName("North Freo Bowlo // Hilton Park Bowling Club")).toBe(
      "North Freo Bowlo"
    );
    expect(
      normalizeVenueName("Stan Perron WA Treasures | Hackett Hall, WA Museum Boola Bardip")
    ).toBe("Hackett Hall, WA Museum Boola Bardip");
  });

  it("normalizes known venue suburbs and addresses", () => {
    expect(normalizeVenueSuburb("The Bird", "Northbridge, Perth")).toBe("Northbridge");
    expect(normalizeVenueSuburb("The Rechabite", "Perth")).toBe("Northbridge");
    expect(normalizeVenueSuburb("North Freo Bowlo", "Perth")).toBe("North Fremantle");
    expect(normalizeVenueAddress("The Duke of George", "135 DUKE ST, EAST FREEMANTLE WA 6158")).toBe(
      "135 Duke St, East Fremantle WA 6158"
    );
    expect(normalizeVenueAddress("The Court", "50 Beaufort St")).toBe(
      "50 Beaufort Street, Perth WA 6000"
    );
  });

  it("fills known venue website overrides without inventing generic source URLs", () => {
    expect(normalizeVenueWebsiteUrl("The Seasonal Brewing Co", null)).toBe(
      "https://www.seasonalbrewing.beer/"
    );
    expect(normalizeVenueWebsiteUrl("The Court", null)).toBe("https://thecourt.com.au/");
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
