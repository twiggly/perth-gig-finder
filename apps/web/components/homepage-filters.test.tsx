import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { VenueOption } from "@/lib/venues";

import { HomepageFilters } from "./homepage-filters";

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
  it("renders the search input and venue trigger", () => {
    const html = renderFilters({ availableDateKeys: ["2099-01-01"] });

    expect(html).toContain('id="homepage-filter-panel-test"');
    expect(html).toContain("filter-panel");
    expect(html).not.toContain('hidden=""');
    expect(html).toContain('id="gig-search-input"');
    expect(html).toContain('placeholder="Search events &amp; artists"');
    expect(html).toContain("Venues");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('class="date-pills"');
  });

  it("keeps date pills visible when the filter panel is hidden", () => {
    const html = renderFilters({
      availableDateKeys: ["2099-01-01"],
      isFilterPanelVisible: false
    });

    expect(html).toContain('id="homepage-filter-panel-test"');
    expect(html).toContain('hidden=""');
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
