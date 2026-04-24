import { describe, expect, it, vi } from "vitest";

import {
  buildTicketekExactTimeLookupKey,
  mergeTicketekSearchApiResponseIntoExactTimeLookup,
  normalizeTicketekListing,
  parseTicketekSearchPage,
  ticketekWaSource
} from "../sources/ticketek-wa";

function buildSingleVenueResult(input: {
  title: string;
  href: string;
  imageUrl?: string;
  subtitle?: string;
  locationText: string;
  dateText: string;
  buttonClass?: string;
}): string {
  return `
    <div class="resultModule">
      <div class="resultContainer">
        <div class="contentImage">
          <a href="${input.href}">
            <img src="${input.imageUrl ?? "//d35kvm5iuwjt9t.cloudfront.net/dbimages/default.jpg"}" alt="${input.title}" />
          </a>
        </div>
        <div class="contentEvent">
          <h6>${input.title}</h6>
          ${input.subtitle ? `<p class="sub-title">${input.subtitle}</p>` : ""}
        </div>
        <div class="contentEventAndDate clearfix">
          <div class="contentLocation">${input.locationText}</div>
          <div class="contentDate">${input.dateText}</div>
        </div>
        <div class="resultBuyNow">
          <a class="${input.buttonClass ?? "yellowGradientButton"}" href="${input.href}">Find tickets</a>
        </div>
      </div>
    </div>
  `;
}

function buildMultiVenueResult(input: {
  title: string;
  href: string;
  imageUrl?: string;
  rows: Array<{
    locationText: string;
    dateText: string;
    buttonHref: string;
  }>;
}): string {
  return `
    <div class="resultModule multi-venue">
      <div class="resultContainer">
        <div class="contentImage">
          <a href="${input.href}">
            <img src="${input.imageUrl ?? "//d35kvm5iuwjt9t.cloudfront.net/dbimages/default.jpg"}" alt="${input.title}" />
          </a>
        </div>
        <div class="contentEvent">
          <h6>${input.title}</h6>
        </div>
        ${input.rows
          .map(
            (row) => `
              <div class="contentEventAndDate clearfix">
                <div class="contentLocation">${row.locationText}</div>
                <div class="contentDate">${row.dateText}</div>
                <div class="resultBuyNow">
                  <a class="yellowGradientButton" href="${row.buttonHref}">Find tickets</a>
                </div>
              </div>
            `
          )
          .join("\n")}
      </div>
    </div>
  `;
}

function buildSearchPage(input: { results: string[]; totalPages?: number }): string {
  const pagination =
    (input.totalPages ?? 1) > 1
      ? `
        <ul class="searchResultPagination">
          <li><a href="/search/SearchResults.aspx?k=concerts+perth&page=2">2</a></li>
          <li><a href="/search/SearchResults.aspx?k=concerts+perth&page=3">3</a></li>
        </ul>
      `
      : "";

  return `
    <html>
      <body>
        ${pagination}
        ${input.results.join("\n")}
      </body>
    </html>
  `;
}

function buildTicketekSearchApiResponse(input: {
  events: Array<{
    id: string;
    title: string;
    subtitle: string;
    dateTimeLocalized: string;
    showCode: string;
    venueName: string;
    venueCode?: string;
    linkUri?: string;
  }>;
  nextPageToken?: string | null;
  hasMore?: boolean;
  totalCount?: number;
}) {
  return {
    paging: {
      nextPageToken: input.nextPageToken ?? null,
      hasMore: input.hasMore ?? false,
      totalCount: input.totalCount ?? input.events.length
    },
    events: input.events.map((event) => ({
      id: event.id,
      title: event.title,
      subtitle: event.subtitle,
      dateTimeLocalized: event.dateTimeLocalized,
      show: { showCode: event.showCode },
      venue: {
        name: event.venueName,
        city: "Perth",
        state: "WA",
        venueCode: event.venueCode ?? null
      },
      link: {
        uri:
          event.linkUri ??
          `https://premier.ticketek.com.au/events/${event.showCode}/venues/${event.venueCode ?? "RTP"}/performances/${event.id}`
      }
    }))
  };
}

