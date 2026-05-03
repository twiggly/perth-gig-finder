import { describe, expect, it } from "vitest";

import type { AutocompleteSuggestion } from "@/lib/search-suggestion-types";

import {
  buildCombinedSearchSuggestions,
  buildSyntheticSearchAction
} from "./use-search-filter-control";

const FETCHED_SUGGESTIONS: AutocompleteSuggestion[] = [
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

describe("buildSyntheticSearchAction", () => {
  it("returns no action for empty or whitespace input", () => {
    expect(buildSyntheticSearchAction("")).toBeNull();
    expect(buildSyntheticSearchAction("   ")).toBeNull();
  });

  it("returns a trimmed search action", () => {
    expect(buildSyntheticSearchAction("  spacey jane  ")).toEqual({
      type: "search",
      icon: "search",
      label: 'Search for "spacey jane"',
      query: "spacey jane",
      subtext: null
    });
  });
});

describe("buildCombinedSearchSuggestions", () => {
  it("places the synthetic search action before fetched suggestions", () => {
    expect(
      buildCombinedSearchSuggestions("spacey", FETCHED_SUGGESTIONS)
    ).toEqual([
      {
        type: "search",
        icon: "search",
        label: 'Search for "spacey"',
        query: "spacey",
        subtext: null
      },
      ...FETCHED_SUGGESTIONS
    ]);
  });

  it("returns no suggestions when there is no synthetic search action", () => {
    expect(buildCombinedSearchSuggestions(" ", FETCHED_SUGGESTIONS)).toEqual([]);
  });
});
