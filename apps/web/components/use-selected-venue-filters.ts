"use client";

import { useOptimistic } from "react";

import type { VenueOption } from "@/lib/venues";
import type { HomepageFilterNavigate } from "./use-homepage-filter-navigation";

export type SelectedVenueOptimisticAction =
  | {
      type: "add";
      venue: VenueOption;
    }
  | {
      type: "remove";
      slug: string;
    }
  | {
      type: "clear";
    };

interface UseSelectedVenueFiltersOptions {
  navigate: HomepageFilterNavigate;
  selectedVenues: VenueOption[];
}

export function applySelectedVenueOptimisticAction(
  venues: VenueOption[],
  action: SelectedVenueOptimisticAction
): VenueOption[] {
  if (action.type === "clear") {
    return [];
  }

  if (action.type === "remove") {
    return venues.filter((venue) => venue.slug !== action.slug);
  }

  if (venues.some((venue) => venue.slug === action.venue.slug)) {
    return venues;
  }

  return [...venues, action.venue];
}

export function useSelectedVenueFilters({
  navigate,
  selectedVenues
}: UseSelectedVenueFiltersOptions) {
  const [optimisticSelectedVenues, addOptimisticVenueAction] = useOptimistic(
    selectedVenues,
    applySelectedVenueOptimisticAction
  );
  const selectedVenueSlugs = optimisticSelectedVenues.map((venue) => venue.slug);

  function selectVenue(venue: VenueOption) {
    const nextVenueSlugs = selectedVenueSlugs.includes(venue.slug)
      ? selectedVenueSlugs
      : [...selectedVenueSlugs, venue.slug];

    navigate(
      {
        venues: nextVenueSlugs
      },
      "replace",
      () => addOptimisticVenueAction({ type: "add", venue })
    );
  }

  function removeVenue(slug: string) {
    const nextVenueSlugs = selectedVenueSlugs.filter(
      (venueSlug) => venueSlug !== slug
    );

    navigate(
      {
        venues: nextVenueSlugs
      },
      "replace",
      () => addOptimisticVenueAction({ type: "remove", slug })
    );
  }

  function clearVenues() {
    navigate({ venues: [] }, "replace", () =>
      addOptimisticVenueAction({ type: "clear" })
    );
  }

  return {
    clearVenues,
    optimisticSelectedVenues,
    removeVenue,
    selectedVenueSlugs,
    selectVenue
  };
}
