import type { GigStatus } from "@perth-gig-finder/shared";

import { matchesGigQuery, type HomepageFilters } from "./homepage-filters";
import { getHomepageLowerBound } from "./homepage-dates";
import { createSupabaseServerClient } from "./supabase";

export interface GigCardRecord {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  artist_names: string[];
  image_path: string | null;
  source_image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  image_version: string | null;
  ticket_url: string | null;
  source_url: string;
  source_name: string | null;
  venue_slug: string;
  venue_name: string;
  venue_suburb: string | null;
  venue_website_url: string | null;
  status: GigStatus;
}

interface GigImageRecord {
  image_height: number | null;
  image_path: string | null;
  image_version: string | null;
  image_width: number | null;
  source_image_url: string | null;
}

interface GigImageGroup {
  items: GigCardRecord[];
}

export async function listUpcomingGigs(
  filters: HomepageFilters
): Promise<GigCardRecord[]> {
  const client = createSupabaseServerClient();
  const lowerBound = getHomepageLowerBound(new Date());
  let query = client
    .from("gig_cards")
    .select(
      "id, slug, title, starts_at, artist_names, image_path, source_image_url, image_width, image_height, image_version, ticket_url, source_url, source_name, venue_slug, venue_name, venue_suburb, venue_website_url, status"
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

  const gigs = ((data ?? []) as Array<GigCardRecord & { artist_names: string[] | null }>).map(
    (gig) => ({
      ...gig,
      artist_names: gig.artist_names ?? []
    })
  );

  if (!filters.q) {
    return gigs;
  }

  return gigs.filter((gig) => matchesGigQuery(gig, filters.q));
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getGigImageUrl(gig: GigCardRecord): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? null;

  if (gig.image_path && supabaseUrl) {
    const baseUrl = `${supabaseUrl}/storage/v1/object/public/gig-images/${encodeStoragePath(gig.image_path)}`;
    const version = gig.image_version ? encodeURIComponent(gig.image_version) : null;
    return version ? `${baseUrl}?v=${version}` : baseUrl;
  }

  return gig.source_image_url;
}

export function hasRenderableGigImage(gig: GigImageRecord): boolean {
  return (
    typeof gig.image_width === "number" &&
    gig.image_width > 0 &&
    typeof gig.image_height === "number" &&
    gig.image_height > 0 &&
    Boolean(gig.image_path || gig.source_image_url)
  );
}

export function getRenderableGigImageUrl(gig: GigCardRecord): string | null {
  if (!hasRenderableGigImage(gig)) {
    return null;
  }

  return getGigImageUrl(gig);
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
