import { describe, expect, it } from "vitest";

import type { VenueOption } from "@/lib/venues";

import { applySelectedVenueOptimisticAction } from "./use-selected-venue-filters";

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

describe("applySelectedVenueOptimisticAction", () => {
  it("appends a new venue", () => {
    expect(
      applySelectedVenueOptimisticAction([THE_BIRD], {
        type: "add",
        venue: MOJOS
      })
    ).toEqual([THE_BIRD, MOJOS]);
  });

  it("ignores duplicate venue slugs", () => {
    expect(
      applySelectedVenueOptimisticAction([THE_BIRD], {
        type: "add",
        venue: {
          ...THE_BIRD,
          name: "The Bird Duplicate"
        }
      })
    ).toEqual([THE_BIRD]);
  });

  it("removes a venue by slug", () => {
    expect(
      applySelectedVenueOptimisticAction([THE_BIRD, MOJOS], {
        type: "remove",
        slug: THE_BIRD.slug
      })
    ).toEqual([MOJOS]);
  });

  it("clears all venues", () => {
    expect(
      applySelectedVenueOptimisticAction([THE_BIRD, MOJOS], {
        type: "clear"
      })
    ).toEqual([]);
  });
});
