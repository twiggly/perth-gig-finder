import { describe, expect, it } from "vitest";

import type { GigCardRecord } from "./gigs";
import { getGigActions, getGigDetailActions } from "./gig-actions";

type GigActionInput = Parameters<typeof getGigActions>[0];

function createGigActionInput(overrides: Partial<GigActionInput>): GigActionInput {
  return {
    source_url: "https://source.example.com/gig",
    ticket_url: null,
    tixel_url: null,
    venue_name: "Test Venue",
    venue_slug: "test-venue",
    venue_website_url: null,
    ...overrides
  };
}

describe("getGigActions", () => {
  it("returns both actions when both links are available", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: "https://tickets.oztix.com.au/outlet/event/show",
          venue_website_url: "https://venue.example.com"
        })
      )
    ).toEqual([
      {
        href: "https://tickets.oztix.com.au/outlet/event/show",
        key: "tickets",
        label: "Tickets @ oztix"
      },
      {
        href: "https://venue.example.com/",
        key: "venue",
        label: "Listing @ Test Venue"
      }
    ]);
  });

  it("returns only the buy action when the ticket link exists", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: "https://www.moshtix.com.au/v2/event/show/123",
          venue_website_url: null
        })
      )
    ).toEqual([
      {
        href: "https://www.moshtix.com.au/v2/event/show/123",
        key: "tickets",
        label: "Tickets @ moshtix"
      }
    ]);
  });

  it.each([
    ["https://rosemounthotel.oztix.com.au/outlet/event/show", "Tickets @ oztix"],
    ["https://events.humanitix.com/class-of-orb-reunion", "Tickets @ humanitix"],
    ["https://premier.ticketek.com.au/Shows/Show.aspx?sh=SHOW26", "Tickets @ ticketek"],
    ["https://www.ticketmaster.com.au/event/show", "Tickets @ ticketmaster"],
    [
      "https://www.eventbrite.com.au/e/karnivool-tickets-123",
      "Tickets @ eventbrite"
    ],
    [
      "https://events.eventbrite.com/e/perth-concert-tickets-456",
      "Tickets @ eventbrite"
    ],
    [
      "https://www.eventbrite.co/e/global-concert-tickets-789",
      "Tickets @ eventbrite"
    ],
    ["https://tickets.avclive.com.au/outlet/event/show", "Tickets @ oztix"],
    ["https://tickets.393murray.com.au/outlet/event/show", "Tickets @ oztix"],
    [
      "https://tickets.metropolisfremantle.com.au/outlet/event/show",
      "Tickets @ oztix"
    ]
  ])("labels ticket seller for %s", (ticketUrl, label) => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: ticketUrl
        })
      )
    ).toEqual([
      {
        href: ticketUrl,
        key: "tickets",
        label
      }
    ]);
  });

  it.each([
    "https://tickets.example.com/show",
    "https://www.ellingtonjazz.com.au/tc-events/show",
    "https://eventbrite.com.au.example.com/e/lookalike-event"
  ])(
    "falls back to a generic buy label for %s",
    (ticketUrl) => {
      expect(
        getGigActions(
          createGigActionInput({
            ticket_url: ticketUrl
          })
        )
      ).toEqual([
        {
          href: ticketUrl,
          key: "tickets",
          label: "Buy tickets"
        }
      ]);
    }
  );

  it.each([
    "not a url",
    "/tickets/show",
    "javascript:alert(1)",
    "data:text/html,<p>tickets</p>",
    "file:///tmp/tickets",
    "https://user@example.com/tickets"
  ])("omits unsafe or malformed ticket URLs: %s", (ticketUrl) => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: ticketUrl
        })
      )
    ).toEqual([]);
  });

  it("labels Ellington ticket links by venue", () => {
    const ticketUrl = "https://www.ellingtonjazz.com.au/tc-events/show";

    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: ticketUrl,
          venue_slug: "the-ellington-jazz-club"
        })
      )
    ).toEqual([
      {
        href: ticketUrl,
        key: "tickets",
        label: "Tickets @ The Ellington"
      }
    ]);
  });

  it("uses a same-domain venue listing URL for the venue action", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          source_url: "https://www.venue.example.com/events/gig",
          venue_name: "The Bird",
          venue_website_url: "https://venue.example.com/"
        })
      )
    ).toEqual([
      {
        href: "https://www.venue.example.com/events/gig",
        key: "venue",
        label: "Listing @ The Bird"
      }
    ]);
  });

  it.each([
    ["the-ellington-jazz-club", "The Ellington Jazz Club", "Listing @ The Ellington"],
    ["four5nine-bar-rosemount", "Four5Nine Bar @ Rosemount", "Listing @ Four5Nine Bar"]
  ])("shortens the venue listing label for %s", (venueSlug, venueName, label) => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          venue_name: venueName,
          venue_slug: venueSlug,
          venue_website_url: "https://venue.example.com/"
        })
      )
    ).toEqual([
      {
        href: "https://venue.example.com/",
        key: "venue",
        label
      }
    ]);
  });

  it("falls back to the venue homepage for different-domain source URLs", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          source_url: "https://tickets.example.com/events/gig",
          venue_name: "The Bird",
          venue_website_url: "https://www.williamstreetbird.com/"
        })
      )
    ).toEqual([
      {
        href: "https://www.williamstreetbird.com/",
        key: "venue",
        label: "Listing @ The Bird"
      }
    ]);
  });

  it("falls back to the venue homepage for invalid source URLs", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          source_url: "not a url",
          venue_name: "The Bird",
          venue_website_url: "https://www.williamstreetbird.com/"
        })
      )
    ).toEqual([
      {
        href: "https://www.williamstreetbird.com/",
        key: "venue",
        label: "Listing @ The Bird"
      }
    ]);
  });

  it("does not let an unsafe source URL replace a safe venue homepage", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          source_url: "javascript:alert(1)",
          venue_name: "The Bird",
          venue_website_url: "https://www.williamstreetbird.com/"
        })
      )
    ).toEqual([
      {
        href: "https://www.williamstreetbird.com/",
        key: "venue",
        label: "Listing @ The Bird"
      }
    ]);
  });

  it.each([
    "not a url",
    "/venue",
    "javascript:alert(1)",
    "data:text/html,<p>venue</p>",
    "file:///tmp/venue",
    "https://user@example.com/venue"
  ])("omits unsafe or malformed venue URLs: %s", (venueWebsiteUrl) => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          venue_website_url: venueWebsiteUrl
        })
      )
    ).toEqual([]);
  });

  it("returns no actions when neither link exists", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          venue_website_url: null
        })
      )
    ).toEqual([]);
  });
});

