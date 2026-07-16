import { describe, expect, it, vi } from "vitest";

import { sources } from "../sources";
import {
  eventbritePerthMusicSource,
  extractEventbriteServerData,
  normalizeEventbriteDetailPage,
  normalizeEventbriteDiscoveryUrl,
  normalizeEventbriteEventUrl,
  parseEventbriteDiscoveryPage
} from "../sources/eventbrite-perth-music";
import type {
  EventbriteDiscoveryEvent,
  EventbriteDiscoveryListing,
  EventbriteStructuredEvent
} from "../sources/eventbrite-perth-music/types";

const DISCOVERY_URL =
  "https://www.eventbrite.com.au/d/australia--perth--4807/music--events/?page=1";
const EVENT_ID = "1985345395522";
const EVENT_URL =
  `https://www.eventbrite.com.au/e/karnivool-in-verses-australian-tour-tickets-${EVENT_ID}`;

function buildTags(input: {
  format?: string;
  category?: string;
  subcategory?: string;
  organizer?: string;
} = {}) {
  return [
    {
      prefix: "EventbriteCategory",
      tag: input.category ?? "Music",
      display_name: input.category ?? "Music"
    },
    {
      prefix: "EventbriteFormat",
      tag: input.format ?? "Concert or Performance",
      display_name: input.format ?? "Concert or Performance"
    },
    ...(input.subcategory
      ? [
          {
            prefix: "EventbriteSubCategory",
            tag: input.subcategory,
            display_name: input.subcategory
          }
        ]
      : []),
    ...(input.organizer
      ? [
          {
            prefix: "EventbriteOrganizer",
            tag: input.organizer,
            display_name: input.organizer
          }
        ]
      : [])
  ];
}

function buildDiscoveryEvent(
  overrides: Partial<EventbriteDiscoveryEvent> = {}
): EventbriteDiscoveryEvent {
  return {
    id: EVENT_ID,
    eventbrite_event_id: EVENT_ID,
    name: "Karnivool - In Verses Australian Tour",
    summary: "Karnivool live with TesseracT and Car Bomb.",
    url: `${EVENT_URL}?aff=ebdssbdestsearch`,
    start_date: "2026-07-18",
    start_time: "18:00",
    end_date: "2026-07-19",
    end_time: "00:30",
    timezone: "Australia/Perth",
    is_cancelled: false,
    is_online_event: false,
    image: {
      url: "https://img.evbuc.com/karnivool-large.jpg",
      original: {
        url: "https://img.evbuc.com/karnivool-original.jpg"
      }
    },
    primary_venue: {
      name: "Ice Cream Factory",
      address: {
        address_1: "92 Roe Street",
        city: "Northbridge",
        region: "Western Australia",
        region_code: "WA",
        postal_code: "6003",
        country: "Australia",
        country_code: "AU",
        localized_address_display:
          "92 Roe Street, Northbridge, WA 6003, Australia"
      }
    },
    tags: buildTags(),
    ...overrides
  };
}

function buildListing(
  eventOverrides: Partial<EventbriteDiscoveryEvent> = {}
): EventbriteDiscoveryListing {
  const event = buildDiscoveryEvent(eventOverrides);
  const externalId = String(event.eventbrite_event_id ?? event.id);
  const eventUrl = normalizeEventbriteEventUrl(event.url, externalId);

  if (!eventUrl) {
    throw new Error("Fixture has an invalid Eventbrite event URL");
  }

  return { externalId, eventUrl, event };
}

function buildStructuredEvent(
  overrides: Partial<EventbriteStructuredEvent> = {}
): EventbriteStructuredEvent {
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: "Karnivool - In Verses Australian Tour",
    description: "Karnivool return to Perth with TesseracT and Car Bomb.",
    url: EVENT_URL,
    startDate: "2026-07-18T18:00:00+08:00",
    endDate: "2026-07-19T00:30:00+08:00",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: "Ice Cream Factory",
      url: "https://theicecreamfactory.com.au/",
      address: {
        "@type": "PostalAddress",
        streetAddress: "92 Roe Street",
        addressLocality: "Northbridge",
        addressRegion: "WA",
        postalCode: "6003",
        addressCountry: "AU"
      }
    },
    image: [
      {
        contentUrl: "https://img.evbuc.com/karnivool-detail.jpg"
      }
    ],
    performer: [
      { "@type": "MusicGroup", name: "Karnivool" },
      { "@type": "MusicGroup", name: "TesseracT" },
      { "@type": "MusicGroup", name: "Car Bomb" }
    ],
    offers: {
      "@type": "Offer",
      url: `${EVENT_URL}?aff=oddtdtcreator`,
      price: "89.90",
      priceCurrency: "AUD"
    },
    ...overrides
  };
}

