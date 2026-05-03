"use client";

import React, { useEffect, useState } from "react";

import type {
  AutocompleteSuggestion,
  SearchSuggestion
} from "@/lib/search-suggestion-types";
import type { VenueOption } from "@/lib/venues";
import type { HomepageFilterNavigate } from "./use-homepage-filter-navigation";
import { useSearchSuggestions } from "./use-search-suggestions";

interface UseSearchFilterControlOptions {
  closeAllMenus: () => void;
  closeSearchMenu: () => void;
  currentQuery: string;
  isSearchMenuOpen: boolean;
  navigate: HomepageFilterNavigate;
  openSearchMenu: () => void;
  selectedVenueSlugs: string[];
  selectVenue: (venue: VenueOption) => void;
}

export function buildSyntheticSearchAction(
  input: string
): SearchSuggestion | null {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return null;
  }

  return {
    type: "search",
    label: `Search for "${trimmedInput}"`,
    query: trimmedInput,
    subtext: null,
    icon: "search"
  };
}

export function buildCombinedSearchSuggestions(
  input: string,
  fetchedSuggestions: AutocompleteSuggestion[]
): SearchSuggestion[] {
  const searchAction = buildSyntheticSearchAction(input);

  return searchAction ? [searchAction, ...fetchedSuggestions] : [];
}

export function useSearchFilterControl({
  closeAllMenus,
  closeSearchMenu,
  currentQuery,
  isSearchMenuOpen,
  navigate,
  openSearchMenu,
  selectedVenueSlugs,
  selectVenue
}: UseSearchFilterControlOptions) {
  const [searchInput, setSearchInput] = useState(currentQuery);
  const {
    isLoading,
    resetSuggestions,
    suggestions
  } = useSearchSuggestions({
    input: searchInput,
    isOpen: isSearchMenuOpen,
    selectedVenueSlugs
  });
  const combinedSearchSuggestions = buildCombinedSearchSuggestions(
    searchInput,
    suggestions
  );

  useEffect(() => {
    setSearchInput(currentQuery);
    closeSearchMenu();
  }, [currentQuery]);

  function resetSearchControl() {
    resetSuggestions();
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    closeSearchMenu();
    navigate({ q: searchInput }, "push");
  }

  function handleSelectSearchSuggestion(suggestion: SearchSuggestion) {
    closeAllMenus();

    if (suggestion.type === "venue") {
      const venue = {
        slug: suggestion.slug,
        name: suggestion.label,
        suburb: suggestion.subtext
      };

      setSearchInput(currentQuery);
      selectVenue(venue);
      return;
    }

    const nextQuery = suggestion.query;
    setSearchInput(nextQuery);
    navigate({ q: nextQuery }, "push");
  }

  function handleSearchInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setSearchInput(nextValue);

    if (nextValue.trim()) {
      openSearchMenu();
      return;
    }

    closeSearchMenu();

    if (currentQuery.trim()) {
      navigate({ q: "" });
    }
  }

  function handleSearchClear() {
    setSearchInput("");
    closeSearchMenu();

    if (currentQuery.trim()) {
      navigate({ q: "" });
    }
  }

  function handleSearchInputFocus() {
    if (searchInput.trim()) {
      openSearchMenu();
    }
  }

  return {
    combinedSearchSuggestions,
    handleSearchClear,
    handleSearchInputChange,
    handleSearchInputFocus,
    handleSearchSubmit,
    handleSelectSearchSuggestion,
    isLoadingSearchSuggestions: isLoading,
    resetSearchControl,
    searchInput
  };
}
