import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractMilkBarArtists,
  extractMilkBarSearchConfig,
  milkBarSource,
  parseMilkBarDescriptionArtists,
  parseMilkBarHits
} from "../sources/milk-bar";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");

describe("milk bar source adapter", () => {
  it("extracts the embedded Algolia search config from the page", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "milk-bar-page.html"), "utf8");

    expect(extractMilkBarSearchConfig(html)).toEqual({
      appId: "ICGFYQWGTD",
      apiKey: "460c71e35f551b618c0704047b643a26",
      indexName: "prod_australian_venue_co_eventguide",
      venueName: "Milk Bar"
    });
  });

  it("parses live hit shapes into normalized gigs and counts failures", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, "milk-bar-hits.json"), "utf8")
    ) as {
      results: Array<{ hits: unknown[] }>;
    };

    const parsed = parseMilkBarHits(fixture.results[0].hits as never[]);

    expect(parsed.gigs).toHaveLength(2);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.gigs[0]).toMatchObject({
      sourceSlug: "milk-bar",
      externalId: "f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
      title: "TIME",
      imageUrl: null,
      status: "active",
      startsAt: "2026-04-10T11:30:00.000Z",
      startsAtPrecision: "exact",
      artists: ["Time"],
      artistExtractionKind: "structured"
    });
    expect(parsed.gigs[1]).toMatchObject({
      externalId: "319bc90e-b8b5-4d98-b79f-c3317150658b",
      status: "cancelled"
    });
  });

  it("cleans Milk Bar featured prefixes and uppercase ampersand lineups", () => {
    expect(
      extractMilkBarArtists({
        EventName: "THORNS & THUNDER",
        Bands: ["ft. AMMIFY", "UNDENIABLE", "EDGE OF ETERNAL & PEASANT"],
        Performances: []
      })
    ).toEqual({
      artists: ["AMMIFY", "UNDENIABLE", "EDGE OF ETERNAL", "PEASANT"],
      artistExtractionKind: "structured"
    });

    expect(
      extractMilkBarArtists({
        EventName: "AJ Hix Rhythm Six",
        Bands: ["AJ Hix and His Rhythm Six"],
        Performances: []
      })
    ).toEqual({
      artists: ["AJ Hix and His Rhythm Six"],
      artistExtractionKind: "structured"
    });

    expect(
      extractMilkBarArtists({
        EventName: "VELVET GROOVES",
        SpecialGuests: "ft. ADAM LEBRANSKY, BRAINBOUND, COUPLA STUDS, MISTER SISTER & WEST ENVY",
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: [
        "ADAM LEBRANSKY",
        "BRAINBOUND",
        "COUPLA STUDS",
        "MISTER SISTER",
        "WEST ENVY"
      ],
      artistExtractionKind: "explicit_lineup"
    });
  });

  it("does not treat Milk Bar theme labels as artist lineups", () => {
    expect(
      extractMilkBarArtists({
        EventName: "HORNOGRAPHY",
        SpecialGuests: "FRIDAY FRIGHT NIGHT",
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("merges dedicated Milk Bar support fields with structured headliners", () => {
    expect(
      extractMilkBarArtists({
        EventName: "PARK RD",
        Bands: ["PARK RD"],
        Performances: [],
        SpecialGuests: "Navy June + Dolce Blue"
      })
    ).toEqual({
      artists: ["PARK RD", "Navy June", "Dolce Blue"],
      artistExtractionKind: "structured"
    });

    expect(
      extractMilkBarArtists({
        EventName: "The Volcanics album launch",
        Bands: ["The Volcanics"],
        Performances: [],
        SpecialGuests: "with Legs Electric, The Pretty Skints & Simon/Gus (Never Never)"
      })
    ).toEqual({
      artists: [
        "The Volcanics",
        "Legs Electric",
        "The Pretty Skints",
        "Simon/Gus (Never Never)"
      ],
      artistExtractionKind: "structured"
    });

    expect(
      extractMilkBarArtists({
        EventName: "Some Like It Yacht: A Spring Soirée",
        Bands: ["Some Like It Yacht"],
        Performances: [],
        SpecialGuests: "with special guests Simone and Girlfunkle"
      })
    ).toEqual({
      artists: ["Some Like It Yacht", "Simone and Girlfunkle"],
      artistExtractionKind: "structured"
    });
  });

  it("uses exact Milk Bar title spelling and removes standalone stage notes", () => {
    expect(
      extractMilkBarArtists({
        EventName: "The Tin Roof Jazz Band",
        Bands: ["Tin Roof Jazz Band"],
        Performances: []
      }).artists
    ).toEqual(["The Tin Roof Jazz Band"]);
    expect(
      extractMilkBarArtists({
        EventName: "Black Swan Jazz Band",
        Bands: ["Black Swan"],
        Performances: []
      }).artists
    ).toEqual(["Black Swan Jazz Band"]);
    expect(
      extractMilkBarArtists({
        EventName: "BREAKNBREADS PRESENTS: WESTCOAST",
        Bands: [],
        Performances: [],
        SpecialGuests: "(PERTH DEBUT)"
      })
    ).toEqual({ artists: [], artistExtractionKind: "unknown" });
  });

  it("extracts only explicit Milk Bar performer credits from descriptions", () => {
    expect(
      parseMilkBarDescriptionArtists(`
        <p>Headlining the card is a special compliment battle between two heavy hitters, Greeley vs Cortex, flipping the format.</p>
        <p>Also on the lineup, expect fire in the main battles as Charisma ATL takes on Smithy, alongside more matchups.</p>
      `)
    ).toEqual(["Greeley", "Cortex", "Charisma ATL", "Smithy"]);
    expect(
      parseMilkBarDescriptionArtists(
        '<p>Starring the inimitable Mya Tension and the effervescent Dr Jae West!</p>'
      )
    ).toEqual(["Mya Tension", "Dr Jae West"]);
    expect(
      parseMilkBarDescriptionArtists(
        "Come hear a band pay tribute, featuring internationally renowned lead vocalist Lisa Woodbrook."
      )
    ).toEqual(["Lisa Woodbrook"]);
    expect(
      parseMilkBarDescriptionArtists(`
        <p>?? <strong>Sons of Beaches</strong> – bringing the classics to life</p>
        <p>?? <strong>Shaved and Dangerous</strong> – delivering high-energy rock</p>
        <p>?? <strong>Essential Oils</strong> – recreating powerful anthems</p>
      `)
    ).toEqual(["Sons of Beaches", "Shaved and Dangerous", "Essential Oils"]);
  });

  it("prefers explicit Milk Bar performer credits over show and tribute labels", () => {
    expect(
      extractMilkBarArtists({
        EventName: "THE AMY WINEHOUSE SONGBOOK",
        EventDescription:
          "A band pays tribute to Amy Winehouse, featuring internationally renowned lead vocalist Lisa Woodbrook.",
        Bands: ["The Amy Winehouse Songbook"]
      })
    ).toEqual({
      artists: ["Lisa Woodbrook"],
      artistExtractionKind: "explicit_lineup"
    });
  });

  it("dedupes ticket-status title variants for the same event day", () => {
    const baseHit = {
      SpecialGuests: "",
      EventDescription: "A tribute to our Starman.",
      DateStart: "2026-07-19T11:30:00",
      EventUrl: "https://tickets.avclive.com.au/outlet/event/cosmic-jive",
      Bands: ["A Tribute To Our Starman"],
      Performances: [],
      Venue: {
        Name: "Milk Bar",
        Address: "981 Beaufort Street",
        Locality: "Inglewood",
        WebsiteUrl: "milkbarperth.com.au"
      }
    };

    const parsed = parseMilkBarHits([
      {
        ...baseHit,
        EventGuid: "cosmic-jive-sold-out",
        EventName: "Cosmic Jive! SOLD OUT"
      },
      {
        ...baseHit,
        EventGuid: "cosmic-jive",
        EventName: "Cosmic Jive!"
      }
    ] as never[]);

    expect(parsed.failedCount).toBe(0);
    expect(parsed.gigs).toHaveLength(1);
    expect(parsed.gigs[0]).toMatchObject({
      externalId: "cosmic-jive",
      title: "Cosmic Jive!",
      artists: ["A Tribute To Our Starman"]
    });
  });

  it("keeps unrelated same-day Milk Bar events separate", () => {
    const baseHit = {
      SpecialGuests: "",
      EventDescription: "",
      DateStart: "2026-07-19T11:30:00",
      EventUrl: "https://tickets.avclive.com.au/outlet/event/milk-bar",
      Bands: [],
      Performances: [],
      Venue: {
        Name: "Milk Bar",
        Address: "981 Beaufort Street",
        Locality: "Inglewood",
        WebsiteUrl: "milkbarperth.com.au"
      }
    };

    const parsed = parseMilkBarHits([
      {
        ...baseHit,
        EventGuid: "cosmic-jive",
        EventName: "Cosmic Jive!"
      },
      {
        ...baseHit,
        EventGuid: "jazz-party",
        EventName: "Jazz Party"
      }
    ] as never[]);

    expect(parsed.failedCount).toBe(0);
    expect(parsed.gigs.map((gig) => gig.title)).toEqual([
      "Cosmic Jive!",
      "Jazz Party"
    ]);
  });

  it("fetches the page and the event API without requiring a browser", async () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "milk-bar-page.html"), "utf8");
    const responseBody = readFileSync(
      resolve(FIXTURE_DIR, "milk-bar-hits.json"),
      "utf8"
    );

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(html, { status: 200, headers: { "content-type": "text/html" } })
      )
      .mockResolvedValueOnce(
        new Response(responseBody, {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const result = await milkBarSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(2);
    expect(result.failedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