describe("ticketek wa source adapter", () => {
  it("parses Perth music listings and skips obvious venue pages and waitlists", () => {
    const parsed = parseTicketekSearchPage(
      buildSearchPage({
        totalPages: 3,
        results: [
          buildSingleVenueResult({
            title: "Bootleg Beatles",
            href: "/shows/show.aspx?sh=BOOTLEGB26",
            subtitle: "In Concert 2026",
            locationText:
              "Riverside Theatre, Perth Convention and Exhibition Centre, Perth, WA",
            dateText: "Sat 07 Nov 2026"
          }),
          buildSingleVenueResult({
            title: "Ascot Autumn Racing",
            href: "/shows/show.aspx?sh=ASCOTAUT26",
            locationText: "Ascot Racecourse, Ascot, WA",
            dateText: "Sat 18 Apr 2026"
          }),
          buildSingleVenueResult({
            title: "The Veronicas (Waitlist)",
            href: "/shows/show.aspx?sh=VERONIWAIT",
            locationText: "National",
            dateText: "Fri 17 Apr 2026",
            buttonClass: "blueGradientButton"
          }),
          `
            <div class="resultModule">
              <div class="resultContainer">
                <div class="contentEvent"><h6></h6></div>
              </div>
            </div>
          `
        ]
      }),
      "concerts perth"
    );

    expect(parsed.totalPages).toBe(3);
    expect(parsed.failedCount).toBe(0);
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]).toMatchObject({
      externalId: "BOOTLEGB26",
      title: "Bootleg Beatles",
      imageUrl: "https://d35kvm5iuwjt9t.cloudfront.net/dbimages/default.jpg",
      locationText:
        "Riverside Theatre, Perth Convention and Exhibition Centre, Perth, WA",
      startsAt: "2026-11-07T04:00:00.000Z"
    });
  });

  it("splits multi-venue Ticketek cards into per-venue listings with unique ids", () => {
    const parsed = parseTicketekSearchPage(
      buildSearchPage({
        results: [
          buildMultiVenueResult({
            title: "Tribute Night",
            href: "/shows/show.aspx?sh=TRIBNITE26",
            rows: [
              {
                locationText: "Astor Theatre, Mount Lawley, WA",
                dateText: "Fri 12 Jun 2026",
                buttonHref: "/shows/show.aspx?sh=TRIBNITE26&v=AST"
              },
              {
                locationText: "The National Theatre, St Kilda, VIC",
                dateText: "Sat 13 Jun 2026",
                buttonHref: "/shows/show.aspx?sh=TRIBNITE26&v=NTT"
              }
            ]
          })
        ]
      }),
      "astor theatre perth"
    );

    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]).toMatchObject({
      externalId: "TRIBNITE26:AST",
      sourceUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=TRIBNITE26&v=AST"
    });
  });

  it("normalizes a Ticketek search listing into a gig using a date-only fallback time", () => {
    const listing: Parameters<typeof normalizeTicketekListing>[0] = {
      externalId: "WAYGOP26",
      title: "Go Your Own Way",
      subtitle: "In Concert",
      summary: null,
      sourceUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=WAYGOP26",
      ticketUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=WAYGOP26",
      imageUrl: "https://d35kvm5iuwjt9t.cloudfront.net/dbimages/waygop26.jpg",
      locationText: "Riverside Theatre, Perth Convention and Exhibition Centre, Perth, WA",
      dateText: "Fri 12 Jun 2026",
      startsAt: "2026-06-12T04:00:00.000Z",
      startsAtPrecision: "date",
      rawPayload: {
        query: "concerts perth",
        title: "Go Your Own Way",
        subtitle: "In Concert",
        locationText:
          "Riverside Theatre, Perth Convention and Exhibition Centre, Perth, WA",
        dateText: "Fri 12 Jun 2026",
        ticketUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=WAYGOP26",
        imageUrl: "https://d35kvm5iuwjt9t.cloudfront.net/dbimages/waygop26.jpg"
      }
    };

    const normalized = normalizeTicketekListing(listing);

    expect(normalized).toMatchObject({
      sourceSlug: "ticketek-wa",
      externalId: "WAYGOP26",
      imageUrl: "https://d35kvm5iuwjt9t.cloudfront.net/dbimages/waygop26.jpg",
      title: "Go Your Own Way",
      description: "In Concert",
      status: "active",
      startsAt: "2026-06-12T04:00:00.000Z",
      startsAtPrecision: "date",
      ticketUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=WAYGOP26",
      venue: {
        name: "Riverside Theatre, Perth Convention and Exhibition Centre",
        suburb: "Perth",
        slug: "riverside-theatre-perth-convention-and-exhibition-centre"
      },
      artists: [],
      artistExtractionKind: "unknown"
    });
  });

  it("parses conservative presenter artists from Ticketek titles", () => {
    const listing: Parameters<typeof normalizeTicketekListing>[0] = {
      externalId: "GLAMFUNK26",
      title: "Glam Funk Band presents Ministry of Disco",
      subtitle: null,
      summary: null,
      sourceUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=GLAMFUNK26",
      ticketUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=GLAMFUNK26",
      imageUrl: "https://d35kvm5iuwjt9t.cloudfront.net/dbimages/glamfunk26.jpg",
      locationText: "Astor Theatre, Mount Lawley, WA",
      dateText: "Sat 14 Nov 2026",
      startsAt: "2026-11-14T04:00:00.000Z",
      startsAtPrecision: "date",
      rawPayload: {
        query: "funk perth",
        title: "Glam Funk Band presents Ministry of Disco",
        subtitle: null,
        summary: null,
        locationText: "Astor Theatre, Mount Lawley, WA",
        dateText: "Sat 14 Nov 2026",
        ticketUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=GLAMFUNK26",
        imageUrl: "https://d35kvm5iuwjt9t.cloudfront.net/dbimages/glamfunk26.jpg"
      }
    };

    const normalized = normalizeTicketekListing(listing);

    expect(normalized).toMatchObject({
      title: "Glam Funk Band presents Ministry of Disco",
      artists: ["Glam Funk Band"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("indexes exact start times from Ticketek's structured search API", () => {
    const lookup = new Map<string, string | null>();

    mergeTicketekSearchApiResponseIntoExactTimeLookup(
      lookup,
      buildTicketekSearchApiResponse({
        events: [
          {
            id: "EPCE2026927",
            title: "Bootleg Beatles",
            subtitle: "Sat 7 Nov 2026 7:30pm",
            dateTimeLocalized: "2026-11-07T19:30:00+08:00",
            showCode: "BOOTLEGB26",
            venueName: "Riverside Theatre, Perth Convention and Exhibition Centre",
            venueCode: "RTP"
          }
        ]
      })
    );

    expect(
      lookup.get(
        buildTicketekExactTimeLookupKey({
          externalId: "BOOTLEGB26",
          dateKey: "2026-11-07",
          venueSlug: "riverside-theatre-perth-convention-and-exhibition-centre"
        })
      )
    ).toBe("2026-11-07T11:30:00.000Z");
  });

  it("marks ambiguous same-day Ticketek API matches as unresolved instead of picking a wrong time", () => {
    const lookup = new Map<string, string | null>();

    mergeTicketekSearchApiResponseIntoExactTimeLookup(
      lookup,
      buildTicketekSearchApiResponse({
        events: [
          {
            id: "EPCE2026801",
            title: "Choirboys",
            subtitle: "Sat 17 Oct 2026 7:00pm",
            dateTimeLocalized: "2026-10-17T19:00:00+08:00",
            showCode: "CHOIRBOY26",
            venueName: "Astor Theatre",
            venueCode: "AST"
          },
          {
            id: "EPCE2026802",
            title: "Choirboys",
            subtitle: "Sat 17 Oct 2026 9:30pm",
            dateTimeLocalized: "2026-10-17T21:30:00+08:00",
            showCode: "CHOIRBOY26",
            venueName: "Astor Theatre",
            venueCode: "AST"
          }
        ]
      })
    );

    expect(
      lookup.get(
        buildTicketekExactTimeLookupKey({
          externalId: "CHOIRBOY26:AST",
          dateKey: "2026-10-17",
          venueSlug: "astor-theatre"
        })
      )
    ).toBeNull();
  });

  it("keeps the first day from ranged Ticketek dates for Perth music listings", () => {
    const parsed = parseTicketekSearchPage(
      buildSearchPage({
        results: [
          buildSingleVenueResult({
            title: "Jurassic World In Concert",
            href: "/shows/show.aspx?sh=JWICP26",
            subtitle: "Live with orchestra",
            locationText:
              "Riverside Theatre, Perth Convention and Exhibition Centre, Perth, WA",
            dateText: "Fri 17 Apr 2026 to Sat 18 Apr 2026"
          })
        ]
      }),
      "concerts perth"
    );

    expect(parsed.failedCount).toBe(0);
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]).toMatchObject({
      externalId: "JWICP26",
      startsAt: "2026-04-17T04:00:00.000Z"
    });
  });

  it("skips Ticketek listings with TBC dates without counting them as failures", () => {
    const parsed = parseTicketekSearchPage(
      buildSearchPage({
        results: [
          buildSingleVenueResult({
            title: "Fisher | OUT 2 LUNCH Festival with Vodafone",
            href: "/shows/show.aspx?sh=FISHFEST26",
            locationText: "Wellington Square, Perth, WA",
            dateText: "TBC"
          })
        ]
      }),
      "festival perth"
    );

    expect(parsed.failedCount).toBe(0);
    expect(parsed.listings).toHaveLength(0);
  });

  it("follows Ticketek's detection redirect flow and deduplicates across search queries", async () => {
    const searchHtml = buildSearchPage({
      results: [
        buildSingleVenueResult({
          title: "Bootleg Beatles",
          href: "/shows/show.aspx?sh=BOOTLEGB26",
          subtitle: "In Concert 2026",
          locationText:
            "Riverside Theatre, Perth Convention and Exhibition Centre, Perth, WA",
          dateText: "Sat 07 Nov 2026"
        })
      ]
    });
    const titleSearchApiResponse = buildTicketekSearchApiResponse({
      events: [
        {
          id: "EPCE2026927",
          title: "Bootleg Beatles",
          subtitle: "Sat 7 Nov 2026 7:30pm",
          dateTimeLocalized: "2026-11-07T19:30:00+08:00",
          showCode: "BOOTLEGB26",
          venueName: "Riverside Theatre, Perth Convention and Exhibition Centre",
          venueCode: "RTP"
        }
      ]
    });

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://ignition.ticketek.com.au/fanxsearch/api/search") {
        const requestBody =
          init && typeof init === "object" && "body" in init && typeof init.body === "string"
            ? JSON.parse(init.body)
            : null;
        const payload =
          requestBody?.searchTerm === "Bootleg Beatles"
            ? titleSearchApiResponse
            : buildTicketekSearchApiResponse({ events: [] });

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }

      if (url.includes("/search/SearchResults.aspx")) {
        const requestUrl = new URL(url);
        const cookieHeader =
          init && typeof init === "object" && "headers" in init
            ? (init.headers as Record<string, string> | undefined)?.cookie ?? ""
            : "";

        if (cookieHeader.includes("ticketek.com.au+cp.id=")) {
          return new Response(searchHtml, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" }
          });
        }

        return new Response(null, {
          status: 302,
          headers: {
            location: `https://www.ticketek.com.au/detection.aspx?rt=${encodeURIComponent(url)}`,
            "set-cookie":
              "ticketek.com.au+cookies=true; Domain=.ticketek.com.au; Path=/; Secure"
          }
        });
      }

      if (url.includes("/detection.aspx")) {
        const target = new URL(url).searchParams.get("rt");

        return new Response(null, {
          status: 302,
          headers: {
            location: target ?? "https://premier.ticketek.com.au/",
            "set-cookie":
              "ticketek.com.au+cp.id=example-session; Domain=.ticketek.com.au; Path=/; Secure"
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await ticketekWaSource.fetchListings(fetchMock);

    expect(result.failedCount).toBe(0);
    expect(result.gigs).toHaveLength(1);
    expect(result.gigs[0]).toMatchObject({
      sourceSlug: "ticketek-wa",
      externalId: "BOOTLEGB26",
      title: "Bootleg Beatles",
      startsAt: "2026-11-07T11:30:00.000Z",
      startsAtPrecision: "exact"
    });
    expect(fetchMock).toHaveBeenCalled();
  });
});
