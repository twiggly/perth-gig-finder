import { describe, expect, it, vi } from "vitest";

import {
  extractRosemountSearchConfig,
  normalizeRosemountHit,
  parseRosemountHits,
  rosemountHotelSource
} from "../sources/rosemount-hotel";
import { sources } from "../sources";
import type { OztixHit } from "../sources/oztix-wa";

function createRosemountHit(overrides: Partial<OztixHit> = {}): OztixHit {
  return {
    EventGuid: "94c0beb1-0bf5-48e7-ad54-bafbf5d9c9a0",
    EventName: "GYROSCOPE 'My Broken Spine' Tour 2026",
    SpecialGuests: "With Special Guests: TBA",
    EventDescription: "<p>Gyroscope return to Rosemount Hotel.</p>",
    EventImage1:
      "https://assets.oztix.com.au/image/33e03ed3-1e8f-4ff7-81e0-44b847f8f861.png?width=600&height=300",
    HomepageImage:
      "https://assets.oztix.com.au/image/aecdb80e-2faa-4f5f-852c-091de230dd78.png?width=360",
    DateStart: "2026-04-25T12:00:00",
    DateEnd: null,
    EventUrl:
      "https://rosemounthotel.oztix.com.au/outlet/event/94c0beb1-0bf5-48e7-ad54-bafbf5d9c9a0?utm_source=RosemountHotel&utm_medium=Website",
    Categories: ["Rock", "Australian Artists"],
    Venue: {
      Name: "Rosemount Hotel",
      Address: "459 Fitzgerald Street (cnr Angove Street)",
      Locality: "North Perth",
      State: "WA",
      WebsiteUrl: "https://www.rosemounthotel.com.au",
      Timezone: "Australia/Perth"
    },
    Bands: ["GYROSCOPE"],
    Performances: [{ Name: "GYROSCOPE" }],
    TourName: null,
    IsCancelled: false,
    IsPostponed: false,
    IsRescheduled: false,
    AffectedBy: null,
    HasEventDatePassed: false,
    ...overrides
  };
}

