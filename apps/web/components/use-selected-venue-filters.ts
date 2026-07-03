"use client";

import { useEffect, useState } from "react";

import type { VenueOption } from "@/lib/venues";
import type { HomepageFilterNavigate } from "./use-homepage-filter-navigation";

interface UseSelectedVenueFiltersOptions {
  navigate: HomepageFilterNavigate;
  selectedVenues: VenueOption[];
}

function getSelectedVenueSlugs(venues: VenueOption[]): string[] {
  return venues.map((venue) => venue.slug);
}

function getSelectedVenueSlugKey(venues: VenueOption[]): string {
  return getSelectedVenueSlugs(venues).join("|");
}

function getCurrentUrlVenueSlugKey(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).getAll("venue").join("|");
}

export function addSelectedVenue(
  venues: VenueOption[],
  venue: VenueOption
): VenueOption[] {
  if (venues.some((selectedVenue) => selectedVenue.slug === venue.slug)) {
    return venues;
  }

  return [...venues, venue];
}

export function removeSelectedVenue(
  venues: VenueOption[],
  slug: string
): VenueOption[] {
  return venues.filter((venue) => venue.slug !== slug);
}

export function clearSelectedVenues(): VenueOption[] {
  return [];
}

export function useSelectedVenueFilters({
  navigate,
  selectedVenues
}: UseSelectedVenueFiltersOptions) {
  const selectedVenuePropKey = getSelectedVenueSlugKey(selectedVenues);
  const [visibleSelectedVenues, setVisibleSelectedVenues] =
    useState(selectedVenues);
  const selectedVenueSlugs = getSelectedVenueSlugs(visibleSelectedVenues);

  useEffect(() => {
    const currentUrlVenueSlugKey = getCurrentUrlVenueSlugKey();

    if (
      currentUrlVenueSlugKey !== null &&
      currentUrlVenueSlugKey !== selectedVenuePropKey
    ) {
      return;
    }

    setVisibleSelectedVenues(selectedVenues);
  }, [selectedVenuePropKey]);

  function selectVenue(venue: VenueOption) {
    const nextSelectedVenues = addSelectedVenue(
      visibleSelectedVenues,
      venue
    );
    const nextVenueSlugs = getSelectedVenueSlugs(nextSelectedVenues);

    setVisibleSelectedVenues(nextSelectedVenues);
    navigate({ venues: nextVenueSlugs }, "replace");
  }

  function removeVenue(slug: string) {
    const nextSelectedVenues = removeSelectedVenue(
      visibleSelectedVenues,
      slug
    );
    const nextVenueSlugs = getSelectedVenueSlugs(nextSelectedVenues);

    setVisibleSelectedVenues(nextSelectedVenues);
    navigate({ venues: nextVenueSlugs }, "replace");
  }

  function clearVenues() {
    const nextSelectedVenues = clearSelectedVenues();

    setVisibleSelectedVenues(nextSelectedVenues);
    navigate({ venues: [] }, "replace");
  }

  return {
    clearVenues,
    removeVenue,
    selectedVenueSlugs,
    selectVenue,
    visibleSelectedVenues
  };
}