function buildDetailPage(
  structuredEvent: EventbriteStructuredEvent = buildStructuredEvent(),
  canonicalUrl = EVENT_URL
): string {
  return `
    <html>
      <head>
        <link rel="canonical" href="${canonicalUrl}" />
        <script type="application/ld+json">${JSON.stringify(structuredEvent)}</script>
      </head>
    </html>
  `;
}

function buildDiscoveryPage(input: {
  events: EventbriteDiscoveryEvent[];
  pageNumber?: number;
  pageCount?: number;
  pageSize?: number;
  objectCount?: number;
  nextHref?: string;
  itemListEvents?: EventbriteDiscoveryEvent[];
}): string {
  const pageNumber = input.pageNumber ?? 1;
  const pageCount = input.pageCount ?? 1;
  const pageSize = input.pageSize ?? Math.max(1, input.events.length);
  const objectCount = input.objectCount ?? input.events.length;
  const serverData = {
    search_data: {
      events: {
        pagination: {
          object_count: objectCount,
          page_count: pageCount,
          page_number: pageNumber,
          page_size: pageSize
        },
        results: input.events
      }
    }
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: (input.itemListEvents ?? input.events).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        url: event.url
      }
    }))
  };

  return `
    <html>
      <head>
        ${input.nextHref ? `<link rel="next" href="${input.nextHref}" />` : ""}
        <script>window.__SERVER_DATA__ = ${JSON.stringify(serverData)}; window.afterData = { ready: true };</script>
        <script type="application/ld+json">${JSON.stringify(itemList)}</script>
      </head>
    </html>
  `;
}

function buildUniqueDiscoveryEvent(index: number): EventbriteDiscoveryEvent {
  const id = String(1_985_345_395_522 + index);

  return buildDiscoveryEvent({
    id,
    eventbrite_event_id: id,
    name: `Perth Concert ${index}`,
    url: `https://www.eventbrite.com.au/e/perth-concert-${index}-tickets-${id}`
  });
}

function buildDetailForDiscoveryEvent(event: EventbriteDiscoveryEvent): string {
  return buildDetailPage(
    buildStructuredEvent({
      name: event.name,
      url: normalizeEventbriteEventUrl(event.url) ?? undefined,
      performer: []
    }),
    normalizeEventbriteEventUrl(event.url) ?? undefined
  );
}

