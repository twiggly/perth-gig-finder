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
  currentQuery?: string;
  selectedVenues?: VenueOption[];
}

function renderFilters({
  currentQuery = "",
  selectedVenues = []
}: RenderFiltersOptions = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageFilters
        activeDateKey={null}
        availableDateKeys={[]}
        currentQuery={currentQuery}
        selectedVenues={selectedVenues}
      />
    </MantineProvider>
  );
}

describe("HomepageFilters", () => {
  it("renders the search input and venue trigger", () => {
    const html = renderFilters();

    expect(html).toContain('id="gig-search-input"');
    expect(html).toContain('placeholder="Search events &amp; artists"');
    expect(html).toContain("Venues");
    expect(html).toContain('aria-haspopup="listbox"');
  });

  it("renders selected venue chips and clear-all affordance", () => {
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
    expect(html).toContain("Clear all venues");
  });

  it("renders the current query and clear search affordance", () => {
    const html = renderFilters({ currentQuery: "spacey jane" });

    expect(html).toContain('value="spacey jane"');
    expect(html).toContain('aria-label="Clear search"');
    expect(html).toContain("filter-input--has-mobile-clear");
    expect(html).toContain("Venues");
  });
});
