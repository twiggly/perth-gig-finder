import { describe, expect, it } from "vitest";

import {
  buildVenueSuggestionsRequestPath,
  getVenueSuggestionsPendingState
} from "./use-venue-suggestions";

describe("venue suggestion helpers", () => {
  it("builds the preload request path with excluded venue slugs", () => {
    expect(
      buildVenueSuggestionsRequestPath({
        excludedSlugs: ["the-bird", "mojos-bar"]
      })
    ).toBe("/api/venues?exclude=the-bird&exclude=mojos-bar");
  });

  it("builds the search request path with a trimmed query and excluded venues", () => {
    expect(
      buildVenueSuggestionsRequestPath({
        excludedSlugs: ["the-bird"],
        query: "  northbridge  "
      })
    ).toBe("/api/venues?q=northbridge&exclude=the-bird");
  });

  it("reports pending state for loading, preloading, and deferred input lag", () => {
    expect(
      getVenueSuggestionsPendingState({
        deferredInput: "",
        input: "",
        isLoadingSuggestions: true,
        isOpen: false,
        isPreloadingSuggestions: false
      })
    ).toBe(true);

    expect(
      getVenueSuggestionsPendingState({
        deferredInput: "",
        input: "",
        isLoadingSuggestions: false,
        isOpen: true,
        isPreloadingSuggestions: true
      })
    ).toBe(true);

    expect(
      getVenueSuggestionsPendingState({
        deferredInput: "bird",
        input: "birdman",
        isLoadingSuggestions: false,
        isOpen: true,
        isPreloadingSuggestions: false
      })
    ).toBe(true);
  });

  it("does not report pending state when the menu is closed and idle", () => {
    expect(
      getVenueSuggestionsPendingState({
        deferredInput: "",
        input: "the bird",
        isLoadingSuggestions: false,
        isOpen: false,
        isPreloadingSuggestions: true
      })
    ).toBe(false);
  });
});
