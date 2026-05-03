import { describe, expect, it } from "vitest";

import { buildSearchSuggestionsRequestPath } from "./use-search-suggestions";

describe("search suggestion helpers", () => {
  it("builds a search request path with a trimmed query", () => {
    expect(
      buildSearchSuggestionsRequestPath({
        query: "  spacey jane  "
      })
    ).toBe("/api/search-suggestions?q=spacey+jane");
  });

  it("appends selected venue slugs as repeated venue params", () => {
    expect(
      buildSearchSuggestionsRequestPath({
        query: "mojo",
        venueSlugs: ["the-bird", "mojos-bar"]
      })
    ).toBe("/api/search-suggestions?q=mojo&venue=the-bird&venue=mojos-bar");
  });

  it("does not build a fetchable path for an empty query", () => {
    expect(buildSearchSuggestionsRequestPath({ query: "" })).toBeNull();
    expect(buildSearchSuggestionsRequestPath({ query: "   " })).toBeNull();
  });
});
