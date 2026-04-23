import { describe, expect, it, vi } from "vitest";

import {
  buildMoshtixWaSearchUrl,
  extractMoshtixArtists,
  moshtixWaSource,
  normalizeMoshtixEventPage,
  parseMoshtixSearchPage
} from "../sources/moshtix-wa";

function buildSearchResult(input: {
  eventId: string;
  title: string;
  eventUrl: string;
  imageUrl: string;
  startDate: string;
  endDate?: string;
  venueName: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  teaser?: string;
}): string {
  return `
    <div class="searchresult clearfix" data-event-id="${input.eventId}">
      <div class="searchresult_image">
        <a href="${input.eventUrl}">
          <img src="${input.imageUrl}" alt="${input.title}" />
        </a>
      </div>
      <div class="searchresult_content">
        <h2 class="main-event-header">
          <a href="${input.eventUrl}">
            <span>${input.title}</span>
          </a>
        </h2>
        <h2 class="main-artist-event-header">
          Tue 7 Apr 2026, 7.30pm |
          <a href="/v2/venues/example/1">
            <span>${input.venueName}</span>,
            <span><span><span>${input.region ?? "WA"}</span></span></span>
          </a>
        </h2>
        <p><span>${input.teaser ?? ""}</span> <a href="${input.eventUrl}">more &raquo;</a></p>
        <a href="${input.eventUrl}" class="button_orange">Get Tickets</a>
        <section>
          <script type="application/ld+json">
${JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: input.title,
    image: input.imageUrl,
    url: input.eventUrl,
    startDate: input.startDate,
    endDate: input.endDate ?? input.startDate,
    eventStatus: "EventScheduled",
    location: {
      "@type": "Place",
      name: input.venueName,
      sameAs: "",
      address: {
        "@type": "PostalAddress",
        streetAddress: input.streetAddress ?? "",
        addressLocality: input.locality ?? "",
        addressRegion: input.region ?? "WA"
      }
    }
  }
])}
          </script>
        </section>
      </div>
    </div>
  `;
}

function buildSearchPage(input: {
  results: string[];
  totalPages?: number;
}): string {
  const pagination =
    (input.totalPages ?? 1) > 1
      ? `
        <section class="pagination">
          <a href="/v2/search?StateId=8&TimePeriod=6&FromDate=07%20Apr%202026&FromDateDisplay=07%20Apr%202026&CategoryList=2%2C&Page=2">2</a>
        </section>
      `
      : "";

  return `
    <html>
      <body>
        <section id="search-results">
          ${input.results.join("\n")}
        </section>
        ${pagination}
      </body>
    </html>
  `;
}

function buildEventPage(input: {
  eventId: string;
  title: string;
  eventUrl: string;
  startDate: string;
  endDate: string;
  customImage?: string;
  highResImage?: string;
  venueName: string;
  venueWebsite?: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  descriptionHtml?: string;
  statusText?: string;
  artists?: string[];
  offersUrl?: string;
}): string {
  return `
    <script>
      var moshtixEventData = ${JSON.stringify({
        id: Number.parseInt(input.eventId, 10),
        name: input.title,
        startDate: input.startDate,
        endDate: input.endDate,
        status: null,
        client: {
          id: 1,
          name: "Mojos Bar"
        },
        venue: {
          id: 788,
          name: input.venueName,
          state: input.region ?? "WA"
        },
        category: {
          id: 2,
          name: "Live Music"
        },
        customImage: input.customImage ?? null,
        highResImage: input.highResImage ?? null,
        artists: input.artists ?? [input.title]
      })};
    </script>
    <section id="status-linked-section">${input.statusText ?? ""}</section>
    <section id="event-summary-section">
      <div id="event-summary-block" data-event-link="${input.eventUrl}"></div>
      <a id="event-summary-thumbnail" href="#">
        <img src="${input.highResImage ?? input.customImage ?? ""}" alt="${input.title}" />
      </a>
      <a class="button_orange" href="${input.offersUrl ?? input.eventUrl}">Get Tickets</a>
    </section>
    <section id="event-structured-data-section">
      <script type="application/ld+json">
${JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: input.title,
    image: input.highResImage ?? input.customImage ?? null,
    url: input.eventUrl,
    startDate: input.startDate,
    endDate: input.endDate,
    eventStatus: "EventScheduled",
    location: {
      "@type": "Place",
      name: input.venueName,
      sameAs: input.venueWebsite ?? "",
      address: {
        "@type": "PostalAddress",
        streetAddress: input.streetAddress ?? "",
        addressLocality: input.locality ?? "",
        addressRegion: input.region ?? "WA",
        postalCode: input.postalCode ?? ""
      }
    },
    offers: [
      {
        "@type": "Offer",
        url: input.offersUrl ?? input.eventUrl
      }
    ],
    performers: (input.artists ?? [input.title]).map((name) => ({
      "@type": "Person",
      name
    }))
  }
])}
      </script>
    </section>
    <section id="event-details-section" class="moduleseparator">
      <div class="fr-view">${input.descriptionHtml ?? ""}</div>
    </section>
  `;
}

