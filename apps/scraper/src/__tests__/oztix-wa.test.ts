import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractOztixArtists,
  isMusicGigHit,
  isPerthMetroHit,
  normalizeOztixHit,
  oztixWaSource,
  parseOztixSpecialGuests,
  parseOztixTitleHeadlinerArtists,
  parseOztixHits,
  parseOztixTitleFeaturedArtists,
  parseOztixTitlePresentedArtists
} from "../sources/oztix-wa";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");

describe("oztix wa source adapter", () => {
  it("accepts Perth-metro coordinates and rejects regional coordinates", () => {
    expect(
      isPerthMetroHit({ _geoloc: { lat: -31.9523, lng: 115.8613 } })
    ).toBe(true);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -31.930763244629, lng: 115.85925292969 } })
    ).toBe(true);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -32.0569, lng: 115.7439 } })
    ).toBe(true);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -31.7444, lng: 115.7664 } })
    ).toBe(true);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -31.917430877686, lng: 115.89052581787 } })
    ).toBe(true);

    expect(
      isPerthMetroHit({ _geoloc: { lat: -32.24063873291, lng: 115.81484985352 } })
    ).toBe(false);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -32.2835, lng: 115.7294 } })
    ).toBe(false);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -33.67995071411, lng: 115.23331451416 } })
    ).toBe(false);
    expect(
      isPerthMetroHit({ _geoloc: { lat: -33.955, lng: 115.075 } })
    ).toBe(false);
    expect(isPerthMetroHit({})).toBe(false);
  });

  it("keeps music gigs and rejects obvious non-music event types", () => {
    expect(
      isMusicGigHit({
        EventName: "Doctor Jazz",
        Categories: ["Music"],
        Bands: ["Doctor Jazz"]
      })
    ).toBe(true);
    expect(
      isMusicGigHit({
        EventName: "TIGHTARSE TUESDAY",
        Categories: ["Dance", "Electronic", "House", "Techno"]
      })
    ).toBe(true);
    expect(
      isMusicGigHit({
        EventName: "Sugar Blue Burlesque Fresh Faced Follies Academy Grad Show",
        Categories: ["Cabaret", "Burlesque"],
        Bands: ["Fresh Faced Follies", "Sugar Blue Burlesque"]
      })
    ).toBe(false);
    expect(
      isMusicGigHit({
        EventName: "The Quizzical Mr Jeff",
        Categories: ["Arts", "Attractions", "Comedy"]
      })
    ).toBe(false);
    expect(
      isMusicGigHit({
        EventName: "Venue Membership 2026",
        Categories: ["Membership"]
      })
    ).toBe(false);
    expect(
      isMusicGigHit({
        EventName: "Let's Make Cheese! Traditional Italian Cheesemaking Class",
        Categories: ["Food and Wine"],
        SpecialGuests: "Galleria Burrata",
        EventDescription:
          "Join us for a special hands-on cheesemaking class. Materials and ingredients provided."
      })
    ).toBe(false);
    expect(
      isMusicGigHit({
        EventName: "Pro Takes 03 - Introduction to Music Production",
        Categories: ["Music", "Educational", "Workshop", "Professional Development"],
        SpecialGuests: "Panelists: Bec Price (Project BEXX) & Reece Lenzo"
      })
    ).toBe(false);
    expect(
      isMusicGigHit({
        EventName: "Social Saturdays DJs + $2 Oysters",
        Categories: ["Food", "Beer", "DJ", "Free Event"],
        EventDescription:
          "Rosemount Hotel & RTRFM present Social Saturdays with DJs every Saturday."
      })
    ).toBe(true);
    expect(
      isMusicGigHit({
        EventName: "Rave & Brunch",
        Categories: ["House", "Rave / Trance", "DJ"],
        EventDescription: "3 DJs, 2 MCs, dancers and immersive moments."
      })
    ).toBe(true);
  });

  it("prefers the fuller payload image candidate and falls back when needed", () => {
    expect(
      normalizeOztixHit({
        EventGuid: "doctor-jazz",
        EventName: "Doctor Jazz",
        HomepageImage: "https://assets.oztix.com.au/image/homepage.png?width=360&height=180",
        EventImage1: "https://assets.oztix.com.au/image/event.png?width=600&height=300",
        DateStart: "2026-04-07T10:30:00",
        EventUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz",
        Categories: ["Music"],
        _geoloc: { lat: -31.9523, lng: 115.8613 },
        Venue: {
          Name: "Milk Bar",
          Locality: "Inglewood",
          Address: "981 Beaufort Street",
          WebsiteUrl: "https://milkbarperth.com.au"
        },
        Bands: ["Doctor Jazz"]
      }).imageUrl
    ).toBe("https://assets.oztix.com.au/image/event.png");

    expect(
      normalizeOztixHit({
        EventGuid: "tightarse",
        EventName: "TIGHTARSE TUESDAY",
        EventImage1: "https://assets.oztix.com.au/image/event.png?width=600&height=300",
        DateStart: "2026-04-09T12:00:00",
        EventUrl: "https://tickets.oztix.com.au/outlet/event/tightarse",
        Categories: ["Dance", "Electronic", "House"],
        _geoloc: { lat: -31.9523, lng: 115.8613 },
        Venue: {
          Name: "Milk Bar",
          Locality: "Inglewood",
          Address: "981 Beaufort Street",
          WebsiteUrl: "https://milkbarperth.com.au"
        }
      }).imageUrl
    ).toBe("https://assets.oztix.com.au/image/event.png");
  });

  it("uses real venue website overrides instead of falling back to Oztix", () => {
    expect(
      normalizeOztixHit({
        EventGuid: "rosemount-show",
        EventName: "The Horrors",
        DateStart: "2026-04-18T12:00:00",
        EventUrl: "https://tickets.oztix.com.au/outlet/event/the-horrors",
        Categories: ["Music"],
        _geoloc: { lat: -31.9307, lng: 115.8711 },
        Venue: {
          Name: "Rosemount Hotel",
          Locality: "North Perth",
          Address: "459 Fitzgerald Street"
        }
      }).venue.websiteUrl
    ).toBe("https://www.rosemounthotel.com.au/");

    expect(
      normalizeOztixHit({
        EventGuid: "unknown-venue-show",
        EventName: "Unknown Venue Gig",
        DateStart: "2026-04-18T12:00:00",
        EventUrl: "https://tickets.oztix.com.au/outlet/event/unknown",
        Categories: ["Music"],
        _geoloc: { lat: -31.9523, lng: 115.8613 },
        Venue: {
          Name: "Mystery Room",
          Locality: "Perth",
          Address: "123 Example Street"
        }
      }).venue.websiteUrl
    ).toBeNull();
  });

  it("canonicalizes renamed venue labels before storing Oztix gigs", () => {
    const gig = normalizeOztixHit({
      EventGuid: "clancys-fish-pub",
      EventName: "Late Night Set",
      DateStart: "2026-04-09T19:30:00",
      EventUrl: "https://tickets.oztix.com.au/outlet/event/clancys-fish-pub",
      Categories: ["Music"],
      _geoloc: { lat: -31.9523, lng: 115.8613 },
      Venue: {
        Name: "Clancy's Fish Pub | Freemantle",
        Locality: "City Beach",
        Address: "195 Challenger Parade",
        WebsiteUrl: "https://www.clancysfishpub.com.au"
      },
      Bands: ["Late Night Set"]
    });

    expect(gig.venue).toMatchObject({
      name: "Clancy's Fish Pub",
      slug: "clancys-fish-pub",
      suburb: "City Beach"
    });
  });

  it("parses special guest lineups from Oztix guest text", () => {
    expect(
      parseOztixSpecialGuests(
        'starring VOODOO PEOPLE - RENEGADES OF ROCK - THE BROWN STUDY BAND - SCAR TISSUE'
      )
    ).toEqual([
      "VOODOO PEOPLE",
      "RENEGADES OF ROCK",
      "THE BROWN STUDY BAND",
      "SCAR TISSUE"
    ]);

    expect(
      parseOztixSpecialGuests(
        "with special guests, The Aquabats! and The Suicide Machines"
      )
    ).toEqual(["The Aquabats!", "The Suicide Machines"]);

    expect(parseOztixSpecialGuests("With BLESSTHEFALL")).toEqual(["BLESSTHEFALL"]);
    expect(parseOztixSpecialGuests("with DJ SWEETMAN")).toEqual(["DJ SWEETMAN"]);
    expect(parseOztixSpecialGuests("w/ Saving Face")).toEqual(["Saving Face"]);
    expect(parseOztixSpecialGuests("w/Saving Face")).toEqual(["Saving Face"]);
    expect(parseOztixSpecialGuests("with a special guest to be announced")).toEqual([]);
    expect(parseOztixSpecialGuests("special guest to be announced")).toEqual([]);
    expect(parseOztixSpecialGuests("guest TBA")).toEqual([]);
    expect(parseOztixSpecialGuests("Supports to be announced")).toEqual([]);
    expect(parseOztixSpecialGuests("support acts TBA")).toEqual([]);
    expect(parseOztixSpecialGuests("Local Supports TBA")).toEqual([]);
    expect(parseOztixSpecialGuests("Secret Act")).toEqual([]);
    expect(parseOztixSpecialGuests("Mystery Guest")).toEqual([]);
    expect(parseOztixSpecialGuests("MORE!")).toEqual([]);

    expect(
      parseOztixSpecialGuests(
        "With Beddy Rays, Teenage Joans, Daily J, Bootleg Rascal, Secret Act, Vlads + MORE!"
      )
    ).toEqual(["Beddy Rays", "Teenage Joans", "Daily J", "Bootleg Rascal", "Vlads"]);

    expect(
      parseOztixSpecialGuests("OBSCURA (GER) FALLUJAH (USA)^ ASHEN (WA) + ANOXIA (NSW)")
    ).toEqual(["OBSCURA (GER)", "FALLUJAH (USA)", "ASHEN (WA)", "ANOXIA (NSW)"]);

    expect(parseOztixSpecialGuests("with guests TBC")).toEqual([]);
    expect(parseOztixSpecialGuests("plus special guests")).toEqual([]);
    expect(parseOztixSpecialGuests("more TBC")).toEqual([]);
    expect(
      parseOztixSpecialGuests("Everything Around You Tour with Special Guest Codee-lee")
    ).toEqual(["Codee-lee"]);
    expect(parseOztixSpecialGuests("Neil Fernandes • Greg Dear • Perth Folk")).toEqual([
      "Neil Fernandes",
      "Greg Dear",
      "Perth Folk"
    ]);
  });

  it("uses parsed special guests when Oztix has no structured artist arrays", () => {
    expect(
      extractOztixArtists({
        EventName: "FREOPALOOZA",
        SpecialGuests:
          'starring VOODOO PEOPLE - RENEGADES OF ROCK - THE BROWN STUDY BAND - SCAR TISSUE',
        Bands: [],
        Performances: []
      })
    ).toEqual({
      artists: [
        "VOODOO PEOPLE",
        "RENEGADES OF ROCK",
        "THE BROWN STUDY BAND",
        "SCAR TISSUE"
      ],
      artistExtractionKind: "parsed_text"
    });
  });

  it("adds parsed support acts to structured Oztix headliners", () => {
    expect(
      extractOztixArtists({
        EventName: "Less Than Jake - 'Circus Down Under' Tour",
        Bands: ["Less Than Jake"],
        Performances: [{ Name: "Less Than Jake" }],
        SpecialGuests: "with special guests, The Aquabats! and The Suicide Machines"
      })
    ).toEqual({
      artists: ["Less Than Jake", "The Aquabats!", "The Suicide Machines"],
      artistExtractionKind: "structured"
    });

    expect(
      extractOztixArtists({
        EventName: "Felicity Urquhart & Josh Cunningham",
        Bands: ["Felicity Urquhart", "Josh Cunningham"],
        Performances: [
          { Name: "Felicity Urquhart" },
          { Name: "Josh Cunningham" }
        ],
        SpecialGuests: "Everything Around You Tour with Special Guest Codee-lee"
      })
    ).toEqual({
      artists: ["Felicity Urquhart", "Josh Cunningham", "Codee-lee"],
      artistExtractionKind: "structured"
    });
  });

  it("cleans parsed support prefixes without dropping structured headliners", () => {
    expect(
      extractOztixArtists({
        EventName: "Sienna Skies \"Australian Spring Tour\"",
        Bands: ["Sienna Skies"],
        Performances: [{ Name: "Sienna Skies" }],
        SpecialGuests: "w/ Saving Face"
      })
    ).toEqual({
      artists: ["Sienna Skies", "Saving Face"],
      artistExtractionKind: "structured"
    });
  });

  it("parses narrow quoted-tour title headliners when Oztix omits structured artists", () => {
    expect(
      parseOztixTitleHeadlinerArtists('Sienna Skies "Australian Spring Tour"')
    ).toEqual(["Sienna Skies"]);
    expect(
      parseOztixTitleHeadlinerArtists(
        "Rock Wax Thursdays - 60 Years of Bob Dylan's 'Blonde on Blonde'"
      )
    ).toEqual([]);

    expect(
      extractOztixArtists({
        EventName: 'Sienna Skies "Australian Spring Tour"',
        Bands: [],
        Performances: [],
        SpecialGuests: "w/ Saving Face + Local Supports TBA"
      })
    ).toEqual({
      artists: ["Sienna Skies", "Saving Face"],
      artistExtractionKind: "parsed_text"
    });

    expect(
      extractOztixArtists({
        EventName: "Tim Schilperoort - Maybe - Single Launch",
        Bands: ["Tim Schilperoort"],
        Performances: [{ Name: "Tim Schilperoort" }],
        SpecialGuests: "with special guests Anika Louise + more TBC"
      })
    ).toEqual({
      artists: ["Tim Schilperoort", "Anika Louise"],
      artistExtractionKind: "structured"
    });
  });

  it("parses explicit featured performers from Oztix titles", () => {
    expect(parseOztixTitleFeaturedArtists("Tribute Night ft. Lindsay Wells")).toEqual([
      "Lindsay Wells"
    ]);
    expect(parseOztixTitleFeaturedArtists("Tribute Night feat. Lindsay Wells")).toEqual([
      "Lindsay Wells"
    ]);
    expect(parseOztixTitleFeaturedArtists("Tribute Night featuring Lindsay Wells")).toEqual([
      "Lindsay Wells"
    ]);
  });

  it("parses narrow colon presents titles as the presented artist", () => {
    expect(
      parseOztixTitlePresentedArtists("The gRaveyard Presents: Ruby Rising")
    ).toEqual(["Ruby Rising"]);
    expect(
      parseOztixTitlePresentedArtists("Glam Funk Band presents Ministry of Disco")
    ).toEqual([]);

    expect(
      extractOztixArtists({
        EventName: "The gRaveyard Presents: Ruby Rising",
        Bands: [],
        Performances: [],
        SpecialGuests: ""
      })
    ).toEqual({
      artists: ["Ruby Rising"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("drops tribute subjects when an Oztix title names the real featured performer", () => {
    expect(
      extractOztixArtists({
        EventName: "Jimi Hendrix The Australian Tribute ft. Lindsay Wells",
        Bands: ["Jimi Hendrix"],
        Performances: [{ Name: "Jimi Hendrix" }],
        SpecialGuests: "with a special guest to be announced"
      })
    ).toEqual({
      artists: ["Lindsay Wells"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("splits Oztix bullet-delimited structured artist strings", () => {
    expect(
      extractOztixArtists({
        EventName: "VOICES OF HOUSE - PERTH",
        Bands: [
          "Darren Bouthier • Chappers • Mitchell James Plus the electric energy of Creo Saxman with Percussion by CoCo & The VOH Dancers"
        ],
        Performances: []
      })
    ).toEqual({
      artists: [
        "Darren Bouthier",
        "Chappers",
        "Mitchell James",
        "Creo Saxman",
        "CoCo & The VOH Dancers"
      ],
      artistExtractionKind: "structured"
    });
  });

  it("keeps tribute performers and drops slash-separated tribute subjects", () => {
    expect(
      extractOztixArtists({
        EventName: "Rammstein / Slipknot / Marilyn Manson Tribute Night",
        Bands: [
          "Marilyn Manson",
          "performed by The Beautiful People / Slipknot",
          "performed by The Maggots / Rammstein",
          "performed by Rated R"
        ],
        Performances: []
      })
    ).toEqual({
      artists: ["The Beautiful People", "The Maggots", "Rated R"],
      artistExtractionKind: "structured"
    });
  });

  it("drops tribute support-set descriptions without dropping the named performer", () => {
    expect(
      extractOztixArtists({
        EventName: "LANDSLIDE - Fleetwood Mac and Stevie Nicks Tribute Show",
        Bands: ["LandSlide", "support set of EAGLES GREATEST HITS"],
        Performances: []
      })
    ).toEqual({
      artists: ["LandSlide"],
      artistExtractionKind: "structured"
    });
  });

  it("removes broken emoji question-mark runs from Oztix titles and avoids theme-party subjects as artists", () => {
    const normalized = normalizeOztixHit({
      EventGuid: "sleep-token-party",
      EventName:
        "????SLEEP TOKEN vs BAD OMENS: WORSHIP PARTY???? + HLH/DOD AFTER PARTY - PERTH",
      DateStart: "2026-04-26T12:00:00",
      EventUrl: "https://tickets.oztix.com.au/outlet/event/sleep-token-party",
      Categories: ["Music"],
      _geoloc: { lat: -31.9523, lng: 115.8613 },
      Venue: {
        Name: "Amplifier Bar",
        Locality: "Perth"
      },
      Bands: [
        "DJs playing the best of Sleep Token",
        "Bad Omens",
        "the greatest emo",
        "metalcore",
        "alternative tracks of all time ALL. NIGHT. LONG",
        "HLH/DOD after party!"
      ]
    });

    expect(normalized.title).toBe(
      "SLEEP TOKEN vs BAD OMENS: WORSHIP PARTY + HLH/DOD AFTER PARTY - PERTH"
    );
    expect(normalized.artists).toEqual([]);
    expect(normalized.artistExtractionKind).toBe("unknown");
  });

  it("parses WA hits into normalized gigs, skips non-gig events, and counts failures", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, "oztix-wa-hits.json"), "utf8")
    ) as {
      results: Array<{ hits: unknown[] }>;
    };

    const parsed = parseOztixHits(fixture.results[0].hits as never[]);

    expect(parsed.gigs).toHaveLength(3);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.gigs[0]).toMatchObject({
      sourceSlug: "oztix-wa",
      externalId: "3d742027-9b7e-4a45-9fcf-08888b3cbc93",
      title: "Doctor Jazz",
      imageUrl: null,
      status: "active",
      startsAt: "2026-04-07T10:30:00.000Z",
      startsAtPrecision: "exact",
      artists: ["Doctor Jazz"],
      artistExtractionKind: "structured"
    });
    expect(parsed.gigs[1]).toMatchObject({
      title: "TIGHTARSE TUESDAY: TRAFFIC LIGHT PARTY?? ?? ??",
      status: "active"
    });
    expect(parsed.gigs[2]).toMatchObject({
      externalId: "319bc90e-b8b5-4d98-b79f-c3317150658b",
      status: "cancelled"
    });
    expect(parsed.gigs.some((gig) => gig.title === "The Quizzical Mr Jeff")).toBe(false);
    expect(
      parsed.gigs.some(
        (gig) => gig.title === "Sugar Blue Burlesque Fresh Faced Follies Academy Grad Show"
      )
    ).toBe(false);
  });

  it("fetches the public Algolia event index without requiring a browser", async () => {
    const responseBody = readFileSync(
      resolve(FIXTURE_DIR, "oztix-wa-hits.json"),
      "utf8"
    );

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(responseBody, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await oztixWaSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(3);
    expect(result.failedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
