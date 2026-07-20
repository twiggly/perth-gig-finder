import type { GigStatus } from "@perth-gig-finder/shared";
import { isContentAddressedGigImagePath } from "@perth-gig-finder/shared/image-path";

import { matchesGigQuery, type HomepageFilters } from "./homepage-filters";
import { getGigArchiveLowerBound, getPerthMonthBounds } from "./gig-archive";
import {
  formatDateHeading,
  getHomepageLowerBound,
  getPerthDateKey,
  getPerthDayBounds,
  groupItemsByPerthDate,
  type DateGroup,
  type DateSummary
} from "./homepage-dates";
import { createSupabaseServerClient } from "./supabase";

export interface GigCardRecord {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  artist_names: string[];
  image_path: string | null;
  source_image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  image_version: string | null;
  ticket_url: string | null;
  tixel_url: string | null;
  source_url: string;
  source_name: string | null;
  venue_slug: string;
  venue_name: string;
  venue_suburb: string | null;
  venue_address: string | null;
  venue_website_url: string | null;
  status: GigStatus;
}

export interface GigSitemapRecord {
  last_modified: string;
  slug: string;
  starts_at: string;
  status: GigStatus;
  venue_slug: string;
}

export interface HomepageDateAvailabilityRecord {
  id: string;
  title: string;
  starts_at: string;
  artist_names: string[];
  venue_slug: string;
  venue_name: string;
  venue_suburb: string | null;
  status: GigStatus;
}

interface GigImageRecord {
  image_height: number | null;
  image_path: string | null;
  image_version: string | null;
  image_width: number | null;
  source_image_url: string | null;
  venue_slug?: string | null;
}

interface GigImageGroup {
  items: GigCardRecord[];
}

export interface RenderableGigImage {
  height: number;
  isPlaceholder: boolean;
  url: string;
  width: number;
}

const THE_BIRD_PLACEHOLDER_IMAGE: RenderableGigImage = {
  height: 940,
  isPlaceholder: true,
  url: "/venue-placeholders/the-bird.png",
  width: 1674
};

const GIG_CARD_SELECT =
  "id, slug, title, starts_at, ends_at, artist_names, image_path, source_image_url, image_width, image_height, image_version, ticket_url, tixel_url, source_url, source_name, venue_slug, venue_name, venue_suburb, venue_address, venue_website_url, status";

const SITEMAP_PAGE_SIZE = 1_000;

function normalizeGigCard(
  gig: GigCardRecord & { artist_names: string[] | null }
): GigCardRecord {
  return {
    ...gig,
    artist_names: gig.artist_names ?? []
  };
}

function normalizeAvailabilityRecord(
  gig: HomepageDateAvailabilityRecord & { artist_names: string[] | null }
): HomepageDateAvailabilityRecord {
  return {
    ...gig,
    artist_names: gig.artist_names ?? []
  };
}

export function buildAvailableGigDates(
  records: HomepageDateAvailabilityRecord[],
  filters: HomepageFilters
): DateSummary[] {
  const venueSlugs = new Set(filters.venueSlugs);
  const filteredRecords = records.filter((gig) => {
    if (gig.status !== "active") {
      return false;
    }

    if (venueSlugs.size > 0 && !venueSlugs.has(gig.venue_slug)) {
      return false;
    }

    return matchesGigQuery(gig, filters.q);
  });

  return groupItemsByPerthDate(filteredRecords).map((group) => ({
    dateKey: group.dateKey,
    heading: group.heading
  }));
}