describe("Eventbrite Perth discovery parsing", () => {
  it("extracts balanced server data with escaped strings and trailing scripts", () => {
    const title = 'DJ {Night} "Live"';
    const html = `<script>window.__SERVER_DATA__ = ${JSON.stringify({
      search_data: { title }
    })}; window.extra = { ignored: true };</script>`;

    expect(extractEventbriteServerData(html)).toMatchObject({
      search_data: { title }
    });
  });

  it("rejects missing and truncated server data", () => {
    expect(() => extractEventbriteServerData("<html></html>")).toThrow(
      "missing server data"
    );
    expect(() =>
      extractEventbriteServerData(
        '<script>window.__SERVER_DATA__ = {"search_data":{"events":</script>'
      )
    ).toThrow("incomplete");
  });

  it("parses pagination and cross-checks discovery IDs with ItemList JSON-LD", () => {
    const event = buildDiscoveryEvent();
    const parsed = parseEventbriteDiscoveryPage({
      html: buildDiscoveryPage({
        events: [event],
        pageCount: 2,
        objectCount: 2,
        nextHref: "?page=2"
      }),
      pageUrl: DISCOVERY_URL
    });

    expect(parsed.listings).toEqual([
      expect.objectContaining({
        externalId: EVENT_ID,
        eventUrl: EVENT_URL
      })
    ]);
    expect(parsed.pagination).toEqual({
      objectCount: 2,
      pageCount: 2,
      pageNumber: 1,
      pageSize: 1
    });
    expect(parsed.nextPageUrl).toBe(
      "https://www.eventbrite.com.au/d/australia--perth--4807/music--events/?page=2"
    );
    expect(parsed.failedCount).toBe(0);
  });

  it("marks ItemList mismatches and malformed pagination as failures", () => {
    const event = buildDiscoveryEvent();
    const otherEvent = buildUniqueDiscoveryEvent(3);
    const mismatch = parseEventbriteDiscoveryPage({
      html: buildDiscoveryPage({
        events: [event],
        itemListEvents: [otherEvent]
      }),
      pageUrl: DISCOVERY_URL
    });

    expect(mismatch.listings).toEqual([]);
    expect(mismatch.failedCount).toBeGreaterThan(0);

    const malformedHtml = buildDiscoveryPage({ events: [event] }).replace(
      '"page_count":1',
      '"page_count":0'
    );
    expect(() =>
      parseEventbriteDiscoveryPage({ html: malformedHtml, pageUrl: DISCOVERY_URL })
    ).toThrow("pagination is malformed");
  });

  it("allows only the exact Perth WA discovery route", () => {
    expect(normalizeEventbriteDiscoveryUrl(DISCOVERY_URL)).toBe(DISCOVERY_URL);
    expect(
      normalizeEventbriteDiscoveryUrl(
        "https://www.eventbrite.com.au/d/australia--perth/music--events/?page=1"
      )
    ).toBeNull();
    expect(
      normalizeEventbriteDiscoveryUrl(
        "https://www.eventbrite.com.au/b/australia--perth/music/?page=1"
      )
    ).toBeNull();
    expect(
      normalizeEventbriteDiscoveryUrl(
        `${DISCOVERY_URL}&tracking=1`
      )
    ).toBeNull();
  });

  it("normalizes direct Eventbrite event URLs and rejects mismatched IDs or hosts", () => {
    expect(
      normalizeEventbriteEventUrl(
        `${EVENT_URL}?aff=ebdssbdestsearch&utm_source=test#tickets`,
        EVENT_ID
      )
    ).toBe(EVENT_URL);
    expect(normalizeEventbriteEventUrl(EVENT_URL, "999")).toBeNull();
    expect(
      normalizeEventbriteEventUrl(
        `https://www.eventbrite.co/e/global-event-tickets-${EVENT_ID}`,
        EVENT_ID
      )
    ).toBe(`https://www.eventbrite.co/e/global-event-tickets-${EVENT_ID}`);
    expect(
      normalizeEventbriteEventUrl(
        `https://eventbrite.example/e/karnivool-tickets-${EVENT_ID}`,
        EVENT_ID
      )
    ).toBeNull();
    expect(
      normalizeEventbriteEventUrl(
        `https://www.eventbrite.com.au/o/promoter-${EVENT_ID}`,
        EVENT_ID
      )
    ).toBeNull();
  });
});

