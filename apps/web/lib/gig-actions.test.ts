import { describe, expect, it } from "vitest";

import { getGigActions } from "./gig-actions";

describe("getGigActions", () => {
  it("returns both actions when both links are available", () => {
    expect(
      getGigActions({
        ticket_url: "https://tickets.example.com/show",
        venue_website_url: "https://venue.example.com"
      })
    ).toEqual([
      {
        href: "https://tickets.example.com/show",
        key: "tickets",
        label: "Buy tickets"
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
      getGigActions({
        ticket_url: "https://tickets.example.com/show",
        venue_website_url: null
      })
    ).toEqual([
      {
        href: "https://tickets.example.com/show",
        key: "tickets",
        label: "Buy tickets"
      }
    ]);
  });

  it("returns only the venue action when only the venue website exists", () => {
    expect(
      getGigActions({
        ticket_url: null,
        venue_website_url: "https://venue.example.com"
      })
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
      getGigActions({
        ticket_url: null,
        venue_website_url: null
      })
    ).toEqual([]);
  });
});
