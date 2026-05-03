import React from "react";
import { UnstyledButton } from "@mantine/core";

import {
  getDateShortcutLabel,
  getDateShortcutTarget,
  getTodayShortcutState,
  isWeekendShortcutActiveDate,
  type DateShortcut
} from "@/lib/homepage-dates";

const DATE_SHORTCUT_OPTIONS: Array<{
  value: DateShortcut;
}> = [
  { value: "today" },
  { value: "weekend" }
];

interface DateShortcutPillsProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  isPending: boolean;
  now: Date;
  onNavigate: (requestedDateKey: string) => void;
}

export function DateShortcutPills({
  activeDateKey,
  availableDateKeys,
  isPending,
  now,
  onNavigate
}: DateShortcutPillsProps) {
  const todayShortcut = getTodayShortcutState(availableDateKeys, now);
  const weekendDateKey = getDateShortcutTarget(availableDateKeys, "weekend", now);

  if (!todayShortcut.targetDateKey && !weekendDateKey) {
    return null;
  }

  return (
    <div className="date-pills" role="group" aria-label="Jump to date">
      {DATE_SHORTCUT_OPTIONS.map((option) => {
        const targetDateKey =
          option.value === "today" ? todayShortcut.targetDateKey : weekendDateKey;

        if (!targetDateKey) {
          return null;
        }

        const isPressed =
          option.value === "today"
            ? todayShortcut.todayDateKey
              ? activeDateKey !== null && activeDateKey === todayShortcut.todayDateKey
              : activeDateKey !== null && activeDateKey === todayShortcut.nearestDateKey
            : isWeekendShortcutActiveDate(activeDateKey, now);

        return (
          <UnstyledButton
            aria-pressed={isPressed}
            className="date-pill"
            disabled={isPending}
            key={option.value}
            onClick={() => onNavigate(targetDateKey)}
            type="button"
          >
            {option.value === "today"
              ? todayShortcut.label
              : getDateShortcutLabel(option.value, now)}
          </UnstyledButton>
        );
      })}
    </div>
  );
}
