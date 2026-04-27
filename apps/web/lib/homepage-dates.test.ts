import { describe, expect, it } from "vitest";

import {
  accumulateTrackpadSwipe,
  DAY_SWIPE_DURATION_MS,
  formatDateHeading,
  getAdjacentDateKey,
  getDateShortcutLabel,
  getDateShortcutTarget,
  getTodayShortcutLabel,
  getTodayShortcutState,
  getDayTransition,
  getRequestedDayTransition,
  getHomepageLowerBound,
  isWeekendShortcutActiveDate,
  getPerthDateKey,
  getSwipeDirection,
  isTrackpadHorizontalIntent,
  resolveHomepageDateKey,
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

describe("getDateShortcutTarget", () => {
  it("jumps to today when that date exists", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-10", "2026-04-11", "2026-04-12"],
        "today",
        new Date("2026-04-10T02:00:00.000Z")
      )
    ).toBe("2026-04-10");
  });

  it("falls back to the nearest available day when today is inaccessible", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-11", "2026-04-12"],
        "today",
        new Date("2026-04-10T18:00:00.000Z")
      )
    ).toBe("2026-04-11");
  });

  it("prefers the upcoming Friday for the weekend shortcut on weekdays", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-08", "2026-04-10", "2026-04-11"],
        "weekend",
        new Date("2026-04-08T02:00:00.000Z")
      )
    ).toBe("2026-04-10");
  });

  it("falls through to Saturday or Sunday within the current weekend only", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-11", "2026-04-12", "2026-04-17"],
        "weekend",
        new Date("2026-04-08T02:00:00.000Z")
      )
    ).toBe("2026-04-11");
  });

  it("stays on the current Friday once the weekend has started", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-10", "2026-04-11", "2026-04-12", "2026-04-17"],
        "weekend",
        new Date("2026-04-10T04:00:00.000Z")
      )
    ).toBe("2026-04-10");
  });

  it("jumps to next Friday once the current weekend has started", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-11", "2026-04-12", "2026-04-17", "2026-04-18"],
        "weekend",
        new Date("2026-04-12T04:00:00.000Z")
      )
    ).toBe("2026-04-17");
  });

  it("falls back to the first later weekend day when next Friday is unavailable", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-11", "2026-04-12", "2026-04-18", "2026-04-20"],
        "weekend",
        new Date("2026-04-12T04:00:00.000Z")
      )
    ).toBe("2026-04-18");
  });

  it("does not fall through to a later unrelated weekend", () => {
    expect(
      getDateShortcutTarget(
        ["2026-04-17", "2026-04-18"],
        "weekend",
        new Date("2026-04-08T02:00:00.000Z")
      )
    ).toBeNull();
  });
});

describe("getDateShortcutLabel", () => {
  it("uses This weekend on weekdays", () => {
    expect(getDateShortcutLabel("weekend", new Date("2026-04-08T02:00:00.000Z"))).toBe(
      "This weekend"
    );
  });

  it("uses Next weekend once it is already Saturday or Sunday", () => {
    expect(getDateShortcutLabel("weekend", new Date("2026-04-11T04:00:00.000Z"))).toBe(
      "Next weekend"
    );
    expect(getDateShortcutLabel("weekend", new Date("2026-04-12T04:00:00.000Z"))).toBe(
      "Next weekend"
    );
  });
});

describe("getTodayShortcutLabel", () => {
  it("uses Today when the current date is accessible", () => {
    expect(
      getTodayShortcutLabel(
        ["2026-04-10", "2026-04-11"],
        new Date("2026-04-10T02:00:00.000Z")
      )
    ).toBe("Today");
  });

  it("uses Tomorrow when the nearest available date is tomorrow", () => {
    expect(
      getTodayShortcutLabel(
        ["2026-04-11", "2026-04-12"],
        new Date("2026-04-10T10:00:00.000Z")
      )
    ).toBe("Tomorrow");
  });

  it("uses Nearest day when the nearest available date is later than tomorrow", () => {
    expect(
      getTodayShortcutLabel(
        ["2026-04-12", "2026-04-13"],
        new Date("2026-04-10T10:00:00.000Z")
      )
    ).toBe("Nearest day");
  });
});

describe("getTodayShortcutState", () => {
  it("keeps the real current day as both the label and target when available", () => {
    expect(
      getTodayShortcutState(
        ["2026-04-10", "2026-04-11"],
        new Date("2026-04-10T02:00:00.000Z")
      )
    ).toEqual({
      label: "Today",
      nearestDateKey: null,
      targetDateKey: "2026-04-10",
      todayDateKey: "2026-04-10"
    });
  });

  it("uses a tomorrow fallback when today is unavailable and tomorrow has gigs", () => {
    expect(
      getTodayShortcutState(
        ["2026-04-11", "2026-04-12"],
        new Date("2026-04-10T10:00:00.000Z")
      )
    ).toEqual({
      label: "Tomorrow",
      nearestDateKey: "2026-04-11",
      targetDateKey: "2026-04-11",
      todayDateKey: null
    });
  });

  it("uses a separate nearest-day fallback when tomorrow is unavailable", () => {
    expect(
      getTodayShortcutState(
        ["2026-04-12", "2026-04-13"],
        new Date("2026-04-10T10:00:00.000Z")
      )
    ).toEqual({
      label: "Nearest day",
      nearestDateKey: "2026-04-12",
      targetDateKey: "2026-04-12",
      todayDateKey: null
    });
  });
});

