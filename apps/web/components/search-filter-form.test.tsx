import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
import type { SearchSuggestion } from "@/lib/search-suggestion-types";

import { SearchFilterForm } from "./search-filter-form";

const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  {
    type: "search",
    icon: "search",
    label: 'Search for "spacey"',
    query: "spacey",
    subtext: null
  },
  {
    type: "gig",
    icon: "gig",
    label: "Spacey Jane",
    query: "Spacey Jane",
    subtext: "The Bird · Northbridge"
  },
  {
    type: "venue",
    icon: "venue",
    label: "Mojos Bar",
    slug: "mojos-bar",
    subtext: "Fremantle"
  }
];

function renderSearchForm({
  isLoading = false,
  isOpen = false,
  searchInput = "",
  suggestions = []
}: {
  isLoading?: boolean;
  isOpen?: boolean;
  searchInput?: string;
  suggestions?: SearchSuggestion[];
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <SearchFilterForm
        isLoading={isLoading}
        isOpen={isOpen}
        menuId="search-menu-test"
        onChange={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        onFocus={() => {}}
        onSelectSuggestion={() => {}}
        onSubmit={() => {}}
        searchInput={searchInput}
        suggestions={suggestions}
      />
    </MantineProvider>
  );
}

describe("SearchFilterForm", () => {
  it("renders the search input and placeholder when closed", () => {
    const html = renderSearchForm();

    expect(html).toContain('class="filter-toolbar__search"');
    expect(html).toContain('id="gig-search-input"');
    expect(html).toContain('placeholder="Search events &amp; artists"');
    expect(html).toContain('aria-controls="search-menu-test"');
    expect(html).not.toContain("search-menu__popover");
  });

  it("renders the clear button and mobile-clear class when a query exists", () => {
    const html = renderSearchForm({ searchInput: "spacey jane" });

    expect(html).toContain('value="spacey jane"');
    expect(html).toContain("filter-input--has-mobile-clear");
    expect(html).toContain('aria-label="Clear search"');
    expect(html).not.toContain("search-menu__popover");
  });

  it("renders the suggestion popover with options and loading status", () => {
    const html = renderSearchForm({
      isLoading: true,
      isOpen: true,
      searchInput: "spacey",
      suggestions: SEARCH_SUGGESTIONS
    });

    expect(html).toContain('id="search-menu-test"');
    expect(html).toContain('aria-label="Search suggestions"');
    expect(html).toContain("data-combobox-option");
    expect(html).toContain("search-suggestion--primary");
    expect(html).toContain("search-suggestion__icon");
    expect(html).toContain('Search for &quot;spacey&quot;');
    expect(html).toContain("Spacey Jane");
    expect(html).toContain("The Bird · Northbridge");
    expect(html).toContain("Mojos Bar");
    expect(html).toContain("Fremantle");
    expect(html).toContain("Loading suggestions…");
  });

  it("renders no popover when open with an empty query", () => {
    const html = renderSearchForm({
      isOpen: true,
      searchInput: " ",
      suggestions: SEARCH_SUGGESTIONS
    });

    expect(html).not.toContain("search-menu__popover");
  });
});
