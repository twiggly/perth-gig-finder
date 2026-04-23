import { describe, expect, it, vi } from "vitest";

import {
  humanitixPerthMusicSource,
  normalizeHumanitixDetailPage,
  parseHumanitixDiscoveryPage
} from "../sources/humanitix-perth-music";

function buildDiscoveryPage(eventHrefs: string[], nextHref?: string): string {
  return `
    <html>
      <body>
        ${eventHrefs
          .map((href) => `<a href="${href}">Event</a>`)
          .join("\n")}
        ${nextHref ? `<a rel="next" href="${nextHref}">Next</a>` : ""}
      </body>
    </html>
  `;
}

function buildEventPage(input: {
  title: string;
  canonicalUrl: string;
  ogDescription?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  twitterLocation?: string | null;
  twitterDate?: string | null;
  eventId?: string | null;
  structuredEvents?: object | object[];
  headings?: string[];
  paragraphs?: string[];
  listItems?: string[];
}): string {
  const francisMeta = input.eventId
    ? Buffer.from(
        JSON.stringify({
          type: "event",
          environment: "production",
          itemId: input.eventId
        })
      ).toString("base64")
    : null;

  return `
    <html>
      <head>
        <meta property="og:title" content="${input.title}" />
        <meta name="description" content="${input.description ?? ""}" />
        <meta property="og:description" content="${input.ogDescription ?? ""}" />
        <meta property="og:url" content="${input.canonicalUrl}" />
        <link rel="canonical" href="${input.canonicalUrl}" />
        <meta name="image" content="${input.imageUrl ?? ""}" />
        <meta name="twitter:data1" content="${input.twitterLocation ?? ""}" />
        <meta name="twitter:data2" content="${input.twitterDate ?? ""}" />
        ${francisMeta ? `<meta name="x-francis" content="${francisMeta}" />` : ""}
        ${
          input.structuredEvents
            ? `<script type="application/ld+json">${JSON.stringify(input.structuredEvents)}</script>`
            : ""
        }
      </head>
      <body>
        <main>
          <h1 data-testid="title">${input.title}</h1>
          ${(input.headings ?? []).map((heading) => `<h2>${heading}</h2>`).join("\n")}
          ${(input.paragraphs ?? []).map((paragraph) => `<p>${paragraph}</p>`).join("\n")}
          <ul>
            ${(input.listItems ?? []).map((item) => `<li>${item}</li>`).join("\n")}
          </ul>
        </main>
      </body>
    </html>
  `;
}

function buildStructuredEvent(input: {
  title: string;
  url: string;
  startDate: string;
  endDate?: string;
  venueName: string;
  streetAddress: string;
  locality: string;
  postalCode: string;
  description?: string;
  imageUrl?: string;
  eventStatus?: string;
  offers?: Array<{ name?: string; url?: string }>;
  performers?: Array<{ name?: string; description?: string }>;
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: input.title,
    url: input.url,
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    location: {
      "@type": "Place",
      name: input.venueName,
      address: {
        "@type": "PostalAddress",
        streetAddress: input.streetAddress,
        addressLocality: input.locality,
        postalCode: input.postalCode,
        addressRegion: "WA",
        addressCountry: "AU"
      }
    },
    eventStatus: input.eventStatus ?? "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: input.description ?? "Get tickets on Humanitix - generic description.",
    image: input.imageUrl ?? "https://images.humanitix.com/i/example@seo-500.jpg",
    ...(input.offers
      ? {
          offers: input.offers.map((offer) => ({
            "@type": "Offer",
            ...(offer.name ? { name: offer.name } : {}),
            ...(offer.url ? { url: offer.url } : {})
          }))
        }
      : {}),
    ...(input.performers ? { performers: input.performers } : {})
  };
}