export async function listUpcomingGigs(
  filters: HomepageFilters
): Promise<GigCardRecord[]> {
  const client = createSupabaseServerClient();
  const lowerBound = getHomepageLowerBound(new Date());
  let query = client
    .from("gig_cards")
    .select(GIG_CARD_SELECT)
    .eq("status", "active")
    .gte("starts_at", lowerBound.toISOString())
    .order("starts_at", { ascending: true });

  if (filters.venueSlugs.length > 0) {
    query = query.in("venue_slug", filters.venueSlugs);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const gigs = ((data ?? []) as Array<
    GigCardRecord & { artist_names: string[] | null }
  >).map(normalizeGigCard);

  if (!filters.q) {
    return gigs;
  }

  return gigs.filter((gig) => matchesGigQuery(gig, filters.q));
}

export async function listAvailableGigDates(
  filters: HomepageFilters
): Promise<DateSummary[]> {
  const client = createSupabaseServerClient();
  const lowerBound = getHomepageLowerBound(new Date());
  let query = client
    .from("homepage_gig_dates")
    .select(
      "id, title, starts_at, artist_names, venue_slug, venue_name, venue_suburb, status"
    )
    .eq("status", "active")
    .gte("starts_at", lowerBound.toISOString())
    .order("starts_at", { ascending: true });

  if (filters.venueSlugs.length > 0) {
    query = query.in("venue_slug", filters.venueSlugs);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const records = ((data ?? []) as Array<
    HomepageDateAvailabilityRecord & { artist_names: string[] | null }
  >).map(normalizeAvailabilityRecord);

  return buildAvailableGigDates(records, filters);
}

export async function listGigsForDate(
  filters: HomepageFilters,
  dateKey: string
): Promise<DateGroup<GigCardRecord> | null> {
  const bounds = getPerthDayBounds(dateKey);

  if (!bounds) {
    return null;
  }

  const homepageLowerBound = getHomepageLowerBound(new Date());
  const startsAtLowerBound =
    bounds.start > homepageLowerBound ? bounds.start : homepageLowerBound;

  if (bounds.end <= homepageLowerBound) {
    return {
      dateKey,
      heading: formatDateHeading(dateKey),
      items: []
    };
  }

  const client = createSupabaseServerClient();
  let query = client
    .from("gig_cards")
    .select(GIG_CARD_SELECT)
    .eq("status", "active")
    .gte("starts_at", startsAtLowerBound.toISOString())
    .lt("starts_at", bounds.end.toISOString())
    .order("starts_at", { ascending: true });

  if (filters.venueSlugs.length > 0) {
    query = query.in("venue_slug", filters.venueSlugs);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const gigs = ((data ?? []) as Array<
    GigCardRecord & { artist_names: string[] | null }
  >)
    .map(normalizeGigCard)
    .filter((gig) => matchesGigQuery(gig, filters.q));

  return {
    dateKey,
    heading: formatDateHeading(dateKey),
    items: gigs
  };
}

export async function getGigBySlug(slug: string): Promise<GigCardRecord | null> {
  const trimmedSlug = slug.trim();

  if (!trimmedSlug) {
    return null;
  }

  const client = createSupabaseServerClient();
  const lowerBound = getGigArchiveLowerBound(new Date());
  const { data, error } = await client
    .from("gig_cards")
    .select(GIG_CARD_SELECT)
    .eq("slug", trimmedSlug)
    .gte("starts_at", lowerBound.toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? normalizeGigCard(
        data as GigCardRecord & { artist_names: string[] | null }
      )
    : null;
}

async function listGigCardsInRange({
  end,
  start,
  status,
  venueSlug
}: {
  end?: Date;
  start: Date;
  status?: GigStatus;
  venueSlug?: string;
}): Promise<GigCardRecord[]> {
  const client = createSupabaseServerClient();
  let query = client
    .from("gig_cards")
    .select(GIG_CARD_SELECT)
    .gte("starts_at", start.toISOString())
    .order("starts_at", { ascending: true });

  if (end) {
    query = query.lt("starts_at", end.toISOString());
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (venueSlug) {
    query = query.eq("venue_slug", venueSlug);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<
    GigCardRecord & { artist_names: string[] | null }
  >).map(normalizeGigCard);
}

export function listUpcomingDiscoveryGigs(
  now = new Date()
): Promise<GigCardRecord[]> {
  return listGigCardsInRange({
    start: getHomepageLowerBound(now),
    status: "active"
  });
}

export function listGigsForMonth(
  year: number,
  month: number,
  now = new Date()
): Promise<GigCardRecord[]> {
  const bounds = getPerthMonthBounds(year, month);

  if (!bounds) {
    return Promise.resolve([]);
  }

  const archiveLowerBound = getGigArchiveLowerBound(now);
  const start =
    bounds.start > archiveLowerBound ? bounds.start : archiveLowerBound;

  if (start >= bounds.end) {
    return Promise.resolve([]);
  }

  return listGigCardsInRange({ end: bounds.end, start });
}

export async function listActiveGigsForDateKeys(
  dateKeys: string[],
  now = new Date()
): Promise<GigCardRecord[]> {
  const validBounds = dateKeys
    .map((dateKey) => ({ dateKey, bounds: getPerthDayBounds(dateKey) }))
    .filter(
      (
        entry
      ): entry is { dateKey: string; bounds: { end: Date; start: Date } } =>
        Boolean(entry.bounds)
    );

  if (validBounds.length === 0) {
    return [];
  }

  const first = validBounds[0];
  const last = validBounds[validBounds.length - 1];

  if (!first || !last) {
    return [];
  }

  const start = first.bounds.start > now ? first.bounds.start : now;
  const gigs = await listGigCardsInRange({
    end: last.bounds.end,
    start,
    status: "active"
  });
  const allowedDateKeys = new Set(validBounds.map((entry) => entry.dateKey));

  return gigs.filter((gig) =>
    allowedDateKeys.has(getPerthDateKey(gig.starts_at))
  );
}

export function listGigsForVenue(
  venueSlug: string,
  now = new Date()
): Promise<GigCardRecord[]> {
  return listGigCardsInRange({
    start: getGigArchiveLowerBound(now),
    venueSlug
  });
}

export async function listGigSitemapEntries(): Promise<GigSitemapRecord[]> {
  const client = createSupabaseServerClient();
  const lowerBound = getGigArchiveLowerBound(new Date()).toISOString();
  const sitemapRows: Omit<GigSitemapRecord, "venue_slug">[] = [];
  const venueSlugsByGigSlug = new Map<string, string>();

  for (let from = 0; ; from += SITEMAP_PAGE_SIZE) {
    const to = from + SITEMAP_PAGE_SIZE - 1;
    const [sitemapResult, venueResult] = await Promise.all([
      client
        .from("seo_sitemap_gigs")
        .select("slug, starts_at, status, last_modified")
        .gte("starts_at", lowerBound)
        .order("starts_at", { ascending: true })
        .order("slug", { ascending: true })
        .range(from, to),
      client
        .from("gig_cards")
        .select("slug, venue_slug")
        .gte("starts_at", lowerBound)
        .order("starts_at", { ascending: true })
        .order("slug", { ascending: true })
        .range(from, to)
    ]);

    if (sitemapResult.error) {
      throw new Error(sitemapResult.error.message);
    }

    if (venueResult.error) {
      throw new Error(venueResult.error.message);
    }

    const page = (sitemapResult.data ?? []) as Omit<
      GigSitemapRecord,
      "venue_slug"
    >[];
    sitemapRows.push(...page);

    for (const row of (venueResult.data ?? []) as Array<{
      slug: string;
      venue_slug: string;
    }>) {
      venueSlugsByGigSlug.set(row.slug, row.venue_slug);
    }

    if (page.length < SITEMAP_PAGE_SIZE) {
      break;
    }
  }

  return sitemapRows.flatMap((gig) => {
    const venueSlug = venueSlugsByGigSlug.get(gig.slug);

    return gig.slug && venueSlug ? [{ ...gig, venue_slug: venueSlug }] : [];
  });
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getGigImageUrl(gig: GigImageRecord): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? null;

  if (gig.image_path && supabaseUrl) {
    const baseUrl = `${supabaseUrl}/storage/v1/object/public/gig-images/${encodeStoragePath(gig.image_path)}`;
    const version =
      !isContentAddressedGigImagePath(gig.image_path) && gig.image_version
        ? encodeURIComponent(gig.image_version)
        : null;
    return version ? `${baseUrl}?v=${version}` : baseUrl;
  }

  return gig.source_image_url;
}

export function hasRenderableGigImage(gig: GigImageRecord): boolean {
  return Boolean(getRenderableGigImage(gig));
}

export function getRenderableGigImage(
  gig: GigImageRecord
): RenderableGigImage | null {
  const hasGigImage =
    typeof gig.image_width === "number" &&
    gig.image_width > 0 &&
    typeof gig.image_height === "number" &&
    gig.image_height > 0 &&
    Boolean(gig.image_path || gig.source_image_url);

  if (hasGigImage) {
    const url = getGigImageUrl(gig);

    if (url) {
      return {
        height: gig.image_height!,
        isPlaceholder: false,
        url,
        width: gig.image_width!
      };
    }
  }

  return gig.venue_slug === "the-bird" ? THE_BIRD_PLACEHOLDER_IMAGE : null;
}

export function getRenderableGigImageUrl(gig: GigImageRecord): string | null {
  return getRenderableGigImage(gig)?.url ?? null;
}

export function getGigImagePreloadUrls(
  gigs: GigCardRecord[],
  limit = 5
): string[] {
  if (limit <= 0) {
    return [];
  }

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const gig of gigs) {
    const imageUrl = getRenderableGigImageUrl(gig);

    if (!imageUrl || seen.has(imageUrl)) {
      continue;
    }

    seen.add(imageUrl);
    urls.push(imageUrl);

    if (urls.length >= limit) {
      break;
    }
  }

  return urls;
}

export function getAdjacentGigImagePreloadUrls(
  dayMap: Map<string, GigImageGroup>,
  adjacentDateKeys: string[],
  limitPerDay = 5
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const dateKey of adjacentDateKeys) {
    const day = dayMap.get(dateKey);

    if (!day || limitPerDay <= 0) {
      continue;
    }

    let preloadedForDay = 0;

    for (const gig of day.items) {
      const imageUrl = getRenderableGigImageUrl(gig);

      if (!imageUrl || seen.has(imageUrl)) {
        continue;
      }

      seen.add(imageUrl);
      urls.push(imageUrl);

      preloadedForDay += 1;

      if (preloadedForDay >= limitPerDay) {
        break;
      }
    }
  }

  return urls;
}
