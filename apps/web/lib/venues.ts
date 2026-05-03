import { createSupabaseServerClient } from "./supabase";
import { normalizeSearchText } from "./homepage-filters";

export interface VenueOption {
  slug: string;
  name: string;
  suburb: string | null;
}

interface VenueSlugRecord {
  venue_slug: string | null;
}

export function filterVenuesWithActiveFutureGigs(
  venues: VenueOption[],
  activeFutureVenueSlugs: ReadonlySet<string>
): VenueOption[] {
  return venues.filter((venue) => activeFutureVenueSlugs.has(venue.slug));
}

function compareVenueSuggestions(
  left: VenueOption,
  right: VenueOption,
  normalizedQuery: string
): number {
  const leftName = normalizeSearchText(left.name);
  const rightName = normalizeSearchText(right.name);
  const leftSuburb = normalizeSearchText(left.suburb ?? "");
  const rightSuburb = normalizeSearchText(right.suburb ?? "");
  const leftNameStarts = leftName.startsWith(normalizedQuery);
  const rightNameStarts = rightName.startsWith(normalizedQuery);
  const leftNameIncludes = leftName.includes(normalizedQuery);
  const rightNameIncludes = rightName.includes(normalizedQuery);
  const leftSuburbIncludes = leftSuburb.includes(normalizedQuery);
  const rightSuburbIncludes = rightSuburb.includes(normalizedQuery);

  if (leftNameStarts !== rightNameStarts) {
    return leftNameStarts ? -1 : 1;
  }

  if (leftNameIncludes !== rightNameIncludes) {
    return leftNameIncludes ? -1 : 1;
  }

  if (leftSuburbIncludes !== rightSuburbIncludes) {
    return leftSuburbIncludes ? -1 : 1;
  }

  return left.name.localeCompare(right.name, "en-AU");
}

export async function listSelectedVenues(slugs: string[]): Promise<VenueOption[]> {
  if (slugs.length === 0) {
    return [];
  }

  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("venues")
    .select("slug, name, suburb")
    .in("slug", slugs);

  if (error) {
    throw new Error(error.message);
  }

  const venues = (data ?? []) as VenueOption[];
  const venueMap = new Map(venues.map((venue) => [venue.slug, venue]));

  return slugs
    .map((slug) => venueMap.get(slug))
    .filter((venue): venue is VenueOption => Boolean(venue));
}

export async function listVenueSuggestions(
  query: string,
  excludedSlugs: string[] = []
): Promise<VenueOption[]> {
  const normalizedQuery = normalizeSearchText(query);
  const client = createSupabaseServerClient();
  const [venueResult, activeVenueResult] = await Promise.all([
    client.from("venues").select("slug, name, suburb").order("name", { ascending: true }),
    client
      .from("gig_cards")
      .select("venue_slug")
      .eq("status", "active")
      .gte("starts_at", new Date().toISOString())
  ]);

  if (venueResult.error) {
    throw new Error(venueResult.error.message);
  }

  if (activeVenueResult.error) {
    throw new Error(activeVenueResult.error.message);
  }

  const excluded = new Set(excludedSlugs);
  const activeFutureVenueSlugs = new Set(
    ((activeVenueResult.data ?? []) as VenueSlugRecord[])
      .map((record) => record.venue_slug)
      .filter((slug): slug is string => Boolean(slug))
  );
  const venues = filterVenuesWithActiveFutureGigs(
    (venueResult.data ?? []) as VenueOption[],
    activeFutureVenueSlugs
  ).filter((venue) => {
    if (excluded.has(venue.slug)) {
      return false;
    }

    const normalizedName = normalizeSearchText(venue.name);
    const normalizedSuburb = normalizeSearchText(venue.suburb ?? "");

    if (!normalizedQuery) {
      return true;
    }

    return (
      normalizedName.includes(normalizedQuery) ||
      normalizedSuburb.includes(normalizedQuery)
    );
  });

  if (!normalizedQuery) {
    return venues.sort((left, right) => left.name.localeCompare(right.name, "en-AU"));
  }

  return venues.sort((left, right) =>
    compareVenueSuggestions(left, right, normalizedQuery)
  );
}
