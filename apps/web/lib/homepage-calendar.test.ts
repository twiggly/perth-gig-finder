import { describe, expect, it } from "vitest";

import {
  buildHomepageCalendarMonth,
  CALENDAR_WEEKDAY_LABELS,
  getHomepageCalendarMonthKeys,
  getInitialHomepageCalendarMonthKey
} from "./homepage-calendar";

describe("homepage calendar helpers", () => {
  const availableDateKeys = [
    "2026-04-29",
    "2026-05-03",
    "2026-05-07",
    "2026-06-12"
  ];

  it("uses Monday-first weekday labels for the month grid", () => {
    expect(CALENDAR_WEEKDAY_LABELS).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun"
    ]);
  });

  it("groups available gig dates into sorted month keys", () => {
    expect(getHomepageCalendarMonthKeys(availableDateKeys)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06"
    ]);
  });

  it("starts on the active month when that month has gigs", () => {
    expect(
      getInitialHomepageCalendarMonthKey("2026-05-03", availableDateKeys)
    ).toBe("2026-05");
  });

  it("falls back to the first available gig month when active date is unavailable", () => {
    expect(
      getInitialHomepageCalendarMonthKey("2026-07-01", availableDateKeys)
    ).toBe("2026-04");
  });

  it("builds a month grid and excludes adjacent-month dates", () => {
    const month = buildHomepageCalendarMonth({
      activeDateKey: "2026-05-03",
      availableDateKeys,
      monthKey: "2026-05",
      todayDateKey: "2026-05-07"
    });

    expect(month?.label).toBe("May 2026");
    expect(month?.weeks).toHaveLength(5);
    expect(month?.weeks[0]).toHaveLength(7);
    expect(month?.weeks[0]?.[0]?.dateKey).toBe("2026-05-01");
    expect(month?.weeks[0]?.[0]?.gridColumnStart).toBe(5);
    expect(month?.weeks.at(-1)?.at(-1)?.dateKey).toBe("2026-05-31");

    const flattenedDays = month?.weeks.flat() ?? [];
    const aprilLast = flattenedDays.find((day) => day.dateKey === "2026-04-30");
    const mayFirst = flattenedDays.find((day) => day.dateKey === "2026-05-01");
    const mayThird = flattenedDays.find((day) => day.dateKey === "2026-05-03");
    const maySeventh = flattenedDays.find(
      (day) => day.dateKey === "2026-05-07"
    );
    const juneFirst = flattenedDays.find((day) => day.dateKey === "2026-06-01");

    expect(aprilLast).toBeUndefined();
    expect(mayFirst).toMatchObject({
      dayOfMonth: 1,
      isCurrentMonth: true,
      isEnabled: false
    });
    expect(mayThird).toMatchObject({
      isActive: true,
      isEnabled: true
    });
    expect(maySeventh).toMatchObject({
      isEnabled: true,
      isToday: true
    });
    expect(juneFirst).toBeUndefined();
  });

  it("marks month navigation only for loaded gig months", () => {
    const april = buildHomepageCalendarMonth({
      activeDateKey: "2026-04-29",
      availableDateKeys,
      monthKey: "2026-04"
    });
    const may = buildHomepageCalendarMonth({
      activeDateKey: "2026-05-03",
      availableDateKeys,
      monthKey: "2026-05"
    });
    const june = buildHomepageCalendarMonth({
      activeDateKey: "2026-06-12",
      availableDateKeys,
      monthKey: "2026-06"
    });

    expect(april?.previousMonthKey).toBeNull();
    expect(april?.nextMonthKey).toBe("2026-05");
    expect(may?.previousMonthKey).toBe("2026-04");
    expect(may?.nextMonthKey).toBe("2026-06");
    expect(june?.previousMonthKey).toBe("2026-05");
    expect(june?.nextMonthKey).toBeNull();
  });
});
