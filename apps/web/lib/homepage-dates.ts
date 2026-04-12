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

export interface TodayShortcutState {
  label: "Today" | "Nearest day";
  nearestDateKey: string | null;
  targetDateKey: string | null;
  todayDateKey: string | null;
}

interface HomepageDateEventDetail {
  dateKey: string;
}

export type DateShortcut = "today" | "weekend";
export type SwipeDirection = "previous" | "next";
export const DAY_SWIPE_DURATION_MS = 300;
export const SWIPE_THRESHOLD_PX = 48;
export const TRACKPAD_HORIZONTAL_BIAS_RATIO = 0.85;
export const TRACKPAD_GESTURE_LOCK_MS = 350;
export const TRACKPAD_LOCK_HORIZONTAL_BIAS_RATIO = 1;
export const HOMEPAGE_ACTIVE_DATE_CHANGE_EVENT =
  "homepage:active-date-change";
export const HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT =
  "homepage:request-active-date";
const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function toPerthClock(date: Date): Date {
  return new Date(date.getTime() + PERTH_OFFSET_MS);
}

function fromPerthClock(date: Date): Date {
  return new Date(date.getTime() - PERTH_OFFSET_MS);
}

function getPerthStartOfDay(date: Date): Date {
  const perthDate = toPerthClock(date);

  return fromPerthClock(
    new Date(
      Date.UTC(
        perthDate.getUTCFullYear(),
        perthDate.getUTCMonth(),
        perthDate.getUTCDate()
      )
    )
  );
}

function getPerthDayOfWeek(date: Date): number {
  return toPerthClock(date).getUTCDay();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function getWeekendShortcutOffset(dayOfWeek: number): number {
  if (dayOfWeek === 0) {
    return 5;
  }

  if (dayOfWeek === 6) {
    return 6;
  }

  return Math.max(5 - dayOfWeek, 0);
}

function getWeekendShortcutStartDate(now: Date): Date {
  return addDays(
    getPerthStartOfDay(now),
    getWeekendShortcutOffset(getPerthDayOfWeek(now))
  );
}

function getWeekendShortcutDateKeys(now: Date): string[] {
  const weekendStartDate = getWeekendShortcutStartDate(now);

  return [0, 1, 2].map((offset) => getPerthDateKey(addDays(weekendStartDate, offset)));
}

function getHomepageDateEventDetail(event: Event): HomepageDateEventDetail | null {
  return event instanceof CustomEvent &&
    event.detail &&
    typeof event.detail.dateKey === "string"
    ? { dateKey: event.detail.dateKey }
    : null;
}

function createHomepageDateUrl(
  pathname: string,
  currentSearch: string,
  currentHash: string,
  dateKey: string
): string {
  const nextParams = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch
  );

  nextParams.set("date", dateKey);
  nextParams.delete("when");

  const nextSearch = nextParams.toString();

  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${currentHash}`;
}

export function getHomepageRequestedDateKey(event: Event): string | null {
  return getHomepageDateEventDetail(event)?.dateKey ?? null;
}

export function replaceHomepageDateInUrl(pathname: string, dateKey: string): void {
  if (typeof window === "undefined" || !dateKey) {
    return;
  }

  const nextUrl = createHomepageDateUrl(
    pathname,
    window.location.search,
    window.location.hash,
    dateKey
  );

  window.history.replaceState(window.history.state, "", nextUrl);
}

export function requestHomepageActiveDate(pathname: string, dateKey: string): void {
  if (typeof window === "undefined" || !dateKey) {
    return;
  }

  replaceHomepageDateInUrl(pathname, dateKey);
  window.dispatchEvent(
    new CustomEvent(HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT, {
      detail: { dateKey }
    })
  );
}

export function syncHomepageActiveDate(pathname: string, dateKey: string): void {
  if (typeof window === "undefined" || !dateKey) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(HOMEPAGE_ACTIVE_DATE_CHANGE_EVENT, {
      detail: { dateKey }
    })
  );

  const currentParams = new URLSearchParams(window.location.search);
  const hasLegacyWhen = currentParams.has("when");

  if (currentParams.get("date") === dateKey && !hasLegacyWhen) {
    return;
  }

  replaceHomepageDateInUrl(pathname, dateKey);
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

export function getDateShortcutTarget(
  availableDateKeys: string[],
  shortcut: DateShortcut,
  now: Date
): string | null {
  if (shortcut === "today") {
    return getTodayShortcutState(availableDateKeys, now).targetDateKey;
  }

  if (availableDateKeys.length === 0) {
    return null;
  }

  return (
    getWeekendShortcutDateKeys(now).find((dateKey) =>
      availableDateKeys.includes(dateKey)
    ) ?? null
  );
}

export function getDateShortcutLabel(shortcut: DateShortcut, now: Date): string {
  if (shortcut === "today") {
    return "Today";
  }

  const dayOfWeek = getPerthDayOfWeek(now);

  return dayOfWeek === 6 || dayOfWeek === 0 ? "Next weekend" : "This weekend";
}

export function getTodayShortcutState(
  availableDateKeys: string[],
  now: Date
): TodayShortcutState {
  const currentPerthDateKey = getPerthDateKey(now);
  const todayDateKey = availableDateKeys.includes(currentPerthDateKey)
    ? currentPerthDateKey
    : null;
  const nearestDateKey = todayDateKey ? null : (availableDateKeys[0] ?? null);

  return {
    label: todayDateKey ? "Today" : "Nearest day",
    nearestDateKey,
    targetDateKey: todayDateKey ?? nearestDateKey,
    todayDateKey
  };
}

export function getTodayShortcutLabel(
  availableDateKeys: string[],
  now: Date
): "Today" | "Nearest day" {
  return getTodayShortcutState(availableDateKeys, now).label;
}

export function isWeekendShortcutActiveDate(
  activeDateKey: string | null,
  now: Date
): boolean {
  if (!activeDateKey) {
    return false;
  }

  return getWeekendShortcutDateKeys(now).includes(activeDateKey);
}

export function getHomepageLowerBound(now: Date): Date {
  return now;
}

export function resolveHomepageDateKey(
  availableDateKeys: string[],
  requestedDate: string,
  legacyWhen: DateShortcut | null,
  now: Date
): string | null {
  if (isDateKey(requestedDate)) {
    return resolveActiveDateKey(availableDateKeys, requestedDate);
  }

  if (legacyWhen) {
    return (
      getDateShortcutTarget(availableDateKeys, legacyWhen, now) ??
      resolveActiveDateKey(availableDateKeys, "")
    );
  }

  return resolveActiveDateKey(availableDateKeys, requestedDate);
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
