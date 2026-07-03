import { describe, expect, it } from "vitest";

import type { VenueOption } from "@/lib/venues";

import {
  addSelectedVenue,
  clearSelectedVenues,
  removeSelectedVenue
} from "./use-selected-venue-filters";

const THE_BIRD: VenueOption = {
  name: "The Bird",
  slug: "the-bird",
  suburb: "Northbridge"
};

const MOJOS: VenueOption = {
  name: "Mojos Bar",
  slug: "mojos-bar",
  suburb: "Fremantle"
};

describe("selected venue helpers", () => {
  it("appends a new venue", () => {
    expect(addSelectedVenue([THE_BIRD], MOJOS)).toEqual([THE_BIRD, MOJOS]);
  });

  it("ignores duplicate venue slugs", () => {
    expect(
      addSelectedVenue([THE_BIRD], {
        ...THE_BIRD,
        name: "The Bird Duplicate"
      })
    ).toEqual([THE_BIRD]);
  });

  it("removes a non-last venue by slug", () => {
    const selectedVenues = addSelectedVenue(
      addSelectedVenue([], THE_BIRD),
      MOJOS
    );

    expect(removeSelectedVenue(selectedVenues, THE_BIRD.slug)).toEqual([MOJOS]);
  });

  it("removes the last venue by slug", () => {
    const selectedVenues = addSelectedVenue(
      addSelectedVenue([], THE_BIRD),
      MOJOS
    );

    expect(removeSelectedVenue(selectedVenues, MOJOS.slug)).toEqual([THE_BIRD]);
  });

  it("clears all venues", () => {
    expect(clearSelectedVenues()).toEqual([]);
  });
});
