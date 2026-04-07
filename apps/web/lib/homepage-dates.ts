export interface StartsAtRecord {
  starts_at: string;
}

export interface DateGroup<T> {
  dateKey: string;
  heading: string;
  items: T[];
}

export interface DayTransition {
  direction: SwipeDirection;
  fromDateKey: string;
  toDateKey: string;
}

export type SwipeDirection = "previous" | "next";
export const DAY_SWIPE_DURATION_MS = 300;
export const SWIPE_THRESHOLD_PX = 48;
export const TRACKPAD_HORIZONTAL_BIAS_RATIO = 0.85;
export const TRACKPAD_GESTURE_LOCK_MS = 350;
export const TRACKPAD_LOCK_HORIZONTAL_BIAS_RATIO = 1;

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Australia/Perth",
  year: "numeric"
});

const HEADING_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  weekday: "short"
});

const HEADING_MONTH_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  month: "short",
  timeZone: "Australia/Perth"
});

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getOrdinalSuffix(day: number): string {
  const remainder = day % 100;

  if (remainder >= 11 && remainder <= 13) {
    return "th";
  }

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function getDateParts(date: Date): Record<"year" | "month" | "day", string> {
  return DAY_KEY_FORMATTER.formatToParts(date).reduce<Record<string, string>>(
    (parts, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") {
        parts[part.type] = part.value;
      }

      return parts;
    },
    {}
  ) as Record<"year" | "month" | "day", string>;
}

function getHeadingDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map((value) => Number.parseInt(value, 10));

  return new Date(Date.UTC(year, month - 1, day));
}

export function isDateKey(value: string): boolean {
  return DATE_KEY_PATTERN.test(value);
}

export function getPerthDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateHeading(dateKey: string): string {
  const headingDate = getHeadingDate(dateKey);
  const weekday = HEADING_WEEKDAY_FORMATTER.format(headingDate);
  const month = HEADING_MONTH_FORMATTER.format(headingDate);
  const day = Number.parseInt(dateKey.slice(-2), 10);

  return `${weekday}, ${month} ${day}${getOrdinalSuffix(day)}`;
}

export function groupItemsByPerthDate<T extends StartsAtRecord>(
  items: T[]
): DateGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const dateKey = getPerthDateKey(item.starts_at);
    const group = groups.get(dateKey);

    if (group) {
      group.push(item);
    } else {
      groups.set(dateKey, [item]);
    }
  }

  return [...groups.entries()].map(([dateKey, groupedItems]) => ({
    dateKey,
    heading: formatDateHeading(dateKey),
    items: groupedItems
  }));
}

export function resolveActiveDateKey(
  availableDateKeys: string[],
  requestedDate: string
): string | null {
  if (availableDateKeys.length === 0) {
    return null;
  }

  if (!isDateKey(requestedDate)) {
    return availableDateKeys[0];
  }

  return availableDateKeys.includes(requestedDate)
    ? requestedDate
    : availableDateKeys[0];
}

export function getAdjacentDateKey(
  availableDateKeys: string[],
  activeDateKey: string,
  direction: SwipeDirection
): string | null {
  const activeIndex = availableDateKeys.indexOf(activeDateKey);

  if (activeIndex === -1) {
    return null;
  }

  const nextIndex = direction === "next" ? activeIndex + 1 : activeIndex - 1;

  return availableDateKeys[nextIndex] ?? null;
}

export function getDayTransition(
  availableDateKeys: string[],
  activeDateKey: string,
  direction: SwipeDirection
): DayTransition | null {
  const toDateKey = getAdjacentDateKey(availableDateKeys, activeDateKey, direction);

  if (!toDateKey) {
    return null;
  }

  return {
    direction,
    fromDateKey: activeDateKey,
    toDateKey
  };
}

export function getSwipeDirection(
  deltaX: number,
  deltaY: number,
  threshold = SWIPE_THRESHOLD_PX
): SwipeDirection | null {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) {
    return null;
  }

  return deltaX < 0 ? "next" : "previous";
}

export function isTrackpadHorizontalIntent(
  deltaX: number,
  deltaY: number,
  biasRatio = TRACKPAD_HORIZONTAL_BIAS_RATIO
): boolean {
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);

  if (absDeltaX === 0) {
    return false;
  }

  return absDeltaX >= absDeltaY * biasRatio;
}

export function shouldConsumeLockedTrackpadMomentum(
  deltaX: number,
  deltaY: number,
  direction: SwipeDirection | null
): boolean {
  if (!direction || !isTrackpadHorizontalIntent(deltaX, deltaY, TRACKPAD_LOCK_HORIZONTAL_BIAS_RATIO)) {
    return false;
  }

  return direction === "next" ? deltaX > 0 : deltaX < 0;
}

export function accumulateTrackpadSwipe(
  currentDelta: number,
  deltaX: number,
  deltaY: number,
  threshold = SWIPE_THRESHOLD_PX
): {
  direction: SwipeDirection | null;
  nextDelta: number;
} {
  if (!isTrackpadHorizontalIntent(deltaX, deltaY)) {
    return {
      direction: null,
      nextDelta: 0
    };
  }

  const nextDelta = currentDelta + deltaX;

  if (Math.abs(nextDelta) < threshold) {
    return {
      direction: null,
      nextDelta
    };
  }

  return {
    direction: nextDelta > 0 ? "next" : "previous",
    nextDelta: 0
  };
}
