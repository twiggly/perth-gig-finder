"use client";

import React, { useId } from "react";
import { Box } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import type { VenueOption } from "@/lib/venues";
import { DateShortcutPills } from "./date-shortcut-pills";
import { SearchFilterForm } from "./search-filter-form";
import { SelectedVenueChips } from "./selected-venue-chips";
import { useHomepageFilterMenus } from "./use-homepage-filter-menus";
import {
  useHomepageFilterNavigation,
  type HomepageFilterNavigate
} from "./use-homepage-filter-navigation";
import { useSearchFilterControl } from "./use-search-filter-control";
import { useSelectedVenueFilters } from "./use-selected-venue-filters";
import { useVenueFilterControl } from "./use-venue-filter-control";
import { VenueFilterMenu } from "./venue-filter-menu";

const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";
const PHONE_SCROLLBAR_MEDIA_QUERY =
  "(max-width: 640px), (hover: none) and (pointer: coarse), (any-pointer: coarse)";

interface HomepageFiltersProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  selectedVenues: VenueOption[];
}

export function HomepageFilters({
  activeDateKey,
  availableDateKeys,
  currentQuery,
  selectedVenues
}: HomepageFiltersProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const searchMenuId = useId();
  const venueDropdownId = useId();
  const {
    clearVenues,
    optimisticSelectedVenues,
    removeVenue,
    selectedVenueSlugs,
    selectVenue
  } = useSelectedVenueFilters({
    navigate: navigateSelectedVenueFilter,
    selectedVenues
  });
  const {
    currentActiveDateKey,
    isPending,
    navigate,
    navigateDateShortcut
  } = useHomepageFilterNavigation({
    activeDateKey,
    currentQuery,
    selectedVenueSlugs
  });
  const {
    closeAllMenus,
    closeSearchMenu,
    closeVenueMenu,
    isSearchMenuOpen,
    isVenueMenuOpen,
    openSearchMenu,
    searchMenuRef,
    toggleVenueMenu,
    venueMenuRef,
    venueSearchInputRef
  } = useHomepageFilterMenus({
    onSearchMenuClose: handleSearchMenuClose,
    onVenueMenuClose: handleVenueMenuClose
  });
  const isPhoneVenueScrollbarDevice = useMediaQuery(
    PHONE_SCROLLBAR_MEDIA_QUERY,
    false,
    { getInitialValueInEffect: false }
  );
  const now = new Date();
  const {
    combinedSearchSuggestions,
    handleSearchClear,
    handleSearchInputChange,
    handleSearchInputFocus,
    handleSearchSubmit,
    handleSelectSearchSuggestion,
    isLoadingSearchSuggestions,
    resetSearchControl,
    searchInput
  } = useSearchFilterControl({
    closeAllMenus,
    closeSearchMenu,
    currentQuery,
    isSearchMenuOpen,
    navigate,
    openSearchMenu,
    selectedVenueSlugs,
    selectVenue
  });
  const {
    handleSelectVenue,
    handleVenueInputChange,
    isVenueSuggestionsPending,
    resetVenueControl,
    suggestions,
    venueInput
  } = useVenueFilterControl({
    closeAllMenus,
    isVenueMenuOpen,
    selectedVenueSlugs,
    selectVenue
  });
  function handleSearchMenuClose() {
    resetSearchControl();
  }

  function handleVenueMenuClose() {
    resetVenueControl();
  }

  function navigateSelectedVenueFilter(
    ...args: Parameters<HomepageFilterNavigate>
  ) {
    navigate(...args);
  }

  function handleRemoveVenue(slug: string) {
    removeVenue(slug);
  }

  function handleClearVenues() {
    clearVenues();
  }

  return (
    <>
      <Box
        component="section"
        className="filter-panel"
        data-preview-revision={previewAssetRevision}
      >
        <div className="filter-toolbar">
          <SearchFilterForm
            formRef={searchMenuRef}
            isLoading={isLoadingSearchSuggestions}
            isOpen={isSearchMenuOpen}
            menuId={searchMenuId}
            onChange={handleSearchInputChange}
            onClear={handleSearchClear}
            onClose={closeSearchMenu}
            onFocus={handleSearchInputFocus}
            onSelectSuggestion={handleSelectSearchSuggestion}
            onSubmit={handleSearchSubmit}
            searchInput={searchInput}
            suggestions={combinedSearchSuggestions}
          />
          <VenueFilterMenu
            inputRef={venueSearchInputRef}
            isOpen={isVenueMenuOpen}
            isPending={isVenueSuggestionsPending}
            isPhoneScrollbarDevice={isPhoneVenueScrollbarDevice}
            menuId={venueDropdownId}
            menuRef={venueMenuRef}
            onClose={closeVenueMenu}
            onInputChange={handleVenueInputChange}
            onSelectVenue={handleSelectVenue}
            onTriggerClick={toggleVenueMenu}
            suggestions={suggestions}
            venueInput={venueInput}
          />
        </div>

        <SelectedVenueChips
          onClearVenues={handleClearVenues}
          onRemoveVenue={handleRemoveVenue}
          venues={optimisticSelectedVenues}
        />
      </Box>

      <DateShortcutPills
        activeDateKey={currentActiveDateKey}
        availableDateKeys={availableDateKeys}
        isPending={isPending}
        now={now}
        onNavigate={navigateDateShortcut}
      />
    </>
  );
}
