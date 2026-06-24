import "server-only";

import { unstable_cache } from "next/cache";

import { getHomepageLowerBound } from "./homepage-dates";
import type { HomepageFilters } from "./homepage-filters";
import { listAvailableGigDates, listGigsForDate } from "./gigs";

const PUBLIC_HOMEPAGE_CACHE_REVALIDATE_SECONDS = 300;
const UNFILTERED_HOMEPAGE_FILTERS: HomepageFilters = {
  date: "",
  legacyWhen: null,
  q: "",
  venueSlugs: []
};

function canUsePublicHomepageCache(filters: HomepageFilters): boolean {
  return filters.q.trim().length === 0 && filters.venueSlugs.length === 0;
}

const listPublicAvailableGigDatesCached = unstable_cache(
  async (_lowerBoundIso: string) =>
    listAvailableGigDates(UNFILTERED_HOMEPAGE_FILTERS),
  ["public-homepage-available-dates"],
  {
    revalidate: PUBLIC_HOMEPAGE_CACHE_REVALIDATE_SECONDS
  }
);

const listPublicGigsForDateCached = unstable_cache(
  async (dateKey: string, _lowerBoundIso: string) =>
    listGigsForDate(UNFILTERED_HOMEPAGE_FILTERS, dateKey),
  ["public-homepage-gigs-for-date"],
  {
    revalidate: PUBLIC_HOMEPAGE_CACHE_REVALIDATE_SECONDS
  }
);

export async function listHomepageAvailableGigDates(filters: HomepageFilters) {
  if (canUsePublicHomepageCache(filters)) {
    return listPublicAvailableGigDatesCached(
      getHomepageLowerBound(new Date()).toISOString()
    );
  }

  return listAvailableGigDates(filters);
}

export async function listHomepageGigsForDate(
  filters: HomepageFilters,
  dateKey: string
) {
  if (canUsePublicHomepageCache(filters)) {
    return listPublicGigsForDateCached(
      dateKey,
      getHomepageLowerBound(new Date()).toISOString()
    );
  }

  return listGigsForDate(filters, dateKey);
}
