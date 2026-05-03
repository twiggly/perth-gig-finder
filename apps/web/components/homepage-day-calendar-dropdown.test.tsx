import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider, Popover } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
import {
  buildHomepageCalendarMonth,
  type HomepageCalendarMonth
} from "@/lib/homepage-calendar";

import { HomepageDayCalendarDropdown } from "./homepage-day-calendar-dropdown";

function createCalendarMonth(): HomepageCalendarMonth {
  const month = buildHomepageCalendarMonth({
    activeDateKey: "2026-05-02",
    availableDateKeys: ["2026-05-02", "2026-05-03"],
    monthKey: "2026-05",
    todayDateKey: "2026-05-03"
  });

  if (!month) {
    throw new Error("Expected calendar month fixture to build.");
  }

  return month;
}

function renderDropdown(calendarMonth = createCalendarMonth()) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <Popover opened withinPortal={false}>
        <Popover.Target>
          <button type="button">Choose date</button>
        </Popover.Target>
        <HomepageDayCalendarDropdown
          calendarGestureHandlers={{}}
          calendarMonth={calendarMonth}
          onNextMonth={() => {}}
          onPreviousMonth={() => {}}
          onSelectDate={() => {}}
        />
      </Popover>
    </MantineProvider>
  );
}

describe("HomepageDayCalendarDropdown", () => {
  it("renders the month label, weekday labels, and calendar grid label", () => {
    const html = renderDropdown();

    expect(html).toContain('aria-label="Choose date"');
    expect(html).toContain("May 2026");
    expect(html).toContain('aria-label="May 2026 gig dates"');

    for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(html).toContain(weekday);
    }
  });

  it("renders enabled, active, today, and disabled day states", () => {
    const html = renderDropdown();

    expect(html).toContain("day-calendar__day--enabled");
    expect(html).toContain("day-calendar__day--active");
    expect(html).toContain("day-calendar__day--today");
    expect(html).toContain('aria-current="date"');
    expect(html).toContain(", no gigs");
    expect(html).toContain('aria-disabled="true"');
  });

  it("disables previous and next month buttons when no adjacent months exist", () => {
    const html = renderDropdown();

    expect(html).toContain('aria-label="Previous calendar month"');
    expect(html).toContain('aria-label="Next calendar month"');
    expect(html).toMatch(
      /aria-label="Previous calendar month"[^>]*disabled|disabled[^>]*aria-label="Previous calendar month"/
    );
    expect(html).toMatch(
      /aria-label="Next calendar month"[^>]*disabled|disabled[^>]*aria-label="Next calendar month"/
    );
  });
});
