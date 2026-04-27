import type { DateGroup } from "./homepage-dates";
import {
  getDateShortcutTarget,
  getTodayShortcutState
} from "./homepage-dates";
import type { GigCardRecord } from "./gigs";

export type HomepageDayPayload = DateGroup<GigCardRecord>;

export interface HomepageDayRequestInput {
  dateKey: string;
  query: string;
  venueSlugs: string[];
}

export function getInitialHomepageDayDateKeys(
  activeDateKey: string,
  availableDateKeys: string[]
): string[] {
  const activeIndex = availableDateKeys.indexOf(activeDateKey);

  if (activeIndex < 0) {
    return [];
  }

  return availableDateKeys.slice(
    Math.max(0, activeIndex - 1),
    Math.min(availableDateKeys.length, activeIndex + 2)
  );
}

export function getHydratedHomepageDayDateKeys({
  activeDateKey,
  availableDateKeys,
  now
}: {
  activeDateKey: string;
  availableDateKeys: string[];
  now: Date;
}): string[] {
  const requestedDateKeys = new Set([
    ...getInitialHomepageDayDateKeys(activeDateKey, availableDateKeys),
    getTodayShortcutState(availableDateKeys, now).targetDateKey,
    getDateShortcutTarget(availableDateKeys, "weekend", now)
  ]);

  return availableDateKeys.filter((dateKey) => requestedDateKeys.has(dateKey));
}

export function getNextHomepageDayPrefetchDateKeys({
  activeDateKey,
  availableDateKeys,
  loadedDateKeys
}: {
  activeDateKey: string;
  availableDateKeys: string[];
  loadedDateKeys: string[];
}): string[] {
  const activeIndex = availableDateKeys.indexOf(activeDateKey);

  if (activeIndex < 0) {
    return [];
  }

  const loadedDateKeySet = new Set(loadedDateKeys);
  let leftIndex = activeIndex;
  let rightIndex = activeIndex;

  while (
    leftIndex > 0 &&
    loadedDateKeySet.has(availableDateKeys[leftIndex - 1] ?? "")
  ) {
    leftIndex -= 1;
  }

  while (
    rightIndex < availableDateKeys.length - 1 &&
    loadedDateKeySet.has(availableDateKeys[rightIndex + 1] ?? "")
  ) {
    rightIndex += 1;
  }

  return [
    availableDateKeys[leftIndex - 1],
    availableDateKeys[rightIndex + 1]
  ].filter((dateKey): dateKey is string =>
    Boolean(dateKey && !loadedDateKeySet.has(dateKey))
  );
}

export function buildHomepageDayRequestPath({
  dateKey,
  query,
  venueSlugs
}: HomepageDayRequestInput): string {
  const params = new URLSearchParams({
    date: dateKey
  });
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  for (const slug of venueSlugs) {
    params.append("venue", slug);
  }

  return `/api/homepage-day?${params.toString()}`;
}

export function mergeHomepageDayCache(
  loadedDays: HomepageDayPayload[],
  nextDay: HomepageDayPayload,
  availableDateKeys: string[]
): HomepageDayPayload[] {
  const loadedDayMap = new Map(
    loadedDays.map((day) => [day.dateKey, day] as const)
  );

  loadedDayMap.set(nextDay.dateKey, nextDay);

  return availableDateKeys
    .map((dateKey) => loadedDayMap.get(dateKey))
    .filter((day): day is HomepageDayPayload => Boolean(day));
}

export function isHomepageDayPayload(value: unknown): value is HomepageDayPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<HomepageDayPayload>;

  return (
    typeof payload.dateKey === "string" &&
    typeof payload.heading === "string" &&
    Array.isArray(payload.items)
  );
}
