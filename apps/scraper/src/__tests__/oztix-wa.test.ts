import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  isMusicGigHit,
  isPerthMetroHit,
  normalizeOztixHit,
  oztixWaSource,
  parseOztixHits
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
      artists: ["Doctor Jazz"]
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
