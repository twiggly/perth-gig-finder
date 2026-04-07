export type WhenFilter = "all" | "today" | "weekend" | "next7days";

export interface HomepageFilters {
  q: string;
  date: string;
  when: WhenFilter;
  venueSlugs: string[];
}

export interface HomepageFilterNavigationInput {
  q?: string;
  venues?: string[];
  when?: WhenFilter;
}

export interface SearchableGigRecord {
  title: string;
  venue_name: string;
  venue_suburb: string | null;
  artist_names: string[];
}

const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_WHEN_FILTERS = new Set<WhenFilter>([
  "all",
  "today",
  "weekend",
  "next7days"
]);

type SearchParamValue = string | string[] | undefined;

function toPerthClock(date: Date): Date {
  return new Date(date.getTime() + PERTH_OFFSET_MS);
}

function fromPerthClock(date: Date): Date {
  return new Date(date.getTime() - PERTH_OFFSET_MS);
}

function getSearchParamString(value: SearchParamValue): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getSearchParamArray(value: SearchParamValue): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
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

function uniqueVenueSlugs(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasSameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseCurrentWhen(searchParams: URLSearchParams): WhenFilter {
  const rawWhen = (searchParams.get("when") ?? "").trim();

  return VALID_WHEN_FILTERS.has(rawWhen as WhenFilter)
    ? (rawWhen as WhenFilter)
    : "all";
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseHomepageFilters(
  searchParams: Record<string, SearchParamValue>
): HomepageFilters {
  const q = getSearchParamString(searchParams.q).trim();
  const rawWhen = getSearchParamString(searchParams.when).trim();
  const when = VALID_WHEN_FILTERS.has(rawWhen as WhenFilter)
    ? (rawWhen as WhenFilter)
    : "all";

  return {
    date: getSearchParamString(searchParams.date).trim(),
    q,
    when,
    venueSlugs: uniqueVenueSlugs(getSearchParamArray(searchParams.venue))
  };
}

export function buildHomepageFilterHref(
  pathname: string,
  currentSearch: string,
  nextValues: HomepageFilterNavigationInput
): string {
  const currentParams = new URLSearchParams(currentSearch);
  const nextParams = new URLSearchParams(currentSearch);
  let shouldResetDate = false;

  if (nextValues.q !== undefined) {
    const nextQuery = nextValues.q.trim();
    const currentQuery = (currentParams.get("q") ?? "").trim();

    shouldResetDate ||= currentQuery !== nextQuery;

    if (nextQuery) {
      nextParams.set("q", nextQuery);
    } else {
      nextParams.delete("q");
    }
  }

  if (nextValues.when !== undefined) {
    const currentWhen = parseCurrentWhen(currentParams);

    shouldResetDate ||= currentWhen !== nextValues.when;

    if (nextValues.when === "all") {
      nextParams.delete("when");
    } else {
      nextParams.set("when", nextValues.when);
    }
  }

  if (nextValues.venues !== undefined) {
    const currentVenues = uniqueVenueSlugs(currentParams.getAll("venue"));
    const nextVenues = uniqueVenueSlugs(nextValues.venues);

    shouldResetDate ||= !hasSameValues(currentVenues, nextVenues);
    nextParams.delete("venue");
    nextVenues.forEach((slug) => nextParams.append("venue", slug));
  }

  if (shouldResetDate) {
    nextParams.delete("date");
  }

  const nextSearch = nextParams.toString();

  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function getWhenBounds(
  when: WhenFilter,
  now: Date
): {
  startAt: Date;
  endAt: Date | null;
} {
  const todayStart = getPerthStartOfDay(now);

  if (when === "today") {
    return {
      startAt: todayStart,
      endAt: addDays(todayStart, 1)
    };
  }

  if (when === "next7days") {
    return {
      startAt: now,
      endAt: new Date(now.getTime() + 7 * DAY_MS)
    };
  }

  if (when === "weekend") {
    const dayOfWeek = getPerthDayOfWeek(now);
    let weekendStart = todayStart;

    if (dayOfWeek === 0) {
      weekendStart = addDays(todayStart, -2);
    } else if (dayOfWeek >= 5) {
      weekendStart = addDays(todayStart, 5 - dayOfWeek);
    } else {
      weekendStart = addDays(todayStart, 5 - dayOfWeek);
    }

    return {
      startAt: weekendStart,
      endAt: addDays(weekendStart, 3)
    };
  }

  return {
    startAt: now,
    endAt: null
  };
}

export function matchesGigQuery(
  gig: SearchableGigRecord,
  query: string
): boolean {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText(
    [
      gig.title,
      gig.venue_name,
      gig.venue_suburb ?? "",
      ...gig.artist_names
    ].join(" ")
  );

  return normalizedQuery.split(" ").every((token) => haystack.includes(token));
}
