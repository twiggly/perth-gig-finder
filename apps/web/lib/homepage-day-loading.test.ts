import { describe, expect, it } from "vitest";

import type { HomepageDayPayload } from "./homepage-day-loading";
import {
  buildHomepageDayRequestPath,
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
    const currentDays = [createDay("2026-05-02", "Sat, May 2nd")];
    const nextDay = createDay("2026-04-29", "Wed, Apr 29th");

    expect(
      mergeHomepageDayCache(currentDays, nextDay, [
        "2026-04-29",
        "2026-05-02"
      ]).map((day) => day.dateKey)
    ).toEqual(["2026-04-29", "2026-05-02"]);
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