describe("getGigActions Tixel links", () => {
  it("inserts a Tixel action between the primary ticket and venue listing", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: "https://tickets.oztix.com.au/outlet/event/show",
          tixel_url:
            "https://tixel.com/au/music-tickets/2026/07/18/ninajirachi-the-rechabite-perth",
          venue_website_url: "https://venue.example.com"
        })
      )
    ).toEqual([
      {
        href: "https://tickets.oztix.com.au/outlet/event/show",
        key: "tickets",
        label: "Tickets @ oztix"
      },
      {
        href:
          "https://tixel.com/au/music-tickets/2026/07/18/ninajirachi-the-rechabite-perth",
        key: "tixel",
        label: "Tickets @ tixel"
      },
      {
        href: "https://venue.example.com/",
        key: "venue",
        label: "Listing @ Test Venue"
      }
    ]);
  });

  it.each([
    "https://example.com/au/music-tickets/2026/07/18/ninajirachi",
    "https://www.tixel.com/au/music-tickets/2026/07/18/ninajirachi",
    "https://tixel.com/au/music-tickets/ninajirachi",
    "https://tixel.com/au/music-tickets/2026/07/18/ninajirachi?ref=tracking",
    "javascript:alert(1)"
  ])("omits non-direct Tixel URLs: %s", (tixelUrl) => {
    expect(
      getGigActions(createGigActionInput({ tixel_url: tixelUrl }))
    ).toEqual([]);
  });
});

describe("getGigDetailActions", () => {
  function createDetailGig(
    overrides: Partial<GigCardRecord> = {}
  ): GigCardRecord {
    return {
      artist_names: [],
      ends_at: null,
      id: "gig-1",
      image_height: null,
      image_path: null,
      image_version: null,
      image_width: null,
      slug: "example-gig",
      source_image_url: null,
      source_name: "Source",
      source_url: "https://source.example.com/gig",
      starts_at: "2026-08-01T12:00:00.000Z",
      status: "active",
      ticket_url: "https://tickets.example.com/gig",
      tixel_url:
        "https://tixel.com/au/music-tickets/2026/08/01/example-gig-perth",
      title: "Example gig",
      venue_address: null,
      venue_name: "Test Venue",
      venue_slug: "test-venue",
      venue_suburb: "Perth",
      venue_website_url: "https://venue.example.com",
      ...overrides
    };
  }

  it("retains purchase actions for an active future event", () => {
    expect(
      getGigDetailActions(
        createDetailGig(),
        new Date("2026-07-20T00:00:00.000Z")
      ).map((action) => action.key)
    ).toEqual(["tickets", "tixel", "venue"]);
  });

  it.each([
    ["past", { starts_at: "2026-07-01T12:00:00.000Z" }],
    ["cancelled", { status: "cancelled" as const }],
    ["postponed", { status: "postponed" as const }]
  ])("keeps only the venue listing for %s events", (_label, overrides) => {
    expect(
      getGigDetailActions(
        createDetailGig(overrides),
        new Date("2026-07-20T00:00:00.000Z")
      ).map((action) => action.key)
    ).toEqual(["venue"]);
  });

  it("keeps the original source for archived events without a venue link", () => {
    expect(
      getGigDetailActions(
        createDetailGig({
          starts_at: "2026-07-01T12:00:00.000Z",
          venue_website_url: null
        }),
        new Date("2026-07-20T00:00:00.000Z")
      )
    ).toEqual([
      {
        href: "https://source.example.com/gig",
        key: "source",
        label: "Original listing"
      }
    ]);
  });
});