describe("humanitix perth music source adapter", () => {
  it("parses direct Humanitix event links and ignores non-event pages", () => {
    const parsed = parseHumanitixDiscoveryPage(
      buildDiscoveryPage([
        "https://events.humanitix.com/streets-of-your-town?hxref=au--wa--perth",
        "https://events.humanitix.com/streets-of-your-town/tickets",
        "https://events.humanitix.com/host/russk",
        "/au/events/au--wa--perth"
      ])
    );

    expect(parsed.eventUrls).toEqual([
      "https://events.humanitix.com/streets-of-your-town"
    ]);
    expect(parsed.failedCount).toBe(2);
  });

  it("normalizes a strict Perth gig with exact time, lineup artists, and ticket url", () => {
    const gigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/streets-of-your-town",
      html: buildEventPage({
        title: "Streets Of Your Town",
        canonicalUrl: "https://events.humanitix.com/streets-of-your-town",
        ogDescription: "A celebration of The Go-Betweens music with 25 live songs.",
        imageUrl: "https://images.humanitix.com/i/streets@seo-500.jpg",
        twitterLocation: "Fremantle Buffalo Club, 54 High St, Fremantle WA 6160, Australia",
        twitterDate: "Saturday 18th April 2026",
        eventId: "humanitix-event-1",
        structuredEvents: buildStructuredEvent({
          title: "Streets Of Your Town",
          url: "https://events.humanitix.com/streets-of-your-town",
          startDate: "2026-04-18T19:30:00+0800",
          endDate: "2026-04-18T22:30:00+0800",
          venueName: "Fremantle Buffalo Club",
          streetAddress: "54 High St, Fremantle WA 6160, Australia",
          locality: "Fremantle",
          postalCode: "6160",
          description: "A celebration of The Go-Betweens music with 25 live songs.",
          imageUrl: "https://images.humanitix.com/i/streets@seo-500.jpg",
          offers: [
            {
              name: "General admission",
              url: "https://events.humanitix.com/streets-of-your-town/tickets"
            }
          ],
          performers: [
            {
              name: "Perth-Based Musicians, including:",
              description: "Adrian Hoffmann\nAidan Kelly\nChris Fox"
            }
          ]
        }),
        headings: ["Description", "Lineup"],
        paragraphs: [
          "Local musicians have come together for a second time in Perth.",
          "Plus, we now have a special acoustic set to kick the evening off.",
          "If you love the Go Betweens music half as much as we do, come along."
        ],
        listItems: ["go-betweens", "bands", "alternative", "music", "live"]
      })
    });

    expect(gigs).toHaveLength(1);
    expect(gigs[0]).toMatchObject({
      sourceSlug: "humanitix-perth-music",
      externalId: "humanitix-event-1",
      title: "Streets Of Your Town",
      sourceUrl: "https://events.humanitix.com/streets-of-your-town",
      ticketUrl: "https://events.humanitix.com/streets-of-your-town/tickets",
      status: "active",
      startsAt: "2026-04-18T11:30:00.000Z",
      startsAtPrecision: "exact",
      endsAt: "2026-04-18T14:30:00.000Z",
      imageUrl: "https://images.humanitix.com/i/streets@seo-500.jpg",
      venue: {
        name: "Fremantle Buffalo Club",
        suburb: "Fremantle",
        slug: "fremantle-buffalo-club",
        address: "54 High St, Fremantle WA 6160, Australia"
      },
      artists: ["Adrian Hoffmann", "Aidan Kelly", "Chris Fox"],
      artistExtractionKind: "structured"
    });
  });

  it("falls back to date precision when Humanitix only exposes a calendar day", () => {
    const gigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/date-only-festival",
      html: buildEventPage({
        title: "Date Only Festival",
        canonicalUrl: "https://events.humanitix.com/date-only-festival",
        ogDescription: "A live music festival in Perth.",
        imageUrl: "https://images.humanitix.com/i/date-only@seo-500.jpg",
        twitterLocation: "Kings Park, Fraser Ave, West Perth WA 6005, Australia",
        twitterDate: "Friday 7th August 2026",
        eventId: "date-only-event",
        structuredEvents: buildStructuredEvent({
          title: "Date Only Festival",
          url: "https://events.humanitix.com/date-only-festival",
          startDate: "2026-08-07",
          venueName: "Kings Park",
          streetAddress: "Fraser Ave, West Perth WA 6005, Australia",
          locality: "West Perth",
          postalCode: "6005",
          description: "A live music festival in Perth.",
          performers: [{ name: "Perth Festival Ensemble" }]
        }),
        paragraphs: ["A live music festival in Perth."]
      })
    });

    expect(gigs).toHaveLength(1);
    expect(gigs[0]?.startsAt).toBe("2026-08-07T04:00:00.000Z");
    expect(gigs[0]?.startsAtPrecision).toBe("date");
  });

  it("keeps performer names while dropping sentence-like Humanitix performer descriptions", () => {
    const gigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/georgina-dacheff-single-launch",
      html: buildEventPage({
        title: "Georgina Dacheff Single Launch: KNOWING NO THING",
        canonicalUrl: "https://events.humanitix.com/georgina-dacheff-single-launch",
        ogDescription: "A single launch with support from Savanah Solomon.",
        imageUrl: "https://images.humanitix.com/i/georgina@seo-500.jpg",
        twitterLocation: "The Bird, 181 William St, Northbridge WA 6003, Australia",
        twitterDate: "Friday 24th April 2026",
        eventId: "georgina-launch",
        structuredEvents: buildStructuredEvent({
          title: "Georgina Dacheff Single Launch: KNOWING NO THING",
          url: "https://events.humanitix.com/georgina-dacheff-single-launch",
          startDate: "2026-04-24T19:30:00+0800",
          venueName: "The Bird",
          streetAddress: "181 William St, Northbridge WA 6003, Australia",
          locality: "Northbridge",
          postalCode: "6003",
          performers: [
            {
              name: "·· Georgina Dacheff ··",
              description:
                "Georgina Dacheff is an indie-folk musician and singer-songwriter from Perth, Western Australia."
            },
            {
              name: "·· Savanah Solomon ··",
              description:
                "Savanah Solomon is an Australian folk artist whose songwriting is rooted in story, place and emotional truth."
            }
          ]
        })
      })
    });

    expect(gigs).toHaveLength(1);
    expect(gigs[0]?.artists).toEqual(["Georgina Dacheff", "Savanah Solomon"]);
    expect(gigs[0]?.artistExtractionKind).toBe("structured");
  });

  it("parses lineup artists from Humanitix page sections when structured performers are missing", () => {
    const gigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/alt-thursdays",
      html: buildEventPage({
        title: "ALT//THURSDAYS",
        canonicalUrl: "https://events.humanitix.com/alt-thursdays",
        ogDescription: "A live electronic showcase in Perth.",
        imageUrl: "https://images.humanitix.com/i/alt-thursdays@seo-500.jpg",
        twitterLocation: "The Bird, 181 William St, Northbridge WA 6003, Australia",
        twitterDate: "Thursday 23rd April 2026",
        eventId: "alt-thursdays",
        structuredEvents: buildStructuredEvent({
          title: "ALT//THURSDAYS",
          url: "https://events.humanitix.com/alt-thursdays",
          startDate: "2026-04-23T18:30:00+0800",
          venueName: "The Bird",
          streetAddress: "181 William St, Northbridge WA 6003, Australia",
          locality: "Northbridge",
          postalCode: "6003",
          description: "A live electronic showcase in Perth."
        }),
        headings: ["Description", "Lineup"],
        paragraphs: ["A live electronic showcase in Perth."],
        listItems: ["Melānija", "Esper", "softwarebodyIV", "tarsier", "big trouble little china"]
      })
    });

    expect(gigs).toHaveLength(1);
    expect(gigs[0]?.artists).toEqual([
      "Melānija",
      "Esper",
      "softwarebodyIV",
      "tarsier",
      "big trouble little china"
    ]);
    expect(gigs[0]?.artistExtractionKind).toBe("parsed_text");
  });

  it("merges explicit support artists from page text with structured Humanitix performers", () => {
    const gigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/headline-artist-live",
      html: buildEventPage({
        title: "Headline Artist Live",
        canonicalUrl: "https://events.humanitix.com/headline-artist-live",
        ogDescription: "A headline set with local support acts.",
        imageUrl: "https://images.humanitix.com/i/headline-artist-live@seo-500.jpg",
        twitterLocation: "Lyric's Underground, 22 Lyric Ln, Maylands WA 6051, Australia",
        twitterDate: "Friday 1st May 2026",
        eventId: "headline-artist-live",
        structuredEvents: buildStructuredEvent({
          title: "Headline Artist Live",
          url: "https://events.humanitix.com/headline-artist-live",
          startDate: "2026-05-01T19:30:00+0800",
          venueName: "Lyric's Underground",
          streetAddress: "22 Lyric Ln, Maylands WA 6051, Australia",
          locality: "Maylands",
          postalCode: "6051",
          description: "A headline set with local support acts.",
          performers: [{ name: "Headline Artist" }]
        }),
        headings: ["Description"],
        paragraphs: ["With support from Local Friend, Second Support."]
      })
    });

    expect(gigs).toHaveLength(1);
    expect(gigs[0]?.artists).toEqual([
      "Headline Artist",
      "Local Friend",
      "Second Support"
    ]);
    expect(gigs[0]?.artistExtractionKind).toBe("structured");
  });

  it("repairs parsed Humanitix artists from stored lineup metadata", () => {
    const extraction = humanitixPerthMusicSource.repairArtists?.({
      structuredEvent: buildStructuredEvent({
        title: "ALT//THURSDAYS",
        url: "https://events.humanitix.com/alt-thursdays",
        startDate: "2026-04-23T18:30:00+0800",
        venueName: "The Bird",
        streetAddress: "181 William St, Northbridge WA 6003, Australia",
        locality: "Northbridge",
        postalCode: "6003",
        description: "A live electronic showcase in Perth."
      }) as never,
      meta: {
        pageText: [
          "A live electronic showcase in Perth.",
          "Featuring Melānija, Esper, softwarebodyIV, tarsier, big trouble little china"
        ],
        headings: ["Description", "Lineup"],
        lineupText: ["Melānija", "Esper", "softwarebodyIV", "tarsier", "big trouble little china"]
      }
    });

    expect(extraction).toEqual({
      artists: ["Melānija", "Esper", "softwarebodyIV", "tarsier", "big trouble little china"],
      artistExtractionKind: "parsed_text"
    });
  });

  it("rejects noisy non-gig Humanitix events", () => {
    const cocktailGigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/hss-cocktail-night-chrome-mirage",
      html: buildEventPage({
        title: "HSS Cocktail Night: Chrome Mirage",
        canonicalUrl: "https://events.humanitix.com/hss-cocktail-night-chrome-mirage",
        ogDescription: "Cocktails, a photobooth, and a DJ all night.",
        imageUrl: "https://images.humanitix.com/i/cocktail@seo-500.jpg",
        twitterLocation: "Raffles Hotel, 70-72 Canning Beach Rd, Applecross WA 6153, Australia",
        twitterDate: "Thursday 23rd April 2026",
        eventId: "cocktail-night",
        structuredEvents: buildStructuredEvent({
          title: "HSS Cocktail Night: Chrome Mirage",
          url: "https://events.humanitix.com/hss-cocktail-night-chrome-mirage",
          startDate: "2026-04-23T18:30:00+0800",
          endDate: "2026-04-23T23:00:00+0800",
          venueName: "Raffles Hotel",
          streetAddress: "70-72 Canning Beach Rd, Applecross WA 6153, Australia",
          locality: "Applecross",
          postalCode: "6153",
          description: "Cocktails and unforgettable moments with a DJ on the decks."
        }),
        paragraphs: [
          "Chrome Nights & Disco Lights: Get ready for a night of chrome, cocktails, and unforgettable moments.",
          "There’ll be cocktails flowing, a photobooth, and a DJ playing all night."
        ]
      })
    });

    const recurringCommunityGigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/vpcc-term-1-catch-music",
      html: buildEventPage({
        title: "VPCC Termly Catch Music",
        canonicalUrl: "https://events.humanitix.com/vpcc-term-1-catch-music",
        ogDescription:
          "Creates everyday opportunities for music-lovers of all ages, abilities, and backgrounds.",
        imageUrl: "https://images.humanitix.com/i/vpcc@seo-500.jpg",
        twitterLocation:
          "Victoria Park Community Centre, 248 Gloucester St, East Victoria Park WA 6101, Australia",
        twitterDate: "Tuesday 21st April 2026",
        eventId: "vpcc-series",
        structuredEvents: [
          buildStructuredEvent({
            title: "VPCC Termly Catch Music",
            url: "https://events.humanitix.com/vpcc-term-1-catch-music",
            startDate: "2026-04-21T17:30:00+0800",
            endDate: "2026-04-21T19:00:00+0800",
            venueName: "Victoria Park Community Centre",
            streetAddress: "248 Gloucester St, East Victoria Park WA 6101, Australia",
            locality: "East Victoria Park",
            postalCode: "6101",
            description:
              "Creates everyday opportunities for music-lovers of all ages, abilities, and backgrounds."
          }),
          buildStructuredEvent({
            title: "VPCC Termly Catch Music",
            url: "https://events.humanitix.com/vpcc-term-1-catch-music",
            startDate: "2026-04-28T17:30:00+0800",
            endDate: "2026-04-28T19:00:00+0800",
            venueName: "Victoria Park Community Centre",
            streetAddress: "248 Gloucester St, East Victoria Park WA 6101, Australia",
            locality: "East Victoria Park",
            postalCode: "6101",
            description:
              "Creates everyday opportunities for music-lovers of all ages, abilities, and backgrounds."
          })
        ],
        headings: ["Description"],
        paragraphs: [
          "Catch Music sessions run weekly, concurrently with the school terms.",
          "Your first session is free, and carers are welcome free of charge."
        ]
      })
    });

    const bridgertonBallGigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/bridgerton-ball-2026",
      html: buildEventPage({
        title: "The Bridgerton* Ball 2026",
        canonicalUrl: "https://events.humanitix.com/bridgerton-ball-2026",
        ogDescription: "An immersive ballroom evening with themed entertainment.",
        imageUrl: "https://images.humanitix.com/i/bridgerton@seo-500.jpg",
        twitterLocation: "Perth Town Hall, 601 Hay St, Perth WA 6000, Australia",
        twitterDate: "Saturday 9th May 2026",
        eventId: "bridgerton-ball",
        structuredEvents: buildStructuredEvent({
          title: "The Bridgerton* Ball 2026",
          url: "https://events.humanitix.com/bridgerton-ball-2026",
          startDate: "2026-05-09T18:30:00+0800",
          endDate: "2026-05-09T22:30:00+0800",
          venueName: "Perth Town Hall",
          streetAddress: "601 Hay St, Perth WA 6000, Australia",
          locality: "Perth",
          postalCode: "6000",
          description: "An immersive ballroom evening with themed entertainment.",
          performers: [{ name: "Perth String Quartet" }]
        }),
        headings: ["Description", "Lineup"],
        paragraphs: [
          "Step into a themed ballroom experience with costumes, dancing, and society intrigue."
        ]
      })
    });

    expect(cocktailGigs).toEqual([]);
    expect(recurringCommunityGigs).toEqual([]);
    expect(bridgertonBallGigs).toEqual([]);
  });

  it("fans recurring Humanitix event pages into separate gigs", () => {
    const gigs = normalizeHumanitixDetailPage({
      eventUrl: "https://events.humanitix.com/classical-music-club",
      html: buildEventPage({
        title: "Classical Music Club Concert Series 2026",
        canonicalUrl: "https://events.humanitix.com/classical-music-club",
        ogDescription: "A recurring chamber music concert series.",
        imageUrl: "https://images.humanitix.com/i/chamber@seo-500.jpg",
        twitterLocation: "Camelot Arts Club, 16 Lochee St, Mosman Park WA 6012, Australia",
        twitterDate: "Friday 17th April 2026",
        eventId: "classical-series",
        structuredEvents: [
          buildStructuredEvent({
            title: "Classical Music Club Concert Series 2026",
            url: "https://events.humanitix.com/classical-music-club",
            startDate: "2026-04-17T10:00:00+0800",
            endDate: "2026-04-17T12:00:00+0800",
            venueName: "Camelot Arts Club",
            streetAddress: "16 Lochee St, Mosman Park WA 6012, Australia",
            locality: "Mosman Park",
            postalCode: "6012",
            description: "A recurring chamber music concert series in Perth.",
            performers: [{ name: "Perth Chamber Players" }]
          }),
          buildStructuredEvent({
            title: "Classical Music Club Concert Series 2026",
            url: "https://events.humanitix.com/classical-music-club",
            startDate: "2026-04-24T10:00:00+0800",
            endDate: "2026-04-24T12:00:00+0800",
            venueName: "Camelot Arts Club",
            streetAddress: "16 Lochee St, Mosman Park WA 6012, Australia",
            locality: "Mosman Park",
            postalCode: "6012",
            description: "A recurring chamber music concert series in Perth.",
            performers: [{ name: "Perth Chamber Players" }]
          })
        ],
        headings: ["Description"],
        paragraphs: ["A recurring chamber music concert series in Perth."]
      })
    });

    expect(gigs.map((gig) => gig.externalId)).toEqual([
      "classical-series:2026-04-17T02:00:00.000Z",
      "classical-series:2026-04-24T02:00:00.000Z"
    ]);
    expect(gigs).toHaveLength(2);
  });

  it("dedupes discovery hits, skips filtered pages, and counts malformed detail pages", async () => {
    const discoveryMusicPage = buildDiscoveryPage([
      "https://events.humanitix.com/streets-of-your-town?hxref=au--wa--perth",
      "https://events.humanitix.com/streets-of-your-town/tickets",
      "https://events.humanitix.com/hss-cocktail-night-chrome-mirage"
    ]);
    const discoveryTrendingPage = buildDiscoveryPage([
      "https://events.humanitix.com/streets-of-your-town",
      "https://events.humanitix.com/bad-event"
    ]);
    const validGigPage = buildEventPage({
      title: "Streets Of Your Town",
      canonicalUrl: "https://events.humanitix.com/streets-of-your-town",
      ogDescription: "A celebration of The Go-Betweens music with 25 live songs.",
      imageUrl: "https://images.humanitix.com/i/streets@seo-500.jpg",
      twitterLocation: "Fremantle Buffalo Club, 54 High St, Fremantle WA 6160, Australia",
      twitterDate: "Saturday 18th April 2026",
      eventId: "humanitix-event-1",
        structuredEvents: buildStructuredEvent({
          title: "Streets Of Your Town",
          url: "https://events.humanitix.com/streets-of-your-town",
          startDate: "2026-04-18T19:30:00+0800",
          endDate: "2026-04-18T22:30:00+0800",
          venueName: "Fremantle Buffalo Club",
          streetAddress: "54 High St, Fremantle WA 6160, Australia",
          locality: "Fremantle",
          postalCode: "6160",
          description: "A celebration of The Go-Betweens music with 25 live songs.",
          imageUrl: "https://images.humanitix.com/i/streets@seo-500.jpg",
          performers: [{ name: "Chris Fox" }]
        }),
      headings: ["Description", "Lineup"],
      paragraphs: ["A celebration of The Go-Betweens music with 25 live songs."],
      listItems: ["music", "live", "bands"]
    });
    const filteredPage = buildEventPage({
      title: "HSS Cocktail Night: Chrome Mirage",
      canonicalUrl: "https://events.humanitix.com/hss-cocktail-night-chrome-mirage",
      ogDescription: "Cocktails and unforgettable moments.",
      twitterLocation: "Raffles Hotel, 70-72 Canning Beach Rd, Applecross WA 6153, Australia",
      twitterDate: "Thursday 23rd April 2026",
      structuredEvents: buildStructuredEvent({
        title: "HSS Cocktail Night: Chrome Mirage",
        url: "https://events.humanitix.com/hss-cocktail-night-chrome-mirage",
        startDate: "2026-04-23T18:30:00+0800",
        endDate: "2026-04-23T23:00:00+0800",
        venueName: "Raffles Hotel",
        streetAddress: "70-72 Canning Beach Rd, Applecross WA 6153, Australia",
        locality: "Applecross",
        postalCode: "6153",
        description: "Cocktails and unforgettable moments."
      }),
      paragraphs: ["Cocktails, a photobooth, and a DJ on the decks."]
    });
    const malformedDetailPage = buildEventPage({
      title: "Bad Event",
      canonicalUrl: "https://events.humanitix.com/bad-event",
      ogDescription: "Missing the structured event details we need."
    });

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      switch (url) {
        case "https://humanitix.com/au/events/au--wa--perth/music":
          return new Response(discoveryMusicPage, { status: 200 });
        case "https://humanitix.com/au/events/au--wa--perth/trending--music":
          return new Response(discoveryTrendingPage, { status: 200 });
        case "https://events.humanitix.com/streets-of-your-town":
          return new Response(validGigPage, { status: 200 });
        case "https://events.humanitix.com/hss-cocktail-night-chrome-mirage":
          return new Response(filteredPage, { status: 200 });
        case "https://events.humanitix.com/bad-event":
          return new Response(malformedDetailPage, { status: 200 });
        default:
          return new Response("not found", { status: 404 });
      }
    });

    const result = await humanitixPerthMusicSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(1);
    expect(result.gigs[0]?.externalId).toBe("humanitix-event-1");
    expect(result.failedCount).toBe(2);
  });
});
