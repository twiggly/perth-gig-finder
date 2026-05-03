import { describe, expect, it, vi } from "vitest";

import {
  extractEllingtonEventTimes,
  normalizeEllingtonEvent,
  normalizeEllingtonTitle,
  parseEllingtonDateTime,
  parseEllingtonEvents,
  theEllingtonSource,
  type EllingtonRestEvent
} from "../sources/the-ellington";
import { sources } from "../sources";

function createEllingtonEvent(
  overrides: Partial<EllingtonRestEvent> = {}
): EllingtonRestEvent {
  return {
    id: 172057,
    link: "https://www.ellingtonjazz.com.au/tc-events/women-in-big-band/",
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
      artists: [],
      artistExtractionKind: "unknown"
    });
    expect(normalized.rawPayload).toMatchObject({
      source: "wordpress-rest",
      eventId: 172057,
      categories: ["Big Band", "Jazz"],
      eventStartText: "May 3, 2026 17:00",
      eventDateRangeText: "3 May 2026 5:00 pm - 8:00 pm"
    });
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
