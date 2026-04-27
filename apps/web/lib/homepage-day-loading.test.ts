import { describe, expect, it } from "vitest";

import type { HomepageDayPayload } from "./homepage-day-loading";
import {
  buildHomepageDayRequestPath,
  getHydratedHomepageDayDateKeys,
  getInitialHomepageDayDateKeys,
  getNextHomepageDayPrefetchDateKeys,
  isHomepageDayPayload,
  mergeHomepageDayCache
} from "./homepage-day-loading";

function createDay(dateKey: string, title: string): HomepageDayPayload {
  return {
    dateKey,
    heading: title,
    items: []
  };
}

describe("homepage day loading helpers", () => {
  const availableDateKeys = [
    "2026-04-28",
    "2026-04-29",
    "2026-04-30",
    "2026-05-01",
    "2026-05-02"
  ];

  it("selects active, previous, and next dates for initial hydration", () => {
    expect(
      getInitialHomepageDayDateKeys("2026-04-30", availableDateKeys)
    ).toEqual(["2026-04-29", "2026-04-30", "2026-05-01"]);
  });

  it("selects only active and next dates at the first available date", () => {
    expect(
      getInitialHomepageDayDateKeys("2026-04-28", availableDateKeys)
    ).toEqual(["2026-04-28", "2026-04-29"]);
  });

  it("selects only previous and active dates at the last available date", () => {
    expect(
      getInitialHomepageDayDateKeys("2026-05-02", availableDateKeys)
    ).toEqual(["2026-05-01", "2026-05-02"]);
  });

  it("does not select initial hydration dates for unavailable active dates", () => {
    expect(
      getInitialHomepageDayDateKeys("2026-05-09", availableDateKeys)
    ).toEqual([]);
  });

  it("includes shortcut target dates while preserving available-date order", () => {
    expect(
      getHydratedHomepageDayDateKeys({
        activeDateKey: "2026-04-30",
        availableDateKeys: [
          "2026-04-28",
          "2026-04-29",
          "2026-04-30",
          "2026-05-01",
          "2026-05-02",
          "2026-05-08"
        ],
        now: new Date("2026-04-28T04:00:00.000Z")
      })
    ).toEqual([
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01"
    ]);
  });

  it("dedupes shortcut targets that are already adjacent", () => {
    expect(
      getHydratedHomepageDayDateKeys({
        activeDateKey: "2026-04-29",
        availableDateKeys: [
          "2026-04-28",
          "2026-04-29",
          "2026-04-30",
          "2026-05-01"
        ],
        now: new Date("2026-04-28T04:00:00.000Z")
      })
    ).toEqual(["2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01"]);
  });

  it("includes a far nearest-day shortcut target", () => {
    expect(
      getHydratedHomepageDayDateKeys({
        activeDateKey: "2026-05-08",
        availableDateKeys: [
          "2026-04-30",
          "2026-05-01",
          "2026-05-08",
          "2026-05-09"
        ],
        now: new Date("2026-04-28T04:00:00.000Z")
      })
    ).toEqual(["2026-04-30", "2026-05-01", "2026-05-08", "2026-05-09"]);
  });

  it("includes a far weekend shortcut target", () => {
    expect(
      getHydratedHomepageDayDateKeys({
        activeDateKey: "2026-04-28",
        availableDateKeys: [
          "2026-04-28",
          "2026-04-29",
          "2026-05-01",
          "2026-05-08"
        ],
        now: new Date("2026-04-28T04:00:00.000Z")
      })
    ).toEqual(["2026-04-28", "2026-04-29", "2026-05-01"]);
  });

  it("selects the next unloaded ring around the loaded active range", () => {
    expect(
      getNextHomepageDayPrefetchDateKeys({
        activeDateKey: "2026-04-30",
        availableDateKeys,
        loadedDateKeys: ["2026-04-29", "2026-04-30", "2026-05-01"]
      })
    ).toEqual(["2026-04-28", "2026-05-02"]);
  });

  it("selects adjacent unloaded dates when only the active date is loaded", () => {
    expect(
      getNextHomepageDayPrefetchDateKeys({
        activeDateKey: "2026-04-30",
        availableDateKeys,
        loadedDateKeys: ["2026-04-30"]
      })
    ).toEqual(["2026-04-29", "2026-05-01"]);
  });

  it("builds a date-detail request path from the active filters", () => {
    expect(
      buildHomepageDayRequestPath({
        dateKey: "2026-04-29",
        query: "  AJ Hix  ",
        venueSlugs: ["the-bird", "milk-bar"]
      })
    ).toBe("/api/homepage-day?date=2026-04-29&q=AJ+Hix&venue=the-bird&venue=milk-bar");
  });

  it("merges lazy-loaded days in available-date order", () => {
    const currentDays = [
      createDay("2026-04-30", "Thu, Apr 30th"),
      createDay("2026-05-02", "Sat, May 2nd")
    ];
    const nextDay = createDay("2026-04-29", "Wed, Apr 29th");

    expect(
      mergeHomepageDayCache(currentDays, nextDay, [
        "2026-04-29",
        "2026-04-30",
        "2026-05-01",
        "2026-05-02"
      ]).map((day) => day.dateKey)
    ).toEqual(["2026-04-29", "2026-04-30", "2026-05-02"]);
  });

  it("validates the internal day payload shape", () => {
    expect(isHomepageDayPayload(createDay("2026-04-29", "Wed, Apr 29th"))).toBe(
      true
    );
    expect(isHomepageDayPayload({ dateKey: "2026-04-29", items: [] })).toBe(
      false
    );
  });
});
