import { describe, expect, it } from "vitest";

import {
  buildHomepageFilterHref,
  getWhenBounds,
  matchesGigQuery,
  parseHomepageFilters
} from "./homepage-filters";

describe("parseHomepageFilters", () => {
  it("keeps valid date filters and repeated venue slugs", () => {
    expect(
      parseHomepageFilters({
        date: "2026-04-06",
        q: " jazz  ",
        venue: ["milk-bar", "the-bird", "milk-bar"],
        when: "weekend"
      })
    ).toEqual({
      date: "2026-04-06",
      q: "jazz",
      venueSlugs: ["milk-bar", "the-bird"],
      when: "weekend"
    });
  });

  it("falls back to all when the date filter is invalid", () => {
    expect(
      parseHomepageFilters({
        q: "funk",
        when: "tomorrow"
      })
    ).toEqual({
      date: "",
      q: "funk",
      venueSlugs: [],
      when: "all"
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
    ).toBe("/?q=funk&when=weekend&venue=milk-bar");
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

  it("keeps the active date when the submitted filters are unchanged", () => {
    expect(
      buildHomepageFilterHref("/", "q=jazz&date=2026-04-08", { q: " jazz " })
    ).toBe("/?q=jazz&date=2026-04-08");
  });
});

describe("getWhenBounds", () => {
  it("returns the next Friday to Monday window on a weekday", () => {
    const bounds = getWhenBounds("weekend", new Date("2026-04-06T02:00:00.000Z"));

    expect(bounds.startAt.toISOString()).toBe("2026-04-09T16:00:00.000Z");
    expect(bounds.endAt?.toISOString()).toBe("2026-04-12T16:00:00.000Z");
  });

  it("keeps the current weekend window on Saturday", () => {
    const bounds = getWhenBounds("weekend", new Date("2026-04-11T04:00:00.000Z"));

    expect(bounds.startAt.toISOString()).toBe("2026-04-09T16:00:00.000Z");
    expect(bounds.endAt?.toISOString()).toBe("2026-04-12T16:00:00.000Z");
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
