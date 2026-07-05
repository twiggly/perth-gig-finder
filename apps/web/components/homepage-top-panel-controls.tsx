"use client";

import React, { useEffect, useId, useState } from "react";

import type { VenueOption } from "@/lib/venues";
import { HOMEPAGE_BRAND_RESET_EVENT } from "./homepage-brand-reset-event";
import { HomepageFilters } from "./homepage-filters";
import { SiteHeaderPublicActions } from "./site-header-public-actions";
import type { HeaderMenuState } from "./site-header-menu";

interface HomepageTopPanelControlsProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  initialHeaderMenuState?: HeaderMenuState;
  initialFilterPanelVisible?: boolean;
  selectedVenues: VenueOption[];
}

function SearchToggleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="site-header__filter-icon site-header__filter-icon--search"
      fill="none"
      height="21"
      viewBox="0 0 24 24"
      width="21"
    >
      <circle
        cx="10.75"
        cy="10.75"
        r="5.75"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m15.25 15.25 4.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function CloseFilterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="site-header__filter-icon site-header__filter-icon--close"
      fill="none"
      height="21"
      viewBox="0 0 24 24"
      width="21"
    >
      <path
        d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

interface FilterPanelToggleButtonProps {
  controls: string;
  isExpanded: boolean;
  label: string;
  onClick: () => void;
  placement: "header" | "panel";
  showActiveFilterMarker: boolean;
}

function FilterPanelToggleButton({
  controls,
  isExpanded,
  label,
  onClick,
  placement,
  showActiveFilterMarker
}: FilterPanelToggleButtonProps) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={isExpanded}
      aria-label={label}
      className={`site-header__filter-toggle site-header__filter-toggle--homepage site-header__filter-toggle--${placement}`}
      data-active-filters={showActiveFilterMarker ? "true" : undefined}
      data-state={isExpanded ? "open" : "closed"}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="site-header__filter-icon-stack" aria-hidden="true">
        <SearchToggleIcon />
        <CloseFilterIcon />
      </span>
    </button>
  );
}

export function HomepageTopPanelControls({
  activeDateKey,
  availableDateKeys,
  currentQuery,
  initialHeaderMenuState = "closed",
  initialFilterPanelVisible = false,
  selectedVenues
}: HomepageTopPanelControlsProps) {
  const filterPanelId = useId();
  const [isFilterPanelVisible, setIsFilterPanelVisible] = useState(
    initialFilterPanelVisible
  );
  const hasActiveFilters =
    currentQuery.trim().length > 0 || selectedVenues.length > 0;
  const filterToggleLabel = isFilterPanelVisible
    ? "Hide search and venue filters"
    : "Show search and venue filters";
  const toggleFilterPanel = () => {
    setIsFilterPanelVisible((current) => !current);
  };

  useEffect(() => {
    function handleHomepageBrandReset() {
      setIsFilterPanelVisible(false);
    }

    window.addEventListener(
      HOMEPAGE_BRAND_RESET_EVENT,
      handleHomepageBrandReset
    );

    return () => {
      window.removeEventListener(
        HOMEPAGE_BRAND_RESET_EVENT,
        handleHomepageBrandReset
      );
    };
  }, []);

  return (
    <>
      <SiteHeaderPublicActions initialHeaderMenuState={initialHeaderMenuState}>
        <FilterPanelToggleButton
          controls={filterPanelId}
          isExpanded={isFilterPanelVisible}
          label={filterToggleLabel}
          onClick={toggleFilterPanel}
          placement="header"
          showActiveFilterMarker={hasActiveFilters && !isFilterPanelVisible}
        />
      </SiteHeaderPublicActions>
      <div className="top-panel__filters">
        <div
          className="top-panel__filters-layout"
          data-filter-panel-visible={
            isFilterPanelVisible ? "true" : "false"
          }
        >
          <HomepageFilters
            activeDateKey={activeDateKey}
            availableDateKeys={availableDateKeys}
            currentQuery={currentQuery}
            filterPanelId={filterPanelId}
            isFilterPanelVisible={isFilterPanelVisible}
            selectedVenues={selectedVenues}
          />
          <FilterPanelToggleButton
            controls={filterPanelId}
            isExpanded={isFilterPanelVisible}
            label={filterToggleLabel}
            onClick={toggleFilterPanel}
            placement="panel"
            showActiveFilterMarker={hasActiveFilters && !isFilterPanelVisible}
          />
        </div>
      </div>
    </>
  );
}