describe("rosemount hotel source adapter", () => {
  it("extracts the embedded Algolia search config from the official page", () => {
    expect(
      extractRosemountSearchConfig(`
        <script>
          var search = instantsearch({
            appId: 'ICGFYQWGTD',
            apiKey: '1c27da73a7d124b7d6d6315670c87e58',
            indexName: 'prod_rosemounthotel_eventguide'
          });
        </script>
      `)
    ).toEqual({
      appId: "ICGFYQWGTD",
      apiKey: "1c27da73a7d124b7d6d6315670c87e58",
      indexName: "prod_rosemounthotel_eventguide"
    });
  });

  it("normalizes a Rosemount main-room music hit", () => {
    const normalized = normalizeRosemountHit(createRosemountHit());

    expect(normalized).toMatchObject({
      sourceSlug: "rosemount-hotel",
      externalId: "94c0beb1-0bf5-48e7-ad54-bafbf5d9c9a0",
      sourceUrl:
        "https://rosemounthotel.oztix.com.au/outlet/event/94c0beb1-0bf5-48e7-ad54-bafbf5d9c9a0",
      ticketUrl:
        "https://rosemounthotel.oztix.com.au/outlet/event/94c0beb1-0bf5-48e7-ad54-bafbf5d9c9a0",
      title: "GYROSCOPE 'My Broken Spine' Tour 2026",
      description: "With Special Guests: TBA Gyroscope return to Rosemount Hotel.",
      imageUrl:
        "https://assets.oztix.com.au/image/33e03ed3-1e8f-4ff7-81e0-44b847f8f861.png",
      startsAt: "2026-04-25T12:00:00.000Z",
      startsAtPrecision: "exact",
      endsAt: null,
      venue: {
        name: "Rosemount Hotel",
        slug: "rosemount-hotel",
        suburb: "North Perth",
        address: "459 Fitzgerald Street (cnr Angove Street)",
        websiteUrl: "https://www.rosemounthotel.com.au/"
      },
      artists: ["GYROSCOPE"],
      artistExtractionKind: "structured",
      status: "active"
    });
  });

  it("normalizes Four5Nine as the canonical Rosemount side-room venue", () => {
    const normalized = normalizeRosemountHit(
      createRosemountHit({
        EventGuid: "c23f0a7f-6ec3-4e96-88e7-90e0e6734c16",
        EventName: "The Kid fez supported by GR33DY GR33N & Lill Miss JoJo",
        SpecialGuests: "The Kid Fez, GR33DY GR33N, Lill Miss JoJo",
        Categories: ["Hip Hop", "Rap"],
        Venue: {
          Name: "Four5Nine Bar",
          Address: "Rosemount Hotel, 459 Fitzgerald St",
          Locality: "North Perth",
          State: "WA",
          WebsiteUrl: "https://www.rosemounthotel.com.au",
          Timezone: "Australia/Perth"
        },
        Bands: ["The Kid Fez", "GR33DY GR33N", "Lill Miss JoJo"],
        Performances: [
          { Name: "The Kid Fez" },
          { Name: "GR33DY GR33N" },
          { Name: "Lill Miss JoJo" }
        ]
      })
    );

    expect(normalized.venue).toMatchObject({
      name: "Four5Nine Bar @ Rosemount",
      slug: "four5nine-bar-rosemount",
      websiteUrl: "https://www.rosemounthotel.com.au/"
    });
    expect(normalized.artists).toEqual([
      "The Kid Fez",
      "GR33DY GR33N",
      "Lill Miss JoJo"
    ]);
  });

  it("skips non-music, past, and off-venue rows while counting malformed music rows", () => {
    const parsed = parseRosemountHits([
      createRosemountHit({
        EventGuid: "poetry",
        EventName: "PERTH SLAM - APRIL 2026",
        Categories: ["Poetry / Spoken Word"],
        Bands: [],
        Performances: [],
        SpecialGuests: ""
      }),
      createRosemountHit({
        EventGuid: "past",
        HasEventDatePassed: true
      }),
      createRosemountHit({
        EventGuid: "wrong-venue",
        Venue: {
          Name: "Magnet House",
          Locality: "Perth",
          State: "WA"
        }
      }),
      createRosemountHit({
        EventGuid: "malformed",
        DateStart: "not-a-date"
      }),
      createRosemountHit({
        EventGuid: "valid",
        EventName: "Rock Wax Thursdays - Celebrating 50 Years of AC/DC's High Voltage",
        Categories: ["DJ"],
        Bands: [],
        Performances: [],
        SpecialGuests: "with DJ SWEETMAN"
      })
    ]);

    expect(parsed.gigs).toHaveLength(1);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.gigs[0]?.title).toBe(
      "Rock Wax Thursdays - Celebrating 50 Years of AC/DC's High Voltage"
    );
    expect(parsed.gigs[0]?.artists).toEqual(["DJ SWEETMAN"]);
  });

  it("fetches the official page and Algolia feed without browser automation", async () => {
    const html = `
      <script>
        var search = instantsearch({
          appId: 'ICGFYQWGTD',
          apiKey: '1c27da73a7d124b7d6d6315670c87e58',
          indexName: 'prod_rosemounthotel_eventguide'
        });
      </script>
    `;
    const algoliaBody = JSON.stringify({
      results: [
        {
          hits: [createRosemountHit()]
        }
      ]
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" }
        })
      )
      .mockResolvedValueOnce(
        new Response(algoliaBody, {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const result = await rosemountHotelSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(1);
    expect(result.failedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://ICGFYQWGTD-dsn.algolia.net/1/indexes/*/queries"
    );
  });

  it("is registered as an official public source", () => {
    expect(sources.map((source) => source.slug)).toContain("rosemount-hotel");
    expect(rosemountHotelSource).toMatchObject({
      name: "Rosemount Hotel",
      priority: 100,
      isPublicListingSource: true
    });
  });
});
