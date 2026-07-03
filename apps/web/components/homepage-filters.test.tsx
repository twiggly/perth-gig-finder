import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { VenueOption } from "@/lib/venues";

import {
  getHomepageFilterDropdownOffset,
  HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET,
  HomepageFilters
} from "./homepage-filters";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    prefetch: () => {},
    push: () => {},
    replace: () => {}
  })
}));

interface RenderFiltersOptions {
  availableDateKeys?: string[];
  currentQuery?: string;
  isFilterPanelVisible?: boolean;
  selectedVenues?: VenueOption[];
}

function renderFilters({
  availableDateKeys = [],
  currentQuery = "",
  isFilterPanelVisible = true,
  selectedVenues = []
}: RenderFiltersOptions = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageFilters
        activeDateKey={null}
        availableDateKeys={availableDateKeys}
        currentQuery={currentQuery}
        filterPanelId="homepage-filter-panel-test"
        isFilterPanelVisible={isFilterPanelVisible}
        selectedVenues={selectedVenues}
      />
    </MantineProvider>
  );
}

describe("HomepageFilters", () => {
  it("keeps the base dropdown offset without a visible chip block", () => {
    expect(getHomepageFilterDropdownOffset(null)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET
    );
    expect(getHomepageFilterDropdownOffset(undefined)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET
    );
    expect(getHomepageFilterDropdownOffset(Number.NaN)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET
    );
    expect(getHomepageFilterDropdownOffset(-12)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET
    );
    expect(getHomepageFilterDropdownOffset(0)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET
    );
  });

  it("moves dropdowns below a one-row venue chip block", () => {
    expect(getHomepageFilterDropdownOffset(46)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET + 46
    );
  });

  it("moves dropdowns below a wrapped multi-row venue chip block", () => {
    expect(getHomepageFilterDropdownOffset(108.2)).toBe(
      HOMEPAGE_FILTER_DROPDOWN_BASE_OFFSET + 109
    );
  });

  it("renders the search input and venue trigger", () => {
    const html = renderFilters({ availableDateKeys: ["2099-01-01"] });

    expect(html).toContain('id="homepage-filter-panel-test"');
    expect(html).toContain("filter-panel");
    expect(html).not.toContain('hidden=""');
    expect(html).toContain('id="gig-search-input"');
    expect(html).toContain('placeholder="Search for events"');
    expect(html).toContain("Venues");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('class="date-shortcut-row"');
    expect(html).toContain('class="date-pills"');
  });

  it("keeps date pills visible when the filter panel is hidden", () => {
    const html = renderFilters({
      availableDateKeys: ["2099-01-01"],
      isFilterPanelVisible: false
    });

    expect(html).toContain('id="homepage-filter-panel-test"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('class="date-shortcut-row"');
    expect(html).toContain('class="date-pills"');
  });

  it("renders selected venue chips without a clear-all affordance", () => {
    const html = renderFilters({
      selectedVenues: [
        {
          name: "The Bird",
          slug: "the-bird",
          suburb: "Northbridge"
        },
        {
          name: "Mojos Bar",
          slug: "mojos-bar",
          suburb: "Fremantle"
        }
      ]
    });

    expect(html).toContain('aria-label="Selected venues"');
    expect(html).toContain("The Bird");
    expect(html).toContain("Remove The Bird · Northbridge");
    expect(html).toContain("Mojos Bar");
    expect(html).not.toContain("Clear all venues");
  });

  it("renders the current query and clear search affordance", () => {
    const html = renderFilters({ currentQuery: "spacey jane" });

    expect(html).toContain('value="spacey jane"');
    expect(html).toContain('aria-label="Clear search"');
    expect(html).toContain("filter-input--has-mobile-clear");
    expect(html).toContain("Venues");
  });
});
