import { describe, expect, it } from "vitest";

import {
  buildHomepageFilterHref,
  matchesGigQuery,
  parseHomepageFilters
} from "./homepage-filters";

describe("parseHomepageFilters", () => {
  it("keeps repeated venue slugs and only preserves legacy today/weekend links", () => {
    expect(
      parseHomepageFilters({
        date: "2026-04-06",
        q: " jazz  ",
        venue: ["milk-bar", "the-bird", "milk-bar"],
        when: "weekend"
      })
    ).toEqual({
      date: "2026-04-06",
      legacyWhen: "weekend",
      q: "jazz",
      venueSlugs: ["milk-bar", "the-bird"]
    });
  });

  it("drops unsupported legacy when values", () => {
    expect(
      parseHomepageFilters({
        q: "funk",
        when: "next7days"
      })
    ).toEqual({
      date: "",
      legacyWhen: null,
      q: "funk",
      venueSlugs: []
    });
  });
});

describe("buildHomepageFilterHref", () => {
  it("clears the active date when the search query changes", () => {
    expect(
      buildHomepageFilterHref(
        "/",
        "q=jazz&when=weekend&venue=milk-bar&date=2026-04-08",
        { q: "funk" }
      )
    ).toBe("/?q=funk&venue=milk-bar");
  });

  it("clears the active date when venue filters change", () => {
    expect(
      buildHomepageFilterHref(
        "/",
        "q=jazz&venue=milk-bar&date=2026-04-08",
        { venues: ["milk-bar", "the-bird"] }
      )
    ).toBe("/?q=jazz&venue=milk-bar&venue=the-bird");
  });

  it("sets the requested date and strips legacy when params", () => {
    expect(
      buildHomepageFilterHref("/", "q=jazz&when=today", { date: "2026-04-10" })
    ).toBe("/?q=jazz&date=2026-04-10");
  });

  it("keeps the active date when the submitted filters are unchanged", () => {
    expect(
      buildHomepageFilterHref("/", "q=jazz&date=2026-04-08", { q: " jazz " })
    ).toBe("/?q=jazz&date=2026-04-08");
  });
});

describe("matchesGigQuery", () => {
  const gig = {
    artist_names: ["Kiki and the Karma", "DJ HMC"],
    title: "Doctor Jazz",
    venue_name: "Milk Bar",
    venue_suburb: "Inglewood"
  };

  it("matches against titles, artists, venues, and suburbs", () => {
    expect(matchesGigQuery(gig, "doctor")).toBe(true);
    expect(matchesGigQuery(gig, "dj hmc")).toBe(true);
    expect(matchesGigQuery(gig, "milk")).toBe(true);
    expect(matchesGigQuery(gig, "inglewood")).toBe(true);
  });

  it("requires all search tokens to be present", () => {
    expect(matchesGigQuery(gig, "doctor milk")).toBe(true);
    expect(matchesGigQuery(gig, "doctor fremantle")).toBe(false);
  });
});
