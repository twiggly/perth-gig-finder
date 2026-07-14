import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractOztixArtists,
  isMusicGigHit,
  isPerthMetroHit,
  normalizeOztixHit,
  oztixWaSource,
  parseOztixDescriptionArtists,
  parseOztixSpecialGuests,
  parseOztixTitleHeadlinerArtists,
  parseOztixHits,
  parseOztixTitleFeaturedArtists,
  parseOztixTitleLineupArtists,
  parseOztixTitlePresentedArtists,
  parseOztixTitleTrailingWithArtists
} from "../sources/oztix-wa";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");


describe("oztix wa normalization", () => {
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

  it("canonicalizes audited Oztix venue labels before storing gigs", () => {
    const courtGig = normalizeOztixHit({
      EventGuid: "the-court",
      EventName: "Rave & Brunch",
      DateStart: "2026-06-21T12:00:00",
      EventUrl: "https://tickets.oztix.com.au/outlet/event/the-court",
      Categories: ["Music"],
      _geoloc: { lat: -31.9523, lng: 115.8613 },
      Venue: {
        Name: "The Court Hotel",
        Locality: "Perth",
        Address: "50 Beaufort St"
      },
      Bands: ["Rave & Brunch"]
    });
    const bowloGig = normalizeOztixHit({
      EventGuid: "north-freo-bowlo",
      EventName: "Hidden Treasures 2026",
      DateStart: "2026-06-11T18:00:00",
      EventUrl: "https://tickets.oztix.com.au/outlet/event/north-freo-bowlo",
      Categories: ["Music"],
      _geoloc: { lat: -32.0332, lng: 115.7517 },
      Venue: {
        Name: "North Freo Bowlo // Hilton Park Bowling Club",
        Locality: "Perth",
        Address: "Check Venue Address"
      },
      Bands: ["Hidden Treasures"]
    });

    expect(courtGig.venue).toMatchObject({
      name: "The Court",
      slug: "the-court",
      address: "50 Beaufort Street, Perth WA 6000",
      websiteUrl: "https://thecourt.com.au/"
    });
    expect(bowloGig.venue).toMatchObject({
      name: "North Freo Bowlo",
      slug: "north-freo-bowlo",
      suburb: "North Fremantle",
      address: "8 Thompson Road, North Fremantle WA 6159"
    });
  });

});
