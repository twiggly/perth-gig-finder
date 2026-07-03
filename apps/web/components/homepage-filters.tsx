"use client";

import React, {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState
} from "react";
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
export const HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET = 10;

export function getHomepageFilterDropdownOffset(
  chipBlockOffset: number | null | undefined
): number {
  const safeChipBlockOffset =
    typeof chipBlockOffset === "number" && Number.isFinite(chipBlockOffset)
      ? Math.max(0, Math.ceil(chipBlockOffset))
      : 0;

  return HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET + safeChipBlockOffset;
}

interface HomepageFiltersProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  filterPanelId: string;
  isFilterPanelVisible: boolean;
  selectedVenues: VenueOption[];
}

export function HomepageFilters({
  activeDateKey,
  availableDateKeys,
  currentQuery,
  filterPanelId,
  isFilterPanelVisible,
  selectedVenues
}: HomepageFiltersProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const searchMenuId = useId();
  const venueDropdownId = useId();
  const filterToolbarRef = useRef<HTMLDivElement | null>(null);
  const selectedVenueChipsRef = useRef<HTMLDivElement | null>(null);
  const [filterDropdownOffset, setFilterDropdownOffset] = useState(
    HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET
  );
  const {
    removeVenue,
    selectedVenueSlugs,
    selectVenue,
    visibleSelectedVenues
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
    openSearchMenu: handleOpenSearchMenu,
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

  function getMeasuredChipBlockOffset() {
    const toolbarElement = filterToolbarRef.current;
    const chipsElement = selectedVenueChipsRef.current;

    if (!toolbarElement || !chipsElement || chipsElement.closest("[hidden]")) {
      return null;
    }

    const toolbarRect = toolbarElement.getBoundingClientRect();
    const chipsRect = chipsElement.getBoundingClientRect();

    if (chipsRect.height <= 0) {
      return null;
    }

    return Math.max(0, chipsRect.bottom - toolbarRect.bottom);
  }

  function syncFilterDropdownOffset() {
    const nextOffset = getHomepageFilterDropdownOffset(
      getMeasuredChipBlockOffset()
    );

    setFilterDropdownOffset((currentOffset) =>
      currentOffset === nextOffset ? currentOffset : nextOffset
    );
  }

  function handleOpenSearchMenu() {
    syncFilterDropdownOffset();
    openSearchMenu();
  }

  function handleToggleVenueMenu() {
    syncFilterDropdownOffset();
    toggleVenueMenu();
  }

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
    closeAllMenus();
    removeVenue(slug);
  }

  const closeAllMenusForHiddenPanel = useEffectEvent(() => {
    closeAllMenus();
  });
  const syncFilterDropdownOffsetFromEffect = useEffectEvent(() => {
    syncFilterDropdownOffset();
  });

  useEffect(() => {
    if (!isFilterPanelVisible) {
      closeAllMenusForHiddenPanel();
    }
  }, [isFilterPanelVisible]);

  useEffect(() => {
    syncFilterDropdownOffsetFromEffect();

    if (typeof window === "undefined") {
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncFilterDropdownOffsetFromEffect);

      return () => {
        window.removeEventListener("resize", syncFilterDropdownOffsetFromEffect);
      };
    }

    const observer = new ResizeObserver(() => {
      syncFilterDropdownOffsetFromEffect();
    });

    if (filterToolbarRef.current) {
      observer.observe(filterToolbarRef.current);
    }

    if (selectedVenueChipsRef.current) {
      observer.observe(selectedVenueChipsRef.current);
    }

    window.addEventListener("resize", syncFilterDropdownOffsetFromEffect);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncFilterDropdownOffsetFromEffect);
    };
  }, [isFilterPanelVisible, visibleSelectedVenues.length]);

  return (
    <>
      <Box
        component="section"
        className="filter-panel"
        data-preview-revision={previewAssetRevision}
        hidden={!isFilterPanelVisible}
        id={filterPanelId}
      >
        <div className="filter-toolbar" ref={filterToolbarRef}>
          <SearchFilterForm
            dropdownOffset={filterDropdownOffset}
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
            dropdownOffset={filterDropdownOffset}
            inputRef={venueSearchInputRef}
            isOpen={isVenueMenuOpen}
            isPending={isVenueSuggestionsPending}
            isPhoneScrollbarDevice={isPhoneVenueScrollbarDevice}
            menuId={venueDropdownId}
            menuRef={venueMenuRef}
            onClose={closeVenueMenu}
            onInputChange={handleVenueInputChange}
            onSelectVenue={handleSelectVenue}
            onTriggerClick={handleToggleVenueMenu}
            suggestions={suggestions}
            venueInput={venueInput}
          />
        </div>

        <SelectedVenueChips
          chipsRef={selectedVenueChipsRef}
          onRemoveVenue={handleRemoveVenue}
          venues={visibleSelectedVenues}
        />
      </Box>

      <div className="date-shortcut-row">
        <DateShortcutPills
          activeDateKey={currentActiveDateKey}
          availableDateKeys={availableDateKeys}
          isPending={isPending}
          now={now}
          onNavigate={navigateDateShortcut}
        />
      </div>
    </>
  );
}
