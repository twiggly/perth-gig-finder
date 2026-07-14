import { describe, expect, it, vi } from "vitest";

import { executeSourceRun } from "../run-source";
import {
  extractEllingtonEventTimes,
  getEllingtonDetailCacheEnabled,
  getEllingtonDetailConcurrency,
  normalizeEllingtonEvent,
  normalizeEllingtonTitle,
  parseEllingtonDateTime,
  parseEllingtonEvents,
  theEllingtonSource,
  type EllingtonRestEvent
} from "../sources/the-ellington";
import { sources } from "../sources";
import { MemoryGigStore } from "./helpers/run-source-fixtures";

function createEllingtonEvent(
  overrides: Partial<EllingtonRestEvent> = {}
): EllingtonRestEvent {
  return {
    id: 172057,
    link: "https://www.ellingtonjazz.com.au/tc-events/women-in-big-band/",
    modified_gmt: "2026-03-01T04:30:00",
    title: {
      rendered: "Women in Big Band ft. Sue Bluck[br]with WAYJO &amp; Friends"
    },
    content: {
      rendered: "<p>Doors 5pm<br>Show 6pm</p><p>Big band celebration.</p>"
    },
    _embedded: {
      "wp:featuredmedia": [
        {
          source_url:
            "https://www.ellingtonjazz.com.au/wp-content/uploads/2026/03/sue.jpg?utm_source=test",
          media_details: {
            sizes: {
              full: {
                source_url:
                  "https://www.ellingtonjazz.com.au/wp-content/uploads/2026/03/sue-full.jpg"
              }
            }
          }
        }
      ],
      "wp:term": [
        [
          { taxonomy: "event_category", name: "Big Band" },
          { taxonomy: "event_category", name: "Jazz" },
          { taxonomy: "category", name: "Site News" }
        ]
      ]
    },
    ...overrides
  };
}

const DETAIL_HTML = `
  <html>
    <body>
      <div class="jet-listing-dynamic-field__content">
        Event Start Date & TIme: May 3, 2026 17:00
      </div>
      <span class="tc_event_date_title_front">
        3 May 2026 5:00 pm - 8:00 pm
      </span>
    </body>
  </html>
`;

function createDetailHtmlWithImageMarkup(markup: string): string {
  return `
    <html>
      <head>${markup}</head>
      <body>
        <div class="jet-listing-dynamic-field__content">
          Event Start Date & TIme: May 3, 2026 17:00
        </div>
        <span class="tc_event_date_title_front">
          3 May 2026 5:00 pm - 8:00 pm
        </span>
        ${markup}
      </body>
    </html>
  `;
}

