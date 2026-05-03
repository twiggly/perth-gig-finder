import { describe, expect, it } from "vitest";

import { filterVenuesWithActiveFutureGigs, type VenueOption } from "./venues";

const venues: VenueOption[] = [
  {
    slug: "the-bird",
    name: "The Bird",
    suburb: "Northbridge"
  },
  {
    slug: "market-grounds",
    name: "Market Grounds",
    suburb: "Perth"
  },
  {
    slug: "si-paradiso",
    name: "Si Paradiso",
    suburb: "Highgate"
  }
];

describe("venue helpers", () => {
  it("keeps only venues with active future public gigs", () => {
    expect(
      filterVenuesWithActiveFutureGigs(
        venues,
        new Set(["the-bird", "si-paradiso"])
      )
    ).toEqual([
      {
        slug: "the-bird",
        name: "The Bird",
        suburb: "Northbridge"
      },
      {
        slug: "si-paradiso",
        name: "Si Paradiso",
        suburb: "Highgate"
      }
    ]);
  });
});