describe("Eventbrite detail normalization", () => {
  it("normalizes exact times, cross-midnight endings, venue, image, offers, and performers", () => {
    const gig = normalizeEventbriteDetailPage({
      html: buildDetailPage(),
      eventUrl: `${EVENT_URL}?aff=tracking`,
      listing: buildListing()
    });

    expect(gig).toMatchObject({
      sourceSlug: "eventbrite-perth-music",
      externalId: EVENT_ID,
      sourceUrl: EVENT_URL,
      ticketUrl: EVENT_URL,
      imageUrl: "https://img.evbuc.com/karnivool-detail.jpg",
      title: "Karnivool - In Verses Australian Tour",
      status: "active",
      startsAt: "2026-07-18T10:00:00.000Z",
      startsAtPrecision: "exact",
      endsAt: "2026-07-18T16:30:00.000Z",
      venue: {
        name: "Ice Cream Factory",
        slug: "ice-cream-factory",
        suburb: "Northbridge",
        address: "92 Roe Street, Northbridge, WA 6003, Australia"
      },
      artists: ["Karnivool", "TesseracT", "Car Bomb"],
      artistExtractionKind: "structured"
    });
    expect(gig?.rawPayload).toMatchObject({
      structuredEvent: {
        offers: expect.objectContaining({ price: "89.90" })
      },
      discovery: {
        eventbrite_event_id: EVENT_ID
      }
    });
  });

  it.each([
    ["https://schema.org/EventCancelled", "cancelled"],
    ["https://schema.org/EventPostponed", "postponed"],
    ["https://schema.org/EventRescheduled", "postponed"]
  ] as const)("maps %s to %s", (eventStatus, expectedStatus) => {
    const gig = normalizeEventbriteDetailPage({
      html: buildDetailPage(buildStructuredEvent({ eventStatus })),
      eventUrl: EVENT_URL,
      listing: buildListing()
    });

    expect(gig?.status).toBe(expectedStatus);
  });

  it.each([
    {
      name: "festival format",
      event: { tags: buildTags({ format: "Festival or Fair" }) },
      structured: { "@type": "Festival", performer: [] }
    },
    {
      name: "performer-backed other format",
      event: { tags: buildTags({ format: "Other" }) },
      structured: { performer: [{ name: "Karnivool" }] }
    },
    {
      name: "DJ party",
      event: {
        name: "Perth Techno Warehouse Rave",
        summary: "A late-night DJ party.",
        tags: buildTags({
          format: "Party or Social Gathering",
          subcategory: "Electronic"
        })
      },
      structured: {
        name: "Perth Techno Warehouse Rave",
        performer: []
      }
    }
  ])("accepts $name", ({ event, structured }) => {
    const gig = normalizeEventbriteDetailPage({
      html: buildDetailPage(buildStructuredEvent(structured)),
      eventUrl: EVENT_URL,
      listing: buildListing(event)
    });

    expect(gig).not.toBeNull();
  });

  it.each([
    ["Bingo Loco", "A music bingo spectacular", "Concert or Performance"],
    ["Friday Karaoke", "Sing your favourite hits", "Concert or Performance"],
    ["Drum Clinic", "A clinic for drummers", "Concert or Performance"],
    ["Album Listening Party", "Hear the new record", "Party or Social Gathering"],
    ["Silent Disco", "Dance all night", "Party or Social Gathering"],
    ["Sound Healing", "Immersive music meditation", "Concert or Performance"]
  ])("rejects non-performance activity %s", (title, summary, format) => {
    const gig = normalizeEventbriteDetailPage({
      html: buildDetailPage(
        buildStructuredEvent({ name: title, performer: [{ name: "Guest DJ" }] })
      ),
      eventUrl: EVENT_URL,
      listing: buildListing({
        name: title,
        summary,
        tags: buildTags({ format })
      })
    });

    expect(gig).toBeNull();
  });

  it("rejects online, non-WA, non-Music, and unsupported unstructured events", () => {
    const cases: Array<{
      event?: Partial<EventbriteDiscoveryEvent>;
      structured?: Partial<EventbriteStructuredEvent>;
    }> = [
      {
        event: { is_online_event: true },
        structured: {
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode"
        }
      },
      {
        event: {
          timezone: "Australia/Hobart",
          primary_venue: {
            name: "Perth Community Hall",
            address: {
              city: "Perth",
              region_code: "TAS",
              country_code: "AU"
            }
          }
        },
        structured: {
          location: {
            name: "Perth Community Hall",
            address: {
              addressLocality: "Perth",
              addressRegion: "TAS",
              addressCountry: "AU"
            }
          }
        }
      },
      {
        event: { tags: buildTags({ category: "Business" }) }
      },
      {
        event: { tags: buildTags({ format: "Other" }) },
        structured: { performer: [] }
      }
    ];

    for (const input of cases) {
      const gig = normalizeEventbriteDetailPage({
        html: buildDetailPage(buildStructuredEvent(input.structured)),
        eventUrl: EVENT_URL,
        listing: buildListing(input.event)
      });

      expect(gig).toBeNull();
    }
  });

  it("requires the structured detail event ID and Perth date to match discovery", () => {
    expect(() =>
      normalizeEventbriteDetailPage({
        html: buildDetailPage(
          buildStructuredEvent({
            url: "https://www.eventbrite.com.au/e/another-event-tickets-999"
          })
        ),
        eventUrl: EVENT_URL,
        listing: buildListing()
      })
    ).toThrow("resolve uniquely");

    expect(() =>
      normalizeEventbriteDetailPage({
        html: buildDetailPage(
          buildStructuredEvent({ startDate: "2026-07-19T18:00:00+08:00" })
        ),
        eventUrl: EVENT_URL,
        listing: buildListing()
      })
    ).toThrow("date does not match discovery");
  });

  it("repairs structured artists from the stored raw payload", () => {
    const gig = normalizeEventbriteDetailPage({
      html: buildDetailPage(),
      eventUrl: EVENT_URL,
      listing: buildListing()
    });

    expect(eventbritePerthMusicSource.repairArtists?.(gig?.rawPayload ?? null)).toEqual({
      artists: ["Karnivool", "TesseracT", "Car Bomb"],
      artistExtractionKind: "structured"
    });
    expect(eventbritePerthMusicSource.repairArtists?.({})).toEqual({
      artists: [],
      artistExtractionKind: "unknown"
    });
  });
});

