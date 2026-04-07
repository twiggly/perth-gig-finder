import { describe, expect, it } from "vitest";

import {
  accumulateTrackpadSwipe,
  DAY_SWIPE_DURATION_MS,
  formatDateHeading,
  getAdjacentDateKey,
  getDayTransition,
  getPerthDateKey,
  getSwipeDirection,
  isTrackpadHorizontalIntent,
  shouldConsumeLockedTrackpadMomentum,
  TRACKPAD_HORIZONTAL_BIAS_RATIO,
  TRACKPAD_GESTURE_LOCK_MS,
  groupItemsByPerthDate,
  resolveActiveDateKey
} from "./homepage-dates";

describe("getPerthDateKey", () => {
  it("maps UTC timestamps into the correct Perth local date", () => {
    expect(getPerthDateKey("2026-04-06T12:00:00.000Z")).toBe("2026-04-06");
    expect(getPerthDateKey("2026-04-06T17:30:00.000Z")).toBe("2026-04-07");
  });
});

describe("groupItemsByPerthDate", () => {
  it("groups gigs by Perth local day while keeping order", () => {
    const groups = groupItemsByPerthDate([
      { id: "a", starts_at: "2026-04-06T08:00:00.000Z" },
      { id: "b", starts_at: "2026-04-06T13:00:00.000Z" },
      { id: "c", starts_at: "2026-04-06T17:30:00.000Z" }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.dateKey).toBe("2026-04-06");
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[1]?.dateKey).toBe("2026-04-07");
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("formatDateHeading", () => {
  it("formats headings with month-first ordinal dates", () => {
    expect(formatDateHeading("2026-04-06")).toBe("Mon, Apr 6th");
    expect(formatDateHeading("2026-04-21")).toBe("Tue, Apr 21st");
  });
});

describe("resolveActiveDateKey", () => {
  const availableDateKeys = ["2026-04-06", "2026-04-07", "2026-04-08"];

  it("defaults to the earliest available date", () => {
    expect(resolveActiveDateKey(availableDateKeys, "")).toBe("2026-04-06");
  });

  it("falls back when the requested date is invalid or unavailable", () => {
    expect(resolveActiveDateKey(availableDateKeys, "not-a-date")).toBe("2026-04-06");
    expect(resolveActiveDateKey(availableDateKeys, "2026-04-12")).toBe("2026-04-06");
  });

  it("keeps a valid requested date", () => {
    expect(resolveActiveDateKey(availableDateKeys, "2026-04-07")).toBe("2026-04-07");
  });
});

describe("getAdjacentDateKey", () => {
  const availableDateKeys = ["2026-04-06", "2026-04-07", "2026-04-08"];

  it("returns previous and next dates when available", () => {
    expect(getAdjacentDateKey(availableDateKeys, "2026-04-07", "previous")).toBe(
      "2026-04-06"
    );
    expect(getAdjacentDateKey(availableDateKeys, "2026-04-07", "next")).toBe(
      "2026-04-08"
    );
  });

  it("returns null at the edges", () => {
    expect(getAdjacentDateKey(availableDateKeys, "2026-04-06", "previous")).toBeNull();
    expect(getAdjacentDateKey(availableDateKeys, "2026-04-08", "next")).toBeNull();
  });
});

describe("getDayTransition", () => {
  const availableDateKeys = ["2026-04-06", "2026-04-07", "2026-04-08"];

  it("returns the outgoing and incoming dates for a valid swipe", () => {
    expect(getDayTransition(availableDateKeys, "2026-04-07", "next")).toEqual({
      direction: "next",
      fromDateKey: "2026-04-07",
      toDateKey: "2026-04-08"
    });
    expect(
      getDayTransition(availableDateKeys, "2026-04-07", "previous")
    ).toEqual({
      direction: "previous",
      fromDateKey: "2026-04-07",
      toDateKey: "2026-04-06"
    });
  });

  it("returns null when the requested swipe would leave the available range", () => {
    expect(getDayTransition(availableDateKeys, "2026-04-06", "previous")).toBeNull();
    expect(getDayTransition(availableDateKeys, "2026-04-08", "next")).toBeNull();
  });
});

describe("getSwipeDirection", () => {
  it("navigates only for strong horizontal gestures", () => {
    expect(getSwipeDirection(-72, 12)).toBe("next");
    expect(getSwipeDirection(72, 10)).toBe("previous");
    expect(getSwipeDirection(20, 4)).toBeNull();
    expect(getSwipeDirection(60, 80)).toBeNull();
  });
});

describe("accumulateTrackpadSwipe", () => {
  it("accumulates horizontal deltas until the threshold is reached", () => {
    expect(accumulateTrackpadSwipe(0, -20, 2)).toEqual({
      direction: null,
      nextDelta: -20
    });
    expect(accumulateTrackpadSwipe(-20, -36, 4)).toEqual({
      direction: "previous",
      nextDelta: 0
    });
  });

  it("accepts horizontal swipes with slight vertical drift", () => {
    expect(accumulateTrackpadSwipe(0, -24, -26)).toEqual({
      direction: null,
      nextDelta: -24
    });
    expect(accumulateTrackpadSwipe(-24, -26, -24)).toEqual({
      direction: "previous",
      nextDelta: 0
    });
  });

  it("ignores mostly vertical wheel gestures", () => {
    expect(accumulateTrackpadSwipe(12, 10, 20)).toEqual({
      direction: null,
      nextDelta: 0
    });
  });

  it("produces next navigation for positive horizontal movement", () => {
    expect(accumulateTrackpadSwipe(24, 30, 6)).toEqual({
      direction: "next",
      nextDelta: 0
    });
  });
});

describe("isTrackpadHorizontalIntent", () => {
  it("treats near-horizontal trackpad swipes as intentional", () => {
    expect(isTrackpadHorizontalIntent(-30, -34)).toBe(true);
  });

  it("keeps clearly vertical gestures out of the swipe path", () => {
    expect(isTrackpadHorizontalIntent(12, 32)).toBe(false);
  });
});

describe("shouldConsumeLockedTrackpadMomentum", () => {
  it("keeps consuming continued horizontal momentum in the same direction", () => {
    expect(shouldConsumeLockedTrackpadMomentum(24, 8, "next")).toBe(true);
    expect(shouldConsumeLockedTrackpadMomentum(-24, 6, "previous")).toBe(true);
  });

  it("lets vertical scrolling pass through during the lock window", () => {
    expect(shouldConsumeLockedTrackpadMomentum(-12, 30, "next")).toBe(false);
  });

  it("ignores opposite-direction wheel motion during the lock window", () => {
    expect(shouldConsumeLockedTrackpadMomentum(-18, 4, "next")).toBe(false);
  });
});

describe("trackpad defaults", () => {
  it("uses a short swipe duration for day-to-day motion", () => {
    expect(DAY_SWIPE_DURATION_MS).toBe(300);
  });

  it("allows a little vertical drift in horizontal trackpad swipes", () => {
    expect(TRACKPAD_HORIZONTAL_BIAS_RATIO).toBe(0.85);
  });

  it("uses a single-gesture lock duration tuned for momentum", () => {
    expect(TRACKPAD_GESTURE_LOCK_MS).toBe(350);
  });
});
