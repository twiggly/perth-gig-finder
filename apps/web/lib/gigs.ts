import type { GigStatus } from "@perth-gig-finder/shared";

import { getWhenBounds, matchesGigQuery, type HomepageFilters } from "./homepage-filters";
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
  ticket_url: string | null;
  source_url: string;
  source_name: string | null;
  venue_slug: string;
  venue_name: string;
  venue_suburb: string | null;
  status: GigStatus;
}

export async function listUpcomingGigs(
  filters: HomepageFilters
): Promise<GigCardRecord[]> {
  const client = createSupabaseServerClient();
  const now = new Date();
  const { startAt, endAt } = getWhenBounds(filters.when, now);
  const lowerBound = startAt > now ? startAt : now;
  let query = client
    .from("gig_cards")
    .select(
      "id, slug, title, starts_at, artist_names, image_path, source_image_url, image_width, image_height, ticket_url, source_url, source_name, venue_slug, venue_name, venue_suburb, status"
    )
    .eq("status", "active")
    .gte("starts_at", lowerBound.toISOString())
    .order("starts_at", { ascending: true });

  if (endAt) {
    query = query.lt("starts_at", endAt.toISOString());
  }

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
    return `${supabaseUrl}/storage/v1/object/public/gig-images/${encodeStoragePath(gig.image_path)}`;
  }

  return gig.source_image_url;
}