describe("Eventbrite Perth source fetching", () => {
  it("crawls pages sequentially, deduplicates IDs, caps detail concurrency at four, and records metrics", async () => {
    const firstPageEvents = [0, 1, 2].map(buildUniqueDiscoveryEvent);
    const secondPageEvents = [2, 3, 4].map(buildUniqueDiscoveryEvent);
    const allEvents = [...firstPageEvents, ...secondPageEvents];
    const eventsByUrl = new Map(
      allEvents.map((event) => [normalizeEventbriteEventUrl(event.url), event])
    );
    let activeDetailRequests = 0;
    let maximumDetailRequests = 0;
    const discoveryRequestOrder: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === DISCOVERY_URL) {
        discoveryRequestOrder.push(url);
        return new Response(
          buildDiscoveryPage({
            events: firstPageEvents,
            pageCount: 2,
            pageSize: 3,
            objectCount: 5,
            nextHref: "?page=2"
          }),
          { status: 200 }
        );
      }

      if (url === `${DISCOVERY_URL.slice(0, -1)}2`) {
        discoveryRequestOrder.push(url);
        return new Response(
          buildDiscoveryPage({
            events: secondPageEvents,
            pageNumber: 2,
            pageCount: 2,
            pageSize: 3,
            objectCount: 5
          }),
          { status: 200 }
        );
      }

      const event = eventsByUrl.get(normalizeEventbriteEventUrl(url));

      if (event) {
        activeDetailRequests += 1;
        maximumDetailRequests = Math.max(maximumDetailRequests, activeDetailRequests);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeDetailRequests -= 1;
        return new Response(buildDetailForDiscoveryEvent(event), { status: 200 });
      }

      return new Response("not found", { status: 404 });
    });
    const metrics = new Map<string, number>();
    const result = await eventbritePerthMusicSource.fetchListings(fetchMock, {
      async loadSourceGigPayloads() {
        return new Map();
      },
      recordMetric(name, value) {
        metrics.set(name, value);
      }
    });

    expect(discoveryRequestOrder).toEqual([
      DISCOVERY_URL,
      `${DISCOVERY_URL.slice(0, -1)}2`
    ]);
    expect(result.gigs).toHaveLength(5);
    expect(result.failedCount).toBe(0);
    expect(maximumDetailRequests).toBe(4);
    expect(metrics).toEqual(
      new Map([
        ["eventbrite.discovery.pages", 2],
        ["eventbrite.discovery.candidates", 5],
        ["eventbrite.discovery.failed", 0],
        ["eventbrite.detail.attempted", 5],
        ["eventbrite.detail.accepted", 5],
        ["eventbrite.detail.rejected", 0],
        ["eventbrite.detail.failed", 0]
      ])
    );
  });

  it("counts incomplete discovery and detail failures", async () => {
    const events = [0, 1].map(buildUniqueDiscoveryEvent);
    const failingEventUrl = normalizeEventbriteEventUrl(events[1]?.url);
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === DISCOVERY_URL) {
        return new Response(buildDiscoveryPage({ events }), { status: 200 });
      }

      if (normalizeEventbriteEventUrl(url) === failingEventUrl) {
        return new Response("temporarily unavailable", { status: 503 });
      }

      const event = events.find(
        (candidate) =>
          normalizeEventbriteEventUrl(candidate.url) ===
          normalizeEventbriteEventUrl(url)
      );
      return event
        ? new Response(buildDetailForDiscoveryEvent(event), { status: 200 })
        : new Response("not found", { status: 404 });
    });

    const result = await eventbritePerthMusicSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(1);
    expect(result.failedCount).toBe(1);
  });

  it("counts a transient discovery failure without attempting details", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response("temporarily unavailable", { status: 503 })
    );
    const result = await eventbritePerthMusicSource.fetchListings(fetchMock);

    expect(result).toEqual({ gigs: [], failedCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("registers Eventbrite last at low priority", () => {
    expect(sources.at(-1)).toBe(eventbritePerthMusicSource);
    expect(eventbritePerthMusicSource).toMatchObject({
      slug: "eventbrite-perth-music",
      priority: 5,
      isPublicListingSource: true
    });
    expect(
      sources
        .slice(0, -1)
        .every((source) => source.priority > eventbritePerthMusicSource.priority)
    ).toBe(true);
  });
});