describe("getRequestedDayTransition", () => {
  const availableDateKeys = [
    "2026-04-10",
    "2026-04-11",
    "2026-04-12",
    "2026-04-17"
  ];

  it("returns a next transition for later requested dates", () => {
    expect(
      getRequestedDayTransition(
        availableDateKeys,
        "2026-04-10",
        "2026-04-17"
      )
    ).toEqual({
      direction: "next",
      fromDateKey: "2026-04-10",
      toDateKey: "2026-04-17"
    });
  });

  it("returns a previous transition for earlier requested dates", () => {
    expect(
      getRequestedDayTransition(
        availableDateKeys,
        "2026-04-17",
        "2026-04-10"
      )
    ).toEqual({
      direction: "previous",
      fromDateKey: "2026-04-17",
      toDateKey: "2026-04-10"
    });
  });

  it("returns null for identical or unavailable requested dates", () => {
    expect(
      getRequestedDayTransition(
        availableDateKeys,
        "2026-04-10",
        "2026-04-10"
      )
    ).toBeNull();
    expect(
      getRequestedDayTransition(
        availableDateKeys,
        "2026-04-10",
        "2026-04-20"
      )
    ).toBeNull();
  });
});

describe("isWeekendShortcutActiveDate", () => {
  it("treats Friday through Sunday of the current weekend as active on weekdays", () => {
    const now = new Date("2026-04-08T02:00:00.000Z");

    expect(isWeekendShortcutActiveDate("2026-04-10", now)).toBe(true);
    expect(isWeekendShortcutActiveDate("2026-04-11", now)).toBe(true);
    expect(isWeekendShortcutActiveDate("2026-04-12", now)).toBe(true);
    expect(isWeekendShortcutActiveDate("2026-04-17", now)).toBe(false);
  });

  it("treats only the next weekend as active on Saturday and Sunday", () => {
    const now = new Date("2026-04-11T04:00:00.000Z");

    expect(isWeekendShortcutActiveDate("2026-04-10", now)).toBe(false);
    expect(isWeekendShortcutActiveDate("2026-04-11", now)).toBe(false);
    expect(isWeekendShortcutActiveDate("2026-04-12", now)).toBe(false);
    expect(isWeekendShortcutActiveDate("2026-04-17", now)).toBe(true);
    expect(isWeekendShortcutActiveDate("2026-04-18", now)).toBe(true);
    expect(isWeekendShortcutActiveDate("2026-04-19", now)).toBe(true);
  });
});

describe("getHomepageLowerBound", () => {
  it("uses the current Perth day start on Saturday", () => {
    expect(
      getHomepageLowerBound(new Date("2026-04-11T04:00:00.000Z")).toISOString()
    ).toBe("2026-04-10T16:00:00.000Z");
  });

  it("uses the current Perth day start on Sunday", () => {
    expect(
      getHomepageLowerBound(new Date("2026-04-12T04:00:00.000Z")).toISOString()
    ).toBe("2026-04-11T16:00:00.000Z");
  });

  it("uses the current Perth day start outside the weekend", () => {
    expect(
      getHomepageLowerBound(new Date("2026-04-08T02:00:00.000Z")).toISOString()
    ).toBe("2026-04-07T16:00:00.000Z");
  });

  it("uses the correct Perth day start when UTC is still the previous day", () => {
    expect(
      getHomepageLowerBound(new Date("2026-04-08T18:30:00.000Z")).toISOString()
    ).toBe("2026-04-08T16:00:00.000Z");
  });
});

describe("resolveHomepageDateKey", () => {
  it("uses a valid explicit date before considering a legacy shortcut", () => {
    expect(
      resolveHomepageDateKey(
        ["2026-04-10", "2026-04-11"],
        "2026-04-11",
        "today",
        new Date("2026-04-10T02:00:00.000Z")
      )
    ).toBe("2026-04-11");
  });

  it("maps legacy weekend links into the matching shortcut target", () => {
    expect(
      resolveHomepageDateKey(
        ["2026-04-11", "2026-04-12", "2026-04-17"],
        "",
        "weekend",
        new Date("2026-04-11T04:00:00.000Z")
      )
    ).toBe("2026-04-17");
  });

  it("maps legacy today links to the real current date when available", () => {
    expect(
      resolveHomepageDateKey(
        ["2026-04-10", "2026-04-11"],
        "",
        "today",
        new Date("2026-04-10T02:00:00.000Z")
      )
    ).toBe("2026-04-10");
  });

  it("maps legacy today links to the nearest future day when today is unavailable", () => {
    expect(
      resolveHomepageDateKey(
        ["2026-04-11", "2026-04-12"],
        "",
        "today",
        new Date("2026-04-10T10:00:00.000Z")
      )
    ).toBe("2026-04-11");
  });

  it("falls back to the first available day when a legacy weekend target is unavailable", () => {
    expect(
      resolveHomepageDateKey(
        ["2026-04-14", "2026-04-15", "2026-04-17"],
        "",
        "weekend",
        new Date("2026-04-08T02:00:00.000Z")
      )
    ).toBe("2026-04-14");
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
