import { describe, expect, it, vi } from "vitest";

import {
  normalizeTicketmasterEvent,
  ticketmasterAuSource
} from "../sources/ticketmaster-au";

function buildTicketmasterCityEvent(input: {
  id: string;
  url: string;
  title: string;
  startDate: string;
  endDate?: string;
  venueName: string;
  locality: string;
  venueUrl?: string;
  streetAddress?: string;
  postalCode?: string;
  performers?: string[];
  partnerEvent?: boolean;
  isPartner?: boolean;
  cancelled?: boolean;
  postponed?: boolean;
  rescheduled?: boolean;
  venueImageUrl?: string;
  artistImageUrl?: string;
}) {
  return {
    title: input.title,
    id: input.id,
    discoveryId: `discovery-${input.id}`,
    dates: {
      startDate: input.startDate,
      ...(input.endDate ? { endDate: input.endDate } : {}),
      spanMultipleDays: false
    },
    url: input.url,
    partnerEvent: input.partnerEvent ?? false,
    isPartner: input.isPartner ?? false,
    showTmButton: !input.isPartner && !input.partnerEvent,
    venue: {
      city: input.locality,
      name: input.venueName,
      state: "WA",
      url: input.venueUrl,
      imageUrl:
        input.venueImageUrl ??
        "https://statics.tmconst.com/onsale-img/tmimages/TM_GenCatImgs_Generic.jpg",
      addressLineOne: input.streetAddress,
      code: input.postalCode
    },
    timeZone: "Australia/Perth",
    cancelled: input.cancelled ?? false,
    postponed: input.postponed ?? false,
    rescheduled: input.rescheduled ?? false,
    tba: false,
    local: true,
    sameRegion: false,
    soldOut: false,
    limitedAvailability: false,
    eventChangeStatus: "none",
    virtual: false,
    artists: (input.performers ?? []).map((performer) => ({
      name: performer,
      imageUrls: input.artistImageUrl
        ? {
            RETINA_PORTRAIT_16_9: input.artistImageUrl
          }
        : undefined
    }))
  };
}

function buildTicketmasterPopularEvents(input: Array<{
  imageUrl: string;
  url: string;
}>) {
  return {
    popularEvents: input.map((event, index) => ({
      name: `Popular ${index}`,
      venue: "Perth",
      imageUrl: event.imageUrl,
      url: event.url,
      localDate: "2026-06-13",
      localTime: "19:00"
    }))
  };
}

