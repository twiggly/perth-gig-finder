"use client";

import React, { useId, useState } from "react";

import type { VenueOption } from "@/lib/venues";
import { HomepageFilters } from "./homepage-filters";
import { SiteHeaderActions } from "./site-header-actions";

interface HomepageTopPanelControlsProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  selectedVenues: VenueOption[];
}

function SearchToggleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="site-header__filter-icon"
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

export function HomepageTopPanelControls({
  activeDateKey,
  availableDateKeys,
  currentQuery,
  selectedVenues
}: HomepageTopPanelControlsProps) {
  const filterPanelId = useId();
  const [isFilterPanelVisible, setIsFilterPanelVisible] = useState(false);
  const hasActiveFilters =
    currentQuery.trim().length > 0 || selectedVenues.length > 0;
  const filterToggleLabel = isFilterPanelVisible
    ? "Hide search and venue filters"
    : "Show search and venue filters";

  return (
    <>
      <SiteHeaderActions
        leadingAction={
          <button
            aria-controls={filterPanelId}
            aria-expanded={isFilterPanelVisible}
            aria-label={filterToggleLabel}
            className="site-header__filter-toggle"
            data-active-filters={hasActiveFilters ? "true" : undefined}
            onClick={() => setIsFilterPanelVisible((current) => !current)}
            title={filterToggleLabel}
            type="button"
          >
            <SearchToggleIcon />
          </button>
        }
      />
      <div className="top-panel__filters">
        <HomepageFilters
          activeDateKey={activeDateKey}
          availableDateKeys={availableDateKeys}
          currentQuery={currentQuery}
          filterPanelId={filterPanelId}
          isFilterPanelVisible={isFilterPanelVisible}
          selectedVenues={selectedVenues}
        />
      </div>
    </>
  );
}
