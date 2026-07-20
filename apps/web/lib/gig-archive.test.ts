import { describe, expect, it } from "vitest";

import {
  buildGigMonthPath,
  formatPerthMonth,
  getGigArchiveLowerBound,
  getGigDisplayState,
  getPerthMonthBounds,
  shiftPerthMonth
} from "./gig-archive";

describe("gig archive helpers", () => {
  it("uses the Perth calendar day exactly three months earlier", () => {
    expect(
      getGigArchiveLowerBound(new Date("2026-07-20T05:00:00.000Z")).toISOString()
    ).toBe("2026-04-19T16:00:00.000Z");
  });

  it("classifies active, past, cancelled, and postponed events", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const gig = {
      ends_at: null,
      starts_at: "2026-07-20T13:00:00.000Z",
      status: "active" as const
    };

    expect(getGigDisplayState(gig, now)).toBe("active");
    expect(
      getGigDisplayState({ ...gig, starts_at: now.toISOString() }, now)
    ).toBe("past");
    expect(getGigDisplayState({ ...gig, status: "cancelled" }, now)).toBe(
      "cancelled"
    );
    expect(getGigDisplayState({ ...gig, status: "postponed" }, now)).toBe(
      "postponed"
    );
  });

  it("builds valid Perth month boundaries and adjacent paths", () => {
    expect(getPerthMonthBounds(2026, 7)).toEqual({
      end: new Date("2026-07-31T16:00:00.000Z"),
      start: new Date("2026-06-30T16:00:00.000Z")
    });
    expect(getPerthMonthBounds(2026, 13)).toBeNull();
    expect(formatPerthMonth({ month: 7, year: 2026 })).toBe("July 2026");
    expect(shiftPerthMonth({ month: 1, year: 2026 }, -1)).toEqual({
      month: 12,
      year: 2025
    });
    expect(buildGigMonthPath({ month: 7, year: 2026 })).toBe(
      "/gigs/2026/07"
    );
  });
});
