import type { DateGroup } from "./homepage-dates";
import type { GigCardRecord } from "./gigs";

export type HomepageDayPayload = DateGroup<GigCardRecord>;

export interface HomepageDayRequestInput {
  dateKey: string;
  query: string;
  venueSlugs: string[];
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
