import { describe, expect, it } from "vitest";

import { getGigActions } from "./gig-actions";

type GigActionInput = Parameters<typeof getGigActions>[0];

function createGigActionInput(overrides: Partial<GigActionInput>): GigActionInput {
  return {
    source_url: "https://source.example.com/gig",
    ticket_url: null,
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
        label: "Buy tickets @ oztix"
      },
      {
        href: "https://venue.example.com",
        key: "venue",
        label: "View listing @ Test Venue"
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
        label: "Buy tickets @ moshtix"
      }
    ]);
  });

  it.each([
    ["https://rosemounthotel.oztix.com.au/outlet/event/show", "Buy tickets @ oztix"],
    ["https://events.humanitix.com/class-of-orb-reunion", "Buy tickets @ humanitix"],
    ["https://premier.ticketek.com.au/Shows/Show.aspx?sh=SHOW26", "Buy tickets @ ticketek"],
    ["https://www.ticketmaster.com.au/event/show", "Buy tickets @ ticketmaster"],
    ["https://tickets.avclive.com.au/outlet/event/show", "Buy tickets @ oztix"],
    ["https://tickets.393murray.com.au/outlet/event/show", "Buy tickets @ oztix"],
    [
      "https://tickets.metropolisfremantle.com.au/outlet/event/show",
      "Buy tickets @ oztix"
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
    "not a url"
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
        label: "Buy tickets @ The Ellington"
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
        label: "View listing @ The Bird"
      }
    ]);
  });

  it.each([
    ["the-ellington-jazz-club", "The Ellington Jazz Club", "View listing @ The Ellington"],
    ["four5nine-bar-rosemount", "Four5Nine Bar @ Rosemount", "View listing @ Four5Nine Bar"]
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
        label: "View listing @ The Bird"
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
        label: "View listing @ The Bird"
      }
    ]);
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
