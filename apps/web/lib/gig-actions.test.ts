import { describe, expect, it } from "vitest";

import { getGigActions } from "./gig-actions";

type GigActionInput = Parameters<typeof getGigActions>[0];

function createGigActionInput(overrides: Partial<GigActionInput>): GigActionInput {
  return {
    ticket_url: null,
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
        label: "Venue website"
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
        label: "Buy tickets @ the ellington"
      }
    ]);
  });

  it("returns only the venue action when only the venue website exists", () => {
    expect(
      getGigActions(
        createGigActionInput({
          ticket_url: null,
          venue_website_url: "https://venue.example.com"
        })
      )
    ).toEqual([
      {
        href: "https://venue.example.com",
        key: "venue",
        label: "Venue website"
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