describe("the ellington source adapter", () => {
  it("cleans title line-break markers without rewriting normal hyphens", () => {
    expect(
      normalizeEllingtonTitle("Post-punk Night[br]Aaron Caldwell &amp; Friends")
    ).toBe("Post-punk Night - Aaron Caldwell & Friends");
  });

  it("parses exact Perth date/times into UTC ISO strings", () => {
    expect(parseEllingtonDateTime("May 3, 2026 17:00")).toBe(
      "2026-05-03T09:00:00.000Z"
    );
    expect(parseEllingtonDateTime("3 May 2026 5:00 pm")).toBe(
      "2026-05-03T09:00:00.000Z"
    );
  });

  it("extracts start and optional end times from the event detail page", () => {
    expect(extractEllingtonEventTimes(DETAIL_HTML)).toEqual({
      startsAt: "2026-05-03T09:00:00.000Z",
      endsAt: "2026-05-03T12:00:00.000Z",
      eventStartText: "May 3, 2026 17:00",
      eventDateRangeText: "3 May 2026 5:00 pm - 8:00 pm"
    });
  });

  it("normalizes image, category, description, venue, and conservative artists", () => {
    const normalized = normalizeEllingtonEvent(createEllingtonEvent(), DETAIL_HTML);

    expect(normalized).toMatchObject({
      sourceSlug: "the-ellington",
      externalId: "172057",
      sourceUrl: "https://www.ellingtonjazz.com.au/tc-events/women-in-big-band/",
      ticketUrl: "https://www.ellingtonjazz.com.au/tc-events/women-in-big-band/",
      title: "Women in Big Band ft. Sue Bluck - with WAYJO & Friends",
      description: "Doors 5pm Show 6pm Big band celebration.",
      imageUrl:
        "https://www.ellingtonjazz.com.au/wp-content/uploads/2026/03/sue.jpg",
      status: "active",
      startsAt: "2026-05-03T09:00:00.000Z",
      startsAtPrecision: "exact",
      endsAt: "2026-05-03T12:00:00.000Z",
      venue: {
        name: "The Ellington Jazz Club",
        slug: "the-ellington-jazz-club",
        suburb: "Perth",
        address: "193 Beaufort St, Perth WA 6000",
        websiteUrl: "https://www.ellingtonjazz.com.au/"
      },
      artists: ["Sue Bluck", "WAYJO"],
      artistExtractionKind: "explicit_lineup"
    });
    expect(normalized.rawPayload).toMatchObject({
      source: "wordpress-rest",
      eventId: 172057,
      categories: ["Big Band", "Jazz"],
      detailVersion: "2026-03-01T04:30:00",
      startsAt: "2026-05-03T09:00:00.000Z",
      endsAt: "2026-05-03T12:00:00.000Z",
      eventStartText: "May 3, 2026 17:00",
      eventDateRangeText: "3 May 2026 5:00 pm - 8:00 pm"
    });
  });

  it("changes its checksum when the validated detail version changes", () => {
    const first = normalizeEllingtonEvent(
      createEllingtonEvent({ modified_gmt: "2026-05-01T10:00:00" }),
      DETAIL_HTML
    );
    const changed = normalizeEllingtonEvent(
      createEllingtonEvent({ modified_gmt: "2026-05-02T10:00:00" }),
      DETAIL_HTML
    );

    expect(changed.checksum).not.toBe(first.checksum);
    expect(changed.sourceUrl).toBe(first.sourceUrl);
  });

  it("prefers REST embedded media over detail-page image fallbacks", () => {
    const normalized = normalizeEllingtonEvent(
      createEllingtonEvent(),
      createDetailHtmlWithImageMarkup(`
        <meta property="og:image" content="https://www.ellingtonjazz.com.au/wp-content/uploads/2026/03/detail-page.jpg" />
      `)
    );

    expect(normalized.imageUrl).toBe(
      "https://www.ellingtonjazz.com.au/wp-content/uploads/2026/03/sue.jpg"
    );
  });

  it("uses detail-page meta image when REST media is unavailable", () => {
    const normalized = normalizeEllingtonEvent(
      createEllingtonEvent({
        featured_media: 156658,
        _embedded: {
          "wp:featuredmedia": [{}]
        }
      }),
      createDetailHtmlWithImageMarkup(`
        <meta property="og:image:secure_url" content="https://www.ellingtonjazz.com.au/wp-content/uploads/2025/11/Amy-FW.jpg" />
      `)
    );

    expect(normalized.imageUrl).toBe(
      "https://www.ellingtonjazz.com.au/wp-content/uploads/2025/11/Amy-FW.jpg"
    );
    expect(normalized.rawPayload).toMatchObject({
      imageUrl: "https://www.ellingtonjazz.com.au/wp-content/uploads/2025/11/Amy-FW.jpg"
    });
  });

  it("uses the Elementor featured image when meta images are absent", () => {
    const normalized = normalizeEllingtonEvent(
      createEllingtonEvent({
        _embedded: undefined
      }),
      createDetailHtmlWithImageMarkup(`
        <div class="elementor-widget-theme-post-featured-image">
          <img
            src="https://www.ellingtonjazz.com.au/wp-content/uploads/2025/08/WAJP-768x512.jpg"
            srcset="https://www.ellingtonjazz.com.au/wp-content/uploads/2025/08/WAJP-768x512.jpg 768w, https://www.ellingtonjazz.com.au/wp-content/uploads/2025/08/WAJP.jpg 2048w"
            alt=""
          />
        </div>
      `)
    );

    expect(normalized.imageUrl).toBe(
      "https://www.ellingtonjazz.com.au/wp-content/uploads/2025/08/WAJP-768x512.jpg"
    );
  });

  it("ignores tracking pixels, external images, logos, and data placeholders", () => {
    const normalized = normalizeEllingtonEvent(
      createEllingtonEvent({
        _embedded: undefined
      }),
      createDetailHtmlWithImageMarkup(`
        <meta property="og:image" content="https://images.example.com/not-ellington.jpg" />
        <link rel="preload" as="image" href="https://www.ellingtonjazz.com.au/wp-content/uploads/2020/09/logo.png" />
        <img src="https://sca-7108-adswizz.attribution.adswizz.com/fire?pixelId=test" alt="" />
        <div class="elementor-widget-theme-post-featured-image">
          <img
            src="data:image/svg+xml;base64,PHN2Zy8+"
            data-src="https://www.ellingtonjazz.com.au/wp-content/uploads/2020/09/logo.png"
            data-srcset="https://www.ellingtonjazz.com.au/wp-content/uploads/2023/08/aboriginal-flag-e1690857737339.jpg 400w"
            alt=""
          />
        </div>
        <div class="elementor-widget-theme-post-featured-image">
          <img
            src="https://www.ellingtonjazz.com.au/wp-content/uploads/2026/02/3rd-space-jams.jpg"
            alt=""
          />
        </div>
      `)
    );

    expect(normalized.imageUrl).toBe(
      "https://www.ellingtonjazz.com.au/wp-content/uploads/2026/02/3rd-space-jams.jpg"
    );
  });

  it("keeps sold-out events active while respecting explicit cancellation keywords", () => {
    const soldOut = normalizeEllingtonEvent(
      createEllingtonEvent({
        content: { rendered: "<p>SOLD OUT. Join the waitlist.</p>" }
      }),
      DETAIL_HTML
    );
    const cancelled = normalizeEllingtonEvent(
      createEllingtonEvent({
        title: { rendered: "Cancelled[br]Late Set" }
      }),
      DETAIL_HTML
    );
    const postponed = normalizeEllingtonEvent(
      createEllingtonEvent({
        title: { rendered: "Postponed[br]Late Set" }
      }),
      DETAIL_HTML
    );

    expect(soldOut.status).toBe("active");
    expect(cancelled.status).toBe("cancelled");
    expect(postponed.status).toBe("postponed");
  });

  it("counts malformed date/detail rows as parse failures", () => {
    const parsed = parseEllingtonEvents([
      {
        event: createEllingtonEvent({ id: 1 }),
        detailHtml: "<html><body>No event date here.</body></html>"
      },
      {
        event: createEllingtonEvent({ id: 2 }),
        detailHtml: DETAIL_HTML
      }
    ]);

    expect(parsed.gigs).toHaveLength(1);
    expect(parsed.gigs[0]?.externalId).toBe("2");
    expect(parsed.failedCount).toBe(1);
  });

  it("fetches WordPress REST pages and detail pages without browser automation", async () => {
    const firstEvent = createEllingtonEvent({
      id: 1,
      link: "https://www.ellingtonjazz.com.au/tc-events/first-show/"
    });
    const secondEvent = createEllingtonEvent({
      id: 2,
      link: "https://www.ellingtonjazz.com.au/tc-events/second-show/"
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.includes("/wp-json/wp/v2/tc_events")) {
        const page = new URL(url).searchParams.get("page");
        const body = JSON.stringify(page === "1" ? [firstEvent] : [secondEvent]);

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-wp-totalpages": "2"
          }
        });
      }

      return new Response(DETAIL_HTML, {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    });

    const result = await theEllingtonSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(2);
    expect(result.failedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "https://www.ellingtonjazz.com.au/wp-json/wp/v2/tc_events"
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(firstEvent.link);
    expect(fetchMock.mock.calls[3]?.[0]).toBe(secondEvent.link);
  });

  it("limits event detail page fetches to eight concurrent requests", async () => {
    const events = Array.from({ length: 9 }, (_, index) =>
      createEllingtonEvent({
        id: index + 1,
        link: `https://www.ellingtonjazz.com.au/tc-events/show-${index + 1}/`
      })
    );
    const detailUrls: string[] = [];
    let activeDetailRequests = 0;
    let maxActiveDetailRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.includes("/wp-json/wp/v2/tc_events")) {
        return new Response(JSON.stringify(events), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-wp-totalpages": "1"
          }
        });
      }

      detailUrls.push(url);
      activeDetailRequests += 1;
      maxActiveDetailRequests = Math.max(
        maxActiveDetailRequests,
        activeDetailRequests
      );

      await new Promise((resolve) => setTimeout(resolve, 5));
      activeDetailRequests -= 1;

      return new Response(DETAIL_HTML, {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    });

    const result = await theEllingtonSource.fetchListings(fetchMock);

    expect(result.gigs.map((gig) => gig.externalId)).toEqual(
      events.map((event) => String(event.id))
    );
    expect(result.failedCount).toBe(0);
    expect(maxActiveDetailRequests).toBe(8);
    expect(detailUrls).toEqual(events.map((event) => event.link));
  });

  it("reuses version-matched detail fields without changing normalized output", async () => {
    const event = createEllingtonEvent({
      id: 42,
      link: "https://www.ellingtonjazz.com.au/tc-events/cached-show/",
      modified_gmt: "2026-05-01T10:00:00"
    });
    const createFetchMock = () =>
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);

        if (url.includes("/wp-json/wp/v2/tc_events")) {
          return new Response(JSON.stringify([event]), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-wp-totalpages": "1"
            }
          });
        }

        return new Response(DETAIL_HTML, {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      });
    const coldFetch = createFetchMock();
    const cold = await theEllingtonSource.fetchListings(coldFetch, {
      async loadSourceGigPayloads() {
        return new Map();
      }
    });
    const warmFetch = createFetchMock();
    const loadSourceGigPayloads = vi.fn(async (externalIds: string[]) => {
      expect(externalIds).toEqual(["42"]);
      return new Map([["42", cold.gigs[0]!.rawPayload]]);
    });

    const warm = await theEllingtonSource.fetchListings(warmFetch, {
      loadSourceGigPayloads
    });

    expect(warm).toEqual(cold);
    expect(coldFetch).toHaveBeenCalledTimes(2);
    expect(warmFetch).toHaveBeenCalledTimes(1);
    expect(loadSourceGigPayloads).toHaveBeenCalledOnce();
  });

  it("warms the detail cache through the normal source-run persistence path", async () => {
    const event = createEllingtonEvent({
      id: 44,
      link: "https://www.ellingtonjazz.com.au/tc-events/persisted-cache-show/",
      modified_gmt: "2026-05-03T10:00:00"
    });
    let detailRequestCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.includes("/wp-json/wp/v2/tc_events")) {
        return new Response(JSON.stringify([event]), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-wp-totalpages": "1"
          }
        });
      }

      detailRequestCount += 1;
      return new Response(DETAIL_HTML, { status: 200 });
    });
    const store = new MemoryGigStore();

    await executeSourceRun(store, theEllingtonSource, fetchMock);
    await executeSourceRun(store, theEllingtonSource, fetchMock);

    expect(detailRequestCount).toBe(1);
    expect([...store.sourceGigs.values()][0]?.rawPayload).toMatchObject({
      detailVersion: "2026-05-03T10:00:00",
      startsAt: "2026-05-03T09:00:00.000Z"
    });
  });

  it("falls back to detail requests for changed or malformed cache entries", async () => {
    const event = createEllingtonEvent({
      id: 43,
      link: "https://www.ellingtonjazz.com.au/tc-events/changed-show/",
      modified_gmt: "2026-05-02T10:00:00"
    });
    const cachedPayloads = [
      {
        detailVersion: "2026-05-01T10:00:00",
        startsAt: "2026-05-03T09:00:00.000Z",
        endsAt: "2026-05-03T12:00:00.000Z",
        eventStartText: "May 3, 2026 17:00",
        eventDateRangeText: "3 May 2026 5:00 pm - 8:00 pm",
        imageUrl: null
      },
      {
        detailVersion: "2026-05-02T10:00:00",
        startsAt: "not-a-date",
        endsAt: null,
        eventStartText: "May 3, 2026 17:00",
        eventDateRangeText: null,
        imageUrl: null
      }
    ];

    for (const rawPayload of cachedPayloads) {
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        const url = String(input);

        if (url.includes("/wp-json/wp/v2/tc_events")) {
          return new Response(JSON.stringify([event]), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-wp-totalpages": "1"
            }
          });
        }

        return new Response(DETAIL_HTML, { status: 200 });
      });

      const result = await theEllingtonSource.fetchListings(fetchMock, {
        async loadSourceGigPayloads() {
          return new Map([["43", rawPayload]]);
        }
      });

      expect(result.gigs).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it("allows Ellington detail concurrency to be rolled back through configuration", () => {
    expect(getEllingtonDetailConcurrency({})).toBe(8);
    expect(
      getEllingtonDetailConcurrency({ ELLINGTON_DETAIL_CONCURRENCY: "4" })
    ).toBe(4);
  });

  it("supports disabling the Ellington detail cache", () => {
    expect(getEllingtonDetailCacheEnabled({})).toBe(true);
    expect(
      getEllingtonDetailCacheEnabled({
        ELLINGTON_DETAIL_CACHE_DISABLED: "true"
      })
    ).toBe(false);
  });

  it("counts missing links, failed detail pages, and parse failures", async () => {
    const validEvent = createEllingtonEvent({
      id: 1,
      link: "https://www.ellingtonjazz.com.au/tc-events/valid-show/"
    });
    const missingLinkEvent = createEllingtonEvent({
      id: 2,
      link: undefined
    });
    const failedDetailEvent = createEllingtonEvent({
      id: 3,
      link: "https://www.ellingtonjazz.com.au/tc-events/failed-show/"
    });
    const malformedDetailEvent = createEllingtonEvent({
      id: 4,
      link: "https://www.ellingtonjazz.com.au/tc-events/malformed-show/"
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.includes("/wp-json/wp/v2/tc_events")) {
        return new Response(
          JSON.stringify([
            validEvent,
            missingLinkEvent,
            failedDetailEvent,
            malformedDetailEvent
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-wp-totalpages": "1"
            }
          }
        );
      }

      if (url === failedDetailEvent.link) {
        return new Response("Server error", { status: 500 });
      }

      if (url === malformedDetailEvent.link) {
        return new Response("<html><body>No date here.</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }

      return new Response(DETAIL_HTML, {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    });

    const result = await theEllingtonSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(1);
    expect(result.gigs[0]?.externalId).toBe("1");
    expect(result.failedCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("is registered as an official public source", () => {
    expect(sources.map((source) => source.slug)).toContain("the-ellington");
    expect(theEllingtonSource).toMatchObject({
      slug: "the-ellington",
      name: "The Ellington",
      baseUrl: "https://www.ellingtonjazz.com.au/all-shows/",
      priority: 100,
      isPublicListingSource: true
    });
  });
});
