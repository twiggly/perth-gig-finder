"use client";

import React, { useState } from "react";

import type { VenueOption } from "@/lib/venues";
import { useVenueSuggestions } from "./use-venue-suggestions";

interface UseVenueFilterControlOptions {
  closeAllMenus: () => void;
  isVenueMenuOpen: boolean;
  selectedVenueSlugs: string[];
  selectVenue: (venue: VenueOption) => void;
}

export function useVenueFilterControl({
  closeAllMenus,
  isVenueMenuOpen,
  selectedVenueSlugs,
  selectVenue
}: UseVenueFilterControlOptions) {
  const [venueInput, setVenueInput] = useState("");
  const {
    isPending,
    resetSuggestions,
    suggestions
  } = useVenueSuggestions({
    input: venueInput,
    isOpen: isVenueMenuOpen,
    selectedVenueSlugs
  });

  function resetVenueControl() {
    setVenueInput("");
    resetSuggestions();
  }

  function handleVenueInputChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    setVenueInput(event.target.value);
  }

  function handleSelectVenue(venue: VenueOption) {
    closeAllMenus();
    selectVenue(venue);
  }

  return {
    handleSelectVenue,
    handleVenueInputChange,
    isVenueSuggestionsPending: isPending,
    resetVenueControl,
    suggestions,
    venueInput
  };
}
