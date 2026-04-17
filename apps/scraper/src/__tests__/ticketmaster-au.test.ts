import { describe, expect, it, vi } from "vitest";

import {
  normalizeTicketmasterEvent,
  parseTicketmasterDiscoverPage,
  ticketmasterAuSource
} from "../sources/ticketmaster-au";

function buildTicketmasterEvent(input: {
  url: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  eventStatus?: string;
  venueName: string;
  venueUrl?: string;
  streetAddress?: string;
  locality: string;
  region?: string;
  postalCode?: string;
  performers?: string[];
  image?: string | string[];
}) {
  return {
    "@context": "http://schema.org",
    "@type": "MusicEvent",
    url: input.url,
    name: input.name,
    description:
      input.description ??
      `${input.name} | Saturday 13 June 2026, 7:00 pm | ${input.venueName}, ${input.locality}`,
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    eventStatus: input.eventStatus ?? "https://schema.org/EventScheduled",
    ...(input.image ? { image: input.image } : {}),
    location: {
      "@type": "Place",
      name: input.venueName,
      ...(input.venueUrl ? { sameAs: input.venueUrl } : {}),
      address: {
        "@type": "PostalAddress",
        ...(input.streetAddress ? { streetAddress: input.streetAddress } : {}),
        addressLocality: input.locality,
        addressRegion: input.region ?? "WA",
        ...(input.postalCode ? { postalCode: input.postalCode } : {}),
        addressCountry: "AU"
      }
    },
    offers: {
      "@type": "Offer",
      url: input.url
    },
    performer: (input.performers ?? [input.name]).map((performer) => ({
      "@type": "MusicGroup",
      name: performer
    }))
  };
}

function buildDiscoverPage(input: { payloads: string[]; totalPages?: number }) {
  return `
    <html>
      <body>
        ${input.payloads
          .map((payload, index) => `<script id="ld-${index}" type="application/ld+json">${payload}</script>`)
          .join("\n")}
        <div>Page 1 of ${input.totalPages ?? 1}</div>
      </body>
    </html>
  `;
}

describe("ticketmaster au source adapter", () => {
  it("parses Ticketmaster direct music events and skips partner-site entries", () => {
    const parsed = parseTicketmasterDiscoverPage(
      buildDiscoverPage({
        totalPages: 3,
        payloads: [
          JSON.stringify([
            buildTicketmasterEvent({
              url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
              name: "Luude",
              startDate: "2026-06-13T19:00:00",
              venueName: "Perth HPC",
              venueUrl: "https://www.ticketmaster.com.au/perth-hpc-tickets-mt-claremont/venue/157963",
              streetAddress: "Stephenson Avenue",
              locality: "Mt Claremont",
              postalCode: "6010",
              performers: ["Luude"],
              image: "https://example.com/luude.jpg"
            }),
            buildTicketmasterEvent({
              url: "https://www.moshtix.com.au/v2/event/john-maus/186218",
              name: "John Maus",
              startDate: "2026-04-23",
              venueName: "The Rechabite",
              locality: "Perth",
              performers: ["John Maus"]
            })
          ]),
          "{not valid json"
        ]
      })
    );

    expect(parsed.totalPages).toBe(3);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.events).toHaveLength(2);
  });

  it("normalizes a direct Ticketmaster event with exact time and cancelled status", () => {
    const normalized = normalizeTicketmasterEvent(
      buildTicketmasterEvent({
        url: "https://www.ticketmaster.com.au/great-australian-songbook-live-burswood-31-07-2026/event/25006444A1862D60",
        name: "Great Australian Songbook Live",
        startDate: "2026-07-31T19:00:00",
        endDate: "2026-07-31",
        eventStatus: "https://schema.org/EventCancelled",
        venueName: "Crown Theatre Perth",
        venueUrl: "https://www.ticketmaster.com.au/crown-theatre-perth-tickets-burswood/venue/304372",
        streetAddress: "Crown Perth, Great Eastern Highway",
        locality: "Burswood",
        postalCode: "6100",
        performers: ["The Great Australian Songbook Live"],
        image: "https://example.com/songbook.jpg"
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
      buildTicketmasterEvent({
        url: "https://www.ticketmaster.com.au/example-perth/event/1300DATEONLY",
        name: "Date Only Festival",
        startDate: "2026-11-06",
        venueName: "Kings Park",
        locality: "West Perth",
        performers: ["Date Only Festival"]
      })
    );

    expect(normalized.startsAt).toBe("2026-11-06T04:00:00.000Z");
    expect(normalized.startsAtPrecision).toBe("date");
  });

  it("fetches Ticketmaster discover pages, paginates, and skips partner duplicates", async () => {
    const pageOne = buildDiscoverPage({
      totalPages: 2,
      payloads: [
        JSON.stringify([
          buildTicketmasterEvent({
            url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
            name: "Luude",
            startDate: "2026-06-13T19:00:00",
            venueName: "Perth HPC",
            locality: "Mt Claremont",
            performers: ["Luude"]
          }),
          buildTicketmasterEvent({
            url: "https://www.moshtix.com.au/v2/event/john-maus/186218",
            name: "John Maus",
            startDate: "2026-04-23",
            venueName: "The Rechabite",
            locality: "Perth",
            performers: ["John Maus"]
          })
        ])
      ]
    });
    const pageTwo = buildDiscoverPage({
      totalPages: 2,
      payloads: [
        JSON.stringify([
          buildTicketmasterEvent({
            url: "https://www.ticketmaster.com.au/from-a-diamond-to-a-king-burswood-31-07-2026/event/2500647989C2307D",
            name: "FROM A DIAMOND TO A KING",
            startDate: "2026-07-31T20:00:00",
            venueName: "Crown Theatre Perth",
            locality: "Burswood",
            performers: ["FROM A DIAMOND TO A KING"]
          }),
          buildTicketmasterEvent({
            url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
            name: "Luude",
            startDate: "2026-06-13T19:00:00",
            venueName: "Perth HPC",
            locality: "Mt Claremont",
            performers: ["Luude"]
          })
        ])
      ]
    });

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("page=2")) {
        return new Response(pageTwo, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      return new Response(pageOne, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    });

    const result = await ticketmasterAuSource.fetchListings(fetchMock);

    expect(result.failedCount).toBe(0);
    expect(result.gigs).toHaveLength(2);
    expect(result.gigs.map((gig) => gig.externalId)).toEqual([
      "13006458EC58D955",
      "2500647989C2307D"
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("degrades gracefully when Ticketmaster blocks the first discover page", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response("blocked", {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );
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

  it("keeps earlier Ticketmaster results if a later discover page is blocked", async () => {
    const pageOne = buildDiscoverPage({
      totalPages: 2,
      payloads: [
        JSON.stringify([
          buildTicketmasterEvent({
            url: "https://www.ticketmaster.com.au/luude-mt-claremont-13-06-2026/event/13006458EC58D955",
            name: "Luude",
            startDate: "2026-06-13T19:00:00",
            venueName: "Perth HPC",
            locality: "Mt Claremont",
            performers: ["Luude"]
          })
        ])
      ]
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("page=2")) {
        return new Response("blocked", {
          status: 403,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      return new Response(pageOne, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await ticketmasterAuSource.fetchListings(fetchMock);

      expect(result.failedCount).toBe(0);
      expect(result.gigs).toHaveLength(1);
      expect(result.gigs[0]?.externalId).toBe("13006458EC58D955");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("keeping earlier Ticketmaster results only")
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
