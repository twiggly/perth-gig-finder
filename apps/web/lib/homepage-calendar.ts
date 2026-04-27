export interface HomepageCalendarDay {
  dateKey: string;
  dayOfMonth: number;
  gridColumnStart: number | null;
  isActive: boolean;
  isCurrentMonth: boolean;
  isEnabled: boolean;
  isToday: boolean;
}

export interface HomepageCalendarMonth {
  label: string;
  monthKey: string;
  nextMonthKey: string | null;
  previousMonthKey: string | null;
  weeks: HomepageCalendarDay[][];
}

interface CalendarMonthInput {
  activeDateKey: string;
  availableDateKeys: string[];
  monthKey: string;
  todayDateKey?: string;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const CALENDAR_DAYS_PER_WEEK = 7;

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  timeZone: "UTC",
  year: "numeric"
});

export const CALENDAR_WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun"
];

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function getMonthKey(dateKey: string): string | null {
  return DATE_KEY_PATTERN.test(dateKey) ? dateKey.slice(0, 7) : null;
}

function parseMonthKey(
  monthKey: string
): { monthIndex: number; year: number } | null {
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    return null;
  }

  const [year, month] = monthKey
    .split("-")
    .map((value) => Number.parseInt(value, 10));

  if (!year || !month || month < 1 || month > 12) {
    return null;
  }

  return {
    monthIndex: month - 1,
    year
  };
}

function getDateKeyFromUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("-");
}

function getDateKeyFromParts(year: number, monthIndex: number, day: number): string {
  return getDateKeyFromUtcDate(new Date(Date.UTC(year, monthIndex, day)));
}

function getMonthLabel(monthKey: string): string {
  const parsedMonth = parseMonthKey(monthKey);

  if (!parsedMonth) {
    return monthKey;
  }

  return MONTH_LABEL_FORMATTER.format(
    new Date(Date.UTC(parsedMonth.year, parsedMonth.monthIndex, 1))
  );
}

export function getHomepageCalendarMonthKeys(availableDateKeys: string[]): string[] {
  return [
    ...new Set(
      availableDateKeys
        .map(getMonthKey)
        .filter((monthKey): monthKey is string => Boolean(monthKey))
    )
  ].sort();
}

export function getInitialHomepageCalendarMonthKey(
  activeDateKey: string,
  availableDateKeys: string[]
): string | null {
  const monthKeys = getHomepageCalendarMonthKeys(availableDateKeys);
  const activeMonthKey = getMonthKey(activeDateKey);

  if (activeMonthKey && monthKeys.includes(activeMonthKey)) {
    return activeMonthKey;
  }

  return monthKeys[0] ?? null;
}

export function buildHomepageCalendarMonth({
  activeDateKey,
  availableDateKeys,
  monthKey,
  todayDateKey
}: CalendarMonthInput): HomepageCalendarMonth | null {
  const parsedMonth = parseMonthKey(monthKey);

  if (!parsedMonth) {
    return null;
  }

  const enabledDateKeys = new Set(
    availableDateKeys.filter((dateKey) => DATE_KEY_PATTERN.test(dateKey))
  );
  const monthKeys = getHomepageCalendarMonthKeys(availableDateKeys);
  const monthIndex = monthKeys.indexOf(monthKey);
  const firstOfMonth = new Date(
    Date.UTC(parsedMonth.year, parsedMonth.monthIndex, 1)
  );
  const firstOfNextMonth = new Date(
    Date.UTC(parsedMonth.year, parsedMonth.monthIndex + 1, 1)
  );
  const firstDayColumnStart =
    ((firstOfMonth.getUTCDay() + 6) % CALENDAR_DAYS_PER_WEEK) + 1;
  const days: HomepageCalendarDay[] = [];

  for (let dayOfMonth = 1; ; dayOfMonth += 1) {
    const dateKey = getDateKeyFromParts(
      parsedMonth.year,
      parsedMonth.monthIndex,
      dayOfMonth
    );
    const date = new Date(`${dateKey}T00:00:00.000Z`);

    if (date >= firstOfNextMonth) {
      break;
    }

    const isCurrentMonth = getMonthKey(dateKey) === monthKey;

    days.push({
      dateKey,
      dayOfMonth: date.getUTCDate(),
      gridColumnStart: dayOfMonth === 1 ? firstDayColumnStart : null,
      isActive: dateKey === activeDateKey,
      isCurrentMonth,
      isEnabled: enabledDateKeys.has(dateKey),
      isToday: todayDateKey ? dateKey === todayDateKey : false
    });
  }

  return {
    label: getMonthLabel(monthKey),
    monthKey,
    nextMonthKey: monthIndex >= 0 ? (monthKeys[monthIndex + 1] ?? null) : null,
    previousMonthKey: monthIndex > 0 ? monthKeys[monthIndex - 1] ?? null : null,
    weeks: Array.from(
      { length: Math.ceil(days.length / CALENDAR_DAYS_PER_WEEK) },
      (_, weekIndex) =>
        days.slice(
          weekIndex * CALENDAR_DAYS_PER_WEEK,
          (weekIndex + 1) * CALENDAR_DAYS_PER_WEEK
        )
    )
  };
}
