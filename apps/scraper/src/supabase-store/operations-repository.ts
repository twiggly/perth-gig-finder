import { slugifyVenueName, type NormalizedGig } from "@perth-gig-finder/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SourceRecord, VenueRecord } from "../types";

interface SourceRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  priority: number;
  is_public_listing_source: boolean;
}

interface VenueRow {
  id: string;
  slug: string;
  website_url?: string | null;
}

export interface VenueCacheEntry extends VenueRecord {
  name: string;
  suburb: string | null;
  address: string | null;
  websiteUrl: string | null;
}

export class SupabaseOperationsRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly venueCache: Map<string, VenueCacheEntry>,
    private readonly sourcePriorityCache: Map<string, number>
  ) {}

  async ensureSource(input: {
    slug: string;
    name: string;
    baseUrl: string;
    priority: number;
    isPublicListingSource: boolean;
  }): Promise<SourceRecord> {
    const { data, error } = await this.client
      .from("sources")
      .upsert(
        {
          slug: input.slug,
          name: input.name,
          base_url: input.baseUrl,
          priority: input.priority,
          is_public_listing_source: input.isPublicListingSource,
          is_active: true
        },
        { onConflict: "slug" }
      )
      .select("id, slug, name, base_url, priority, is_public_listing_source")
      .single<SourceRow>();

    if (error || !data) {
      throw new Error(`Unable to upsert source: ${error?.message ?? "unknown error"}`);
    }

    this.sourcePriorityCache.set(data.id, data.priority);

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      baseUrl: data.base_url,
      priority: data.priority,
      isPublicListingSource: data.is_public_listing_source
    };
  }

  async startScrapeRun(sourceId: string, startedAt: string): Promise<string> {
    const { data, error } = await this.client
      .from("scrape_runs")
      .insert({
        source_id: sourceId,
        status: "running",
        started_at: startedAt
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      throw new Error(
        `Unable to create scrape run: ${error?.message ?? "unknown error"}`
      );
    }

    return data.id;
  }

  async finishScrapeRun(
    runId: string,
    result: {
      status: "success" | "partial" | "failed" | "running";
      discoveredCount: number;
      insertedCount: number;
      updatedCount: number;
      failedCount: number;
      errorMessage: string | null;
      finishedAt: string;
    }
  ): Promise<void> {
    const { error } = await this.client
      .from("scrape_runs")
      .update({
        status: result.status,
        discovered_count: result.discoveredCount,
        inserted_count: result.insertedCount,
        updated_count: result.updatedCount,
        failed_count: result.failedCount,
        error_message: result.errorMessage,
        finished_at: result.finishedAt
      })
      .eq("id", runId);

    if (error) {
      throw new Error(
        `Unable to finalize scrape run: ${error.message ?? "unknown error"}`
      );
    }
  }

  async upsertVenue(gig: NormalizedGig): Promise<VenueRecord> {
    const venueSlug = gig.venue.slug || slugifyVenueName(gig.venue.name);
    const cachedVenue = this.venueCache.get(venueSlug);
    const desiredWebsiteUrl = gig.venue.websiteUrl ?? cachedVenue?.websiteUrl ?? null;

    if (
      cachedVenue &&
      cachedVenue.name === gig.venue.name &&
      cachedVenue.suburb === gig.venue.suburb &&
      cachedVenue.address === gig.venue.address &&
      cachedVenue.websiteUrl === desiredWebsiteUrl
    ) {
      return {
        id: cachedVenue.id,
        slug: cachedVenue.slug
      };
    }

    const { data: existingVenue, error: existingVenueError } = await this.client
      .from("venues")
      .select("id, slug, website_url")
      .eq("slug", venueSlug)
      .maybeSingle<VenueRow>();

    if (existingVenueError) {
      throw new Error(
        `Unable to look up venue before upsert: ${existingVenueError.message ?? "unknown error"}`
      );
    }

    const { data, error } = await this.client
      .from("venues")
      .upsert(
        {
          slug: venueSlug,
          name: gig.venue.name,
          suburb: gig.venue.suburb,
          address: gig.venue.address,
          website_url: desiredWebsiteUrl ?? existingVenue?.website_url ?? null
        },
        { onConflict: "slug" }
      )
      .select("id, slug")
      .single<VenueRow>();

    if (error || !data) {
      throw new Error(`Unable to upsert venue: ${error?.message ?? "unknown error"}`);
    }

    this.venueCache.set(venueSlug, {
      id: data.id,
      slug: data.slug,
      name: gig.venue.name,
      suburb: gig.venue.suburb,
      address: gig.venue.address,
      websiteUrl: desiredWebsiteUrl ?? existingVenue?.website_url ?? null
    });

    return { id: data.id, slug: data.slug };
  }
}