describe("moshtix wa source adapter", () => {
  it("builds the WA live-music search URL from Perth-local today", () => {
    expect(buildMoshtixWaSearchUrl(new Date("2026-04-06T16:30:00.000Z"))).toContain(
      "FromDate=07+Apr+2026"
    );
    expect(buildMoshtixWaSearchUrl(new Date("2026-04-06T16:30:00.000Z"))).toContain(
      "CategoryList=2%2C"
    );
  });

  it("parses candidate listings from the search page and pagination links", () => {
    const html = buildSearchPage({
      totalPages: 2,
      results: [
        buildSearchResult({
          eventId: "193078",
          title: "Doctor Jazz",
          eventUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
          imageUrl: "https://static.moshtix.com.au/uploads/doctor-jazzx140x140",
          startDate: "2026-04-07T19:30:00",
          endDate: "2026-04-07T22:30:00",
          venueName: "Mojos Bar, North Fremantle",
          streetAddress: "237 Queen Victoria St",
          locality: "North Fremantle",
          teaser: "Late-night jazz set"
        }),
        `<div class="searchresult clearfix" data-event-id="broken"><h2 class="main-event-header"></h2></div>`
      ]
    });

    const parsed = parseMoshtixSearchPage(html);

    expect(parsed.totalPages).toBe(2);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]).toMatchObject({
      externalId: "193078",
      title: "Doctor Jazz",
      eventUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
      startsAt: "2026-04-07T11:30:00.000Z"
    });
  });

  it("normalizes a detail page into a gig with richer venue, image, and description fields", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193078",
            title: "Doctor Jazz",
            eventUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
            imageUrl: "https://static.moshtix.com.au/uploads/doctor-jazzx140x140",
            startDate: "2026-04-07T19:30:00",
            endDate: "2026-04-07T22:30:00",
            venueName: "Mojos Bar, North Fremantle",
            streetAddress: "237 Queen Victoria St",
            locality: "North Fremantle"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193078",
        title: "Doctor Jazz",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-07T19:30:00",
        endDate: "2026-04-07T22:30:00",
        customImage: "https://static.moshtix.com.au/uploads/doctor-jazzxoriginal",
        highResImage: "https://static.moshtix.com.au/uploads/doctor-jazzx600x600",
        venueName: "Mojos Bar, North Fremantle",
        venueWebsite: "www.mojosbar.com.au",
        streetAddress: "237 Queen Victoria St",
        locality: "North Fremantle",
        region: "WA",
        postalCode: "6159",
        descriptionHtml: "<p>Free Entry | Late-night jazz set.</p>",
        artists: ["Mojos Bar", "Doctor Jazz"]
      })
    });

    expect(gig).toMatchObject({
      sourceSlug: "moshtix-wa",
      externalId: "193078",
      sourceUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
      imageUrl: "https://static.moshtix.com.au/uploads/doctor-jazzxoriginal",
      title: "Doctor Jazz",
      description: "Free Entry | Late-night jazz set.",
      startsAt: "2026-04-07T11:30:00.000Z",
      startsAtPrecision: "exact",
      endsAt: "2026-04-07T14:30:00.000Z",
      venue: {
        name: "Mojos Bar",
        suburb: "North Fremantle",
        address: "237 Queen Victoria St, North Fremantle WA 6159",
        websiteUrl: "https://www.mojosbar.com.au/"
      },
      artists: ["Doctor Jazz"],
      artistExtractionKind: "structured"
    });
  });

  it("parses artists from Moshtix title and description lines when structured performers are missing", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193703",
            title: "Dean Haitani + Dilip N The Davs",
            eventUrl: "https://www.moshtix.com.au/v2/event/dean-haitani-dilip-n-the-davs/193703",
            imageUrl: "https://static.moshtix.com.au/uploads/deanx140x140",
            startDate: "2026-04-28T19:30:00",
            endDate: "2026-04-28T22:30:00",
            venueName: "Mojos Bar, North Fremantle",
            streetAddress: "237 Queen Victoria St",
            locality: "North Fremantle"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193703",
        title: "Dean Haitani + Dilip N The Davs",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-28T19:30:00",
        endDate: "2026-04-28T22:30:00",
        venueName: "Mojos Bar, North Fremantle",
        streetAddress: "237 Queen Victoria St",
        locality: "North Fremantle",
        region: "WA",
        postalCode: "6159",
        descriptionHtml:
          "<p><strong>The PERTH BLUES CLUB presents</strong></p><p><strong>Dean Haitani + Dilip N The Davs</strong></p><h1>Dean Haitani | 7.30pm</h1><h1>Dilip N The Davs | 9.00pm</h1>",
        artists: []
      })
    });

    expect(gig.artists).toEqual(["Dean Haitani", "Dilip N The Davs"]);
    expect(gig.artistExtractionKind).toBe("parsed_text");
  });

  it("parses featured headliners and support names from Moshtix concert copy", () => {
    const extraction = extractMoshtixArtists({
      title: "Remembering The Strike; featuring Shane Howard (Goanna Band) and more!",
      descriptionHtml:
        "<p>Headlined by Shane Howard with his Great Western band made up of Fremantle musicians Lucky Oceans, David Hyams, Roy Martinez and Todd Pickett.</p>",
      structuredEvent: null,
      eventData: {
        name: "Remembering The Strike; featuring Shane Howard (Goanna Band) and more!",
        artists: [],
        venue: {
          name: "Freo.Social"
        },
        client: {
          name: "Freo.Social"
        }
      },
      venue: {
        name: "Freo.Social",
        slug: "freo-social",
        suburb: "Fremantle",
        address: null,
        websiteUrl: null
      }
    });

    expect(extraction).toEqual({
      artists: ["Shane Howard", "Lucky Oceans", "David Hyams", "Roy Martinez", "Todd Pickett"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("parses DJ artists from Moshtix venue-session descriptions", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193929",
            title: "VINYL LOUNGE at the Duke",
            eventUrl: "https://www.moshtix.com.au/v2/event/vinyl-lounge-at-the-duke/193929",
            imageUrl: "https://static.moshtix.com.au/uploads/vinyl-loungex140x140",
            startDate: "2026-04-25T13:00:00",
            endDate: "2026-04-25T17:00:00",
            venueName: "The Duke of George",
            streetAddress: "135 Duke Street",
            locality: "East Fremantle"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193929",
        title: "VINYL LOUNGE at the Duke",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-25T13:00:00",
        endDate: "2026-04-25T17:00:00",
        venueName: "The Duke of George",
        streetAddress: "135 Duke Street",
        locality: "East Fremantle",
        region: "WA",
        postalCode: "6158",
        descriptionHtml:
          "<p>DJ Howie Z launches the Saturday Vinyl Lounge Sessions!</p><p>Free Entry and Tunes from 1 pm to 5 pm</p>",
        artists: []
      })
    });

    expect(gig.artists).toEqual(["DJ Howie Z"]);
    expect(gig.artistExtractionKind).toBe("parsed_text");
  });

  it("skips the empty Moshtix uploads directory URL and falls back to the next real image", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193082",
            title: "Laneway Session",
            eventUrl: "https://www.moshtix.com.au/v2/event/laneway-session/193082",
            imageUrl: "https://static.moshtix.com.au/uploads/laneway-sessionx140x140",
            startDate: "2026-04-10T19:30:00",
            endDate: "2026-04-10T22:30:00",
            venueName: "Mojos Bar, North Fremantle",
            streetAddress: "237 Queen Victoria St",
            locality: "North Fremantle"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193082",
        title: "Laneway Session",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-10T19:30:00",
        endDate: "2026-04-10T22:30:00",
        customImage: "https://www.moshtix.com.au/uploads/",
        venueName: "Mojos Bar, North Fremantle",
        venueWebsite: "www.mojosbar.com.au",
        streetAddress: "237 Queen Victoria St",
        locality: "North Fremantle",
        region: "WA",
        postalCode: "6159",
        descriptionHtml: "<p>Live music under the stars.</p>"
      })
    });

    expect(gig.imageUrl).toBe("https://static.moshtix.com.au/uploads/laneway-sessionx140x140");
  });

  it("canonicalizes renamed venue labels before storing Moshtix gigs", () => {
    const listing = parseMoshtixSearchPage(
      buildSearchPage({
        results: [
          buildSearchResult({
            eventId: "193079",
            title: "Rosemount Late Show",
            eventUrl: "https://www.moshtix.com.au/v2/event/rosemount-late-show/193079",
            imageUrl: "https://static.moshtix.com.au/uploads/rosemountx140x140",
            startDate: "2026-04-08T20:00:00",
            endDate: "2026-04-08T23:00:00",
            venueName: "Four5Nine Bar",
            streetAddress: "459 Fitzgerald St",
            locality: "North Perth"
          })
        ]
      })
    ).listings[0];

    const gig = normalizeMoshtixEventPage({
      listing,
      html: buildEventPage({
        eventId: "193079",
        title: "Rosemount Late Show",
        eventUrl: listing.eventUrl,
        startDate: "2026-04-08T20:00:00",
        endDate: "2026-04-08T23:00:00",
        venueName: "Four5Nine Bar",
        streetAddress: "459 Fitzgerald St",
        locality: "North Perth",
        region: "WA",
        postalCode: "6006",
        descriptionHtml: "<p>Late live music at the Rosemount.</p>"
      })
    });

    expect(gig.venue).toMatchObject({
      name: "Four5Nine Bar @ Rosemount",
      slug: "four5nine-bar-rosemount",
      suburb: "North Perth"
    });
  });

  it("excludes obvious non-music leaks that still make it through the live-music feed", () => {
    expect(() =>
      normalizeMoshtixEventPage({
        listing: {
          externalId: "193080",
          title: "Mojos Pub Quiz",
          eventUrl: "https://www.moshtix.com.au/v2/event/mojos-pub-quiz/193080",
          startsAt: "2026-04-08T11:00:00.000Z",
          listingImageUrl: null,
          teaser: "Weekly trivia night",
          rawPayload: {}
        },
        html: buildEventPage({
          eventId: "193080",
          title: "Mojos Pub Quiz",
          eventUrl: "https://www.moshtix.com.au/v2/event/mojos-pub-quiz/193080",
          startDate: "2026-04-08T19:00:00",
          endDate: "2026-04-08T21:00:00",
          venueName: "Mojos Bar, North Fremantle",
          descriptionHtml: "<p>Weekly trivia night.</p>"
        })
      })
    ).toThrow(/non-music/i);
  });

  it("excludes WA listings that are outside Perth metro", () => {
    expect(() =>
      normalizeMoshtixEventPage({
        listing: {
          externalId: "193083",
          title: "No Future: Hip Hop & RnB Night - Busselton",
          eventUrl: "https://www.moshtix.com.au/v2/event/no-future-busselton/193083",
          startsAt: "2026-05-01T12:00:00.000Z",
          listingImageUrl: null,
          teaser: "Regional club night",
          rawPayload: {}
        },
        html: buildEventPage({
          eventId: "193083",
          title: "No Future: Hip Hop & RnB Night - Busselton",
          eventUrl: "https://www.moshtix.com.au/v2/event/no-future-busselton/193083",
          startDate: "2026-05-01T20:00:00",
          endDate: "2026-05-02T00:00:00",
          venueName: "Busselton Pavilion",
          streetAddress: "55 Queen St",
          locality: "Busselton",
          region: "WA",
          postalCode: "6280",
          descriptionHtml: "<p>Regional club night.</p>"
        })
      })
    ).toThrow(/outside Perth metro/i);
  });

  it("allows valid East Fremantle gigs through the Perth-metro filter", () => {
    const gig = normalizeMoshtixEventPage({
      listing: {
        externalId: "193084",
        title: "Soul Night at the Duke",
        eventUrl: "https://www.moshtix.com.au/v2/event/soul-night-at-the-duke/193084",
        startsAt: "2026-05-08T12:00:00.000Z",
        listingImageUrl: null,
        teaser: "East Fremantle soul revue",
        rawPayload: {}
      },
      html: buildEventPage({
        eventId: "193084",
        title: "Soul Night at the Duke",
        eventUrl: "https://www.moshtix.com.au/v2/event/soul-night-at-the-duke/193084",
        startDate: "2026-05-08T20:00:00",
        endDate: "2026-05-08T23:00:00",
        venueName: "The Duke of George",
        streetAddress: "135 Duke St",
        locality: "East Fremantle",
        region: "WA",
        postalCode: "6158",
        descriptionHtml: "<p>Soul revue in East Fremantle.</p>"
      })
    });

    expect(gig.venue.suburb).toBe("East Fremantle");
  });

  it("excludes touring placeholder venue records even when they mention WA", () => {
    expect(() =>
      normalizeMoshtixEventPage({
        listing: {
          externalId: "193085",
          title: "Rum Jungle ‘Marginalia’ AU & NZ Tour",
          eventUrl: "https://www.moshtix.com.au/v2/event/rum-jungle-marginalia/193085",
          startsAt: "2026-06-26T11:00:00.000Z",
          listingImageUrl: null,
          teaser: "Touring placeholder listing",
          rawPayload: {}
        },
        html: buildEventPage({
          eventId: "193085",
          title: "Rum Jungle ‘Marginalia’ AU & NZ Tour",
          eventUrl: "https://www.moshtix.com.au/v2/event/rum-jungle-marginalia/193085",
          startDate: "2026-06-26T19:00:00",
          endDate: "2026-06-26T22:00:00",
          venueName: "Various Venues (AU and NZ)",
          streetAddress: "Touring Australia and New Zealand",
          locality: "",
          region: "WA",
          postalCode: "",
          descriptionHtml: "<p>Touring placeholder listing.</p>"
        })
      })
    ).toThrow(/placeholder touring venue|outside Perth metro/i);
  });

  it("fetches paginated WA results, enriches detail pages, and keeps the source non-public", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T16:30:00.000Z"));

    const pageOneHtml = buildSearchPage({
      totalPages: 2,
      results: [
        buildSearchResult({
          eventId: "193078",
          title: "Doctor Jazz",
          eventUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
          imageUrl: "https://static.moshtix.com.au/uploads/doctor-jazzx140x140",
          startDate: "2026-04-07T19:30:00",
          endDate: "2026-04-07T22:30:00",
          venueName: "Mojos Bar, North Fremantle",
          locality: "North Fremantle"
        }),
        buildSearchResult({
          eventId: "193080",
          title: "Mojos Pub Quiz",
          eventUrl: "https://www.moshtix.com.au/v2/event/mojos-pub-quiz/193080",
          imageUrl: "https://static.moshtix.com.au/uploads/mojos-pub-quizx140x140",
          startDate: "2026-04-08T19:00:00",
          endDate: "2026-04-08T21:00:00",
          venueName: "Mojos Bar, North Fremantle",
          locality: "North Fremantle"
        })
      ]
    });
    const pageTwoHtml = buildSearchPage({
      results: [
        buildSearchResult({
          eventId: "193081",
          title: "Mojos Songwriters Club",
          eventUrl: "https://www.moshtix.com.au/v2/event/mojos-songwriters-club/193081",
          imageUrl: "https://static.moshtix.com.au/uploads/songwritersx140x140",
          startDate: "2026-04-09T19:30:00",
          endDate: "2026-04-09T22:30:00",
          venueName: "Mojos Bar, North Fremantle",
          locality: "North Fremantle"
        }),
        buildSearchResult({
          eventId: "193083",
          title: "No Future: Hip Hop & RnB Night - Busselton",
          eventUrl: "https://www.moshtix.com.au/v2/event/no-future-busselton/193083",
          imageUrl: "https://static.moshtix.com.au/uploads/no-futurex140x140",
          startDate: "2026-05-01T20:00:00",
          endDate: "2026-05-02T00:00:00",
          venueName: "Busselton Pavilion",
          locality: "Busselton"
        })
      ]
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(pageOneHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          buildEventPage({
            eventId: "193078",
            title: "Doctor Jazz",
            eventUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
            startDate: "2026-04-07T19:30:00",
            endDate: "2026-04-07T22:30:00",
            customImage: "https://static.moshtix.com.au/uploads/doctor-jazzxoriginal",
            venueName: "Mojos Bar, North Fremantle",
            venueWebsite: "www.mojosbar.com.au",
            streetAddress: "237 Queen Victoria St",
            locality: "North Fremantle",
            region: "WA",
            postalCode: "6159",
            descriptionHtml: "<p>Late-night jazz set.</p>"
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(pageTwoHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          buildEventPage({
            eventId: "193081",
            title: "Mojos Songwriters Club",
            eventUrl: "https://www.moshtix.com.au/v2/event/mojos-songwriters-club/193081",
            startDate: "2026-04-09T19:30:00",
            endDate: "2026-04-09T22:30:00",
            customImage: "https://static.moshtix.com.au/uploads/songwritersxoriginal",
            venueName: "Mojos Bar, North Fremantle",
            venueWebsite: "www.mojosbar.com.au",
            streetAddress: "237 Queen Victoria St",
            locality: "North Fremantle",
            region: "WA",
            postalCode: "6159",
            descriptionHtml: "<p>Original songwriters sharing new music.</p>"
          }),
          { status: 200 }
        )
      );

    try {
      const result = await moshtixWaSource.fetchListings(fetchMock);

      expect(moshtixWaSource.isPublicListingSource).toBe(true);
      expect(result.failedCount).toBe(0);
      expect(result.gigs).toHaveLength(2);
      expect(result.gigs.map((gig) => gig.title)).toEqual([
        "Doctor Jazz",
        "Mojos Songwriters Club"
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("FromDate=07+Apr+2026");
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("Page=2"))).toBe(true);
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("/v2/event/mojos-pub-quiz/193080")
        )
      ).toBe(false);
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("/v2/event/no-future-busselton/193083")
        )
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
