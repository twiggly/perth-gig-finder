export type LegacyWhenFilter = "today" | "weekend" | null;

export interface HomepageFilters {
  q: string;
  date: string;
  legacyWhen: LegacyWhenFilter;
  venueSlugs: string[];
}

export interface HomepageFilterNavigationInput {
  q?: string;
  venues?: string[];
  date?: string | null;
}

export interface SearchableGigRecord {
  title: string;
  venue_name: string;
  venue_suburb: string | null;
  artist_names: string[];
}

type SearchParamValue = string | string[] | undefined;

const VALID_LEGACY_WHEN_FILTERS = new Set<Exclude<LegacyWhenFilter, null>>([
  "today",
  "weekend"
]);

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

function uniqueVenueSlugs(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasSameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseLegacyWhen(value: string): LegacyWhenFilter {
  return VALID_LEGACY_WHEN_FILTERS.has(value as Exclude<LegacyWhenFilter, null>)
    ? (value as Exclude<LegacyWhenFilter, null>)
    : null;
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseHomepageFilters(
  searchParams: Record<string, SearchParamValue>
): HomepageFilters {
  const q = getSearchParamString(searchParams.q).trim();
  const legacyWhen = parseLegacyWhen(getSearchParamString(searchParams.when).trim());

  return {
    date: getSearchParamString(searchParams.date).trim(),
    legacyWhen,
    q,
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

  nextParams.delete("when");

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

  if (nextValues.date !== undefined) {
    const nextDate = nextValues.date?.trim() ?? "";

    if (nextDate) {
      nextParams.set("date", nextDate);
    } else {
      nextParams.delete("date");
    }
  }

  const nextSearch = nextParams.toString();

  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
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