describe("ticketmaster au source adapter", () => {
  it("normalizes a direct Ticketmaster event with exact time and cancelled status", () => {
    const normalized = normalizeTicketmasterEvent(
      buildTicketmasterCityEvent({
        id: "25006444A1862D60",
        url: "https://www.ticketmaster.com.au/great-australian-songbook-live-burswood-31-07-2026/event/25006444A1862D60",
        title: "Great Australian Songbook Live",
        startDate: "2026-07-31T11:00:00Z",
        endDate: "2026-07-31",
        cancelled: true,
        venueName: "Crown Theatre Perth",
        venueUrl: "https://www.ticketmaster.com.au/crown-theatre-perth-tickets-burswood/venue/304372",
        streetAddress: "Crown Perth, Great Eastern Highway",
        locality: "Burswood",
        postalCode: "6100",
        performers: ["The Great Australian Songbook Live"],
        artistImageUrl: "https://example.com/songbook.jpg"
      })
    );

    expect(normalized).toMatchObject({
      sourceSlug: "ticketmaster-au",
      externalId: "25006444A1862D60",
      title: "Great Australian Songbook Live",
      status: "cancelled",
      startsAt: "2026-07-31T11:00:00.000Z",
      startsAtPrecision: "exact",
      endsAt: null,
      imageUrl: "https://example.com/songbook.jpg",
      ticketUrl:
        "https://www.ticketmaster.com.au/great-australian-songbook-live-burswood-31-07-2026/event/25006444A1862D60",
      venue: {
        name: "Crown Theatre Perth",
        suburb: "Burswood",
        slug: "crown-theatre-perth",
        address: "Crown Perth, Great Eastern Highway, Burswood, WA, 6100",
        websiteUrl: "https://www.ticketmaster.com.au/crown-theatre-perth-tickets-burswood/venue/304372"
      },
      artists: ["The Great Australian Songbook Live"]
    });
  });

  it("falls back to date precision when Ticketmaster only exposes a calendar day", () => {
    const normalized = normalizeTicketmasterEvent(
      buildTicketmasterCityEvent({
        id: "1300DATEONLY",
        url: "https://www.ticketmaster.com.au/example-perth/event/1300DATEONLY",
        title: "Date Only Festival",
        startDate: "2026-11-06",
        venueName: "Kings Park",
        locality: "West Perth",
        performers: ["Date Only Festival"]
      })
    );

    expect(normalized.startsAt).toBe("2026-11-06T04:00:00.000Z");
    expect(normalized.startsAtPrecision).toBe("date");
  });

  it("stores unknown artists when Ticketmaster does not expose performers", () => {
    const normalized = normalizeTicketmasterEvent(
      buildTicketmasterCityEvent({
        id: "1300NOPERFORMERS",
        url: "https://www.ticketmaster.com.au/example-perth/event/1300NOPERFORMERS",
        title: "Perth Event With No Performer Data",
        startDate: "2026-11-06T11:00:00Z",
        venueName: "Kings Park",
        locality: "West Perth"
      })
    );

    expect(normalized.artists).toEqual([]);
    expect(normalized.artistExtractionKind).toBe("unknown");
  });

  it("fetches Ticketmaster city events, enriches from popular images, and skips partner entries", async () => {
    const cityEventsPage = {
      total: 3,
      events: [
        buildTicketmasterCityEvent({
          id: "13006458EC58D955",
          url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
          title: "Luude",
          startDate: "2026-06-13T11:00:00Z",
          venueName: "Perth HPC",
          locality: "Mt Claremont",
          performers: ["Luude"]
        }),
        buildTicketmasterCityEvent({
          id: "partner-1",
          url: "https://www.moshtix.com.au/v2/event/john-maus/186218",
          title: "John Maus",
          startDate: "2026-04-23T11:30:00Z",
          venueName: "The Rechabite",
          locality: "Perth",
          partnerEvent: true,
          isPartner: true,
          performers: ["John Maus"]
        }),
        buildTicketmasterCityEvent({
          id: "2500647989C2307D",
          url: "https://www.ticketmaster.com.au/from-a-diamond-to-a-king-burswood-31-07-2026/event/2500647989C2307D",
          title: "FROM A DIAMOND TO A KING",
          startDate: "2026-07-31T12:00:00Z",
          venueName: "Crown Theatre Perth",
          locality: "Burswood",
          performers: ["FROM A DIAMOND TO A KING"]
        })
      ]
    };
    const popularEvents = buildTicketmasterPopularEvents([
      {
        url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
        imageUrl: "https://example.com/luude-popular.jpg"
      }
    ]);

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/recommendations/popular/events")) {
        return new Response(JSON.stringify(popularEvents), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify(cityEventsPage), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const result = await ticketmasterAuSource.fetchListings(fetchMock);

    expect(result.failedCount).toBe(0);
    expect(result.gigs).toHaveLength(2);
    expect(result.gigs.map((gig) => gig.externalId)).toEqual([
      "13006458EC58D955",
      "2500647989C2307D"
    ]);
    expect(result.gigs[0]?.imageUrl).toBe("https://example.com/luude-popular.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("degrades gracefully when Ticketmaster blocks the first city-events page", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/recommendations/popular/events")) {
        return new Response(JSON.stringify({ popularEvents: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response("blocked", {
        status: 403,
        headers: { "content-type": "text/plain" }
      });
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await ticketmasterAuSource.fetchListings(fetchMock);

      expect(result).toEqual({
        gigs: [],
        failedCount: 0
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("skipping source for this run")
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("keeps earlier Ticketmaster results if a later city-events page is blocked", async () => {
    const pageZero = {
      total: 4,
      events: [
        buildTicketmasterCityEvent({
          id: "13006458EC58D955",
          url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
          title: "Luude",
          startDate: "2026-06-13T11:00:00Z",
          venueName: "Perth HPC",
          locality: "Mt Claremont",
          performers: ["Luude"]
        }),
        buildTicketmasterCityEvent({
          id: "2500647989C2307D",
          url: "https://www.ticketmaster.com.au/from-a-diamond-to-a-king-burswood-31-07-2026/event/2500647989C2307D",
          title: "FROM A DIAMOND TO A KING",
          startDate: "2026-07-31T12:00:00Z",
          venueName: "Crown Theatre Perth",
          locality: "Burswood",
          performers: ["FROM A DIAMOND TO A KING"]
        })
      ]
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/recommendations/popular/events")) {
        return new Response(JSON.stringify({ popularEvents: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("page=1")) {
        return new Response("blocked", {
          status: 403,
          headers: { "content-type": "text/plain" }
        });
      }

      return new Response(JSON.stringify(pageZero), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await ticketmasterAuSource.fetchListings(fetchMock);

      expect(result.failedCount).toBe(0);
      expect(result.gigs).toHaveLength(2);
      expect(result.gigs.map((gig) => gig.externalId)).toEqual([
        "13006458EC58D955",
        "2500647989C2307D"
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("keeping earlier Ticketmaster results only")
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
