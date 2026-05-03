"use client";

import React, { type HTMLAttributes } from "react";
import { ActionIcon, Popover, Text, UnstyledButton } from "@mantine/core";

import {
  CALENDAR_WEEKDAY_LABELS,
  type HomepageCalendarMonth
} from "@/lib/homepage-calendar";

interface HomepageDayCalendarDropdownProps {
  calendarGestureHandlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    "onPointerCancel" | "onPointerDown" | "onPointerUp" | "onWheel"
  >;
  calendarMonth: HomepageCalendarMonth | null;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onSelectDate: (dateKey: string) => void;
}

export function HomepageDayCalendarDropdown({
  calendarGestureHandlers,
  calendarMonth,
  onNextMonth,
  onPreviousMonth,
  onSelectDate
}: HomepageDayCalendarDropdownProps) {
  return (
    <Popover.Dropdown
      aria-label="Choose date"
      className="day-calendar"
      role="dialog"
      {...calendarGestureHandlers}
    >
      {calendarMonth ? (
        <>
          <div className="day-calendar__header">
            <ActionIcon
              aria-label="Previous calendar month"
              className="day-calendar__month-button"
              disabled={!calendarMonth.previousMonthKey}
              onClick={onPreviousMonth}
              type="button"
              variant="subtle"
            >
              <span aria-hidden="true">&lt;</span>
            </ActionIcon>
            <Text className="day-calendar__month-label" component="p">
              {calendarMonth.label}
            </Text>
            <ActionIcon
              aria-label="Next calendar month"
              className="day-calendar__month-button"
              disabled={!calendarMonth.nextMonthKey}
              onClick={onNextMonth}
              type="button"
              variant="subtle"
            >
              <span aria-hidden="true">&gt;</span>
            </ActionIcon>
          </div>
          <div className="day-calendar__weekdays" aria-hidden="true">
            {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div
            aria-label={`${calendarMonth.label} gig dates`}
            className="day-calendar__grid"
            role="group"
          >
            {calendarMonth.weeks.flatMap((week) =>
              week.map((day) => {
                const className = [
                  "day-calendar__day",
                  day.isCurrentMonth ? "" : "day-calendar__day--outside",
                  day.isEnabled ? "day-calendar__day--enabled" : "",
                  day.isActive ? "day-calendar__day--active" : "",
                  day.isToday ? "day-calendar__day--today" : ""
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <UnstyledButton
                    aria-current={day.isActive ? "date" : undefined}
                    aria-disabled={!day.isEnabled}
                    aria-label={`${day.dateKey}${day.isEnabled ? "" : ", no gigs"}`}
                    className={className}
                    disabled={!day.isEnabled}
                    key={day.dateKey}
                    onClick={() => onSelectDate(day.dateKey)}
                    style={
                      day.gridColumnStart
                        ? { gridColumnStart: day.gridColumnStart }
                        : undefined
                    }
                    type="button"
                  >
                    {day.dayOfMonth}
                  </UnstyledButton>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </Popover.Dropdown>
  );
}
