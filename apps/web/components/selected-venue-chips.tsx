import React from "react";
import { UnstyledButton } from "@mantine/core";

import type { VenueOption } from "@/lib/venues";

interface SelectedVenueChipsProps {
  onRemoveVenue: (slug: string) => void;
  venues: VenueOption[];
}

function getVenueSummary(venue: VenueOption): string {
  return venue.suburb ? `${venue.name} · ${venue.suburb}` : venue.name;
}

export function SelectedVenueChips({
  onRemoveVenue,
  venues
}: SelectedVenueChipsProps) {
  if (venues.length === 0) {
    return null;
  }

  return (
    <div className="filter-chips" role="list" aria-label="Selected venues">
      {venues.map((venue) => (
        <UnstyledButton
          className="filter-chip"
          key={venue.slug}
          onClick={() => onRemoveVenue(venue.slug)}
          type="button"
        >
          <span>{venue.name}</span>
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove {getVenueSummary(venue)}</span>
        </UnstyledButton>
      ))}
    </div>
  );
}
