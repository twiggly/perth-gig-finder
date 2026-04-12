import {
  buildGigSlug,
  normalizeTitleForMatch,
  slugify,
  slugifyVenueName,
  type NormalizedGig
} from "@perth-gig-finder/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ensureImageBucket,
  mirrorSourceImage,
  shouldMirrorImage
} from "./image-mirror";
import type {
  GigRecord,
  GigStore,
  ImageMirrorStatus,
  SourceGigImageMirrorResult,
  SourceGigRecord,
  SourceRecord,
  VenueRecord
} from "./types";

interface ArtistRow {
  id: string;
  name: string;
  slug: string;
}

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

interface GigRow {
  id: string;
  slug: string;
  title: string;
}

interface SourceGigRow {
  id: string;
  source_id: string;
  gig_id: string;
  identity_key: string;
  source_image_url: string | null;
  mirrored_image_path: string | null;
  image_mirror_status: ImageMirrorStatus;
  image_mirrored_at: string | null;
  mirrored_image_width: number | null;
  mirrored_image_height: number | null;
}

interface SourceGigSourceRow {
  id: string;
  slug: string;
}

function toSourceGigRecord(
  row: SourceGigRow,
  sourceSlug: string
): SourceGigRecord {
  return {
    id: row.id,
    gigId: row.gig_id,
    sourceSlug,
    identityKey: row.identity_key,
    sourceImageUrl: row.source_image_url,
    mirroredImagePath: row.mirrored_image_path,
    imageMirrorStatus: row.image_mirror_status,
    imageMirroredAt: row.image_mirrored_at,
    mirroredImageWidth: row.mirrored_image_width,
    mirroredImageHeight: row.mirrored_image_height
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createSupabaseAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export class SupabaseGigStore implements GigStore {
  private readonly client = createSupabaseAdminClient();

  async ensureImageBucket(): Promise<void> {
    await ensureImageBucket(this.client);
  }

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

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      baseUrl: data.base_url,
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
          website_url: gig.venue.websiteUrl ?? existingVenue?.website_url ?? null
        },
        { onConflict: "slug" }
      )
      .select("id, slug")
      .single<VenueRow>();

    if (error || !data) {
      throw new Error(`Unable to upsert venue: ${error?.message ?? "unknown error"}`);
    }

    return { id: data.id, slug: data.slug };
  }

  async findSourceGig(
    sourceId: string,
    externalId: string | null,
    checksum: string
  ): Promise<SourceGigRecord | null> {
    let query = this.client
      .from("source_gigs")
      .select(
        "id, source_id, gig_id, identity_key, source_image_url, mirrored_image_path, image_mirror_status, image_mirrored_at, mirrored_image_width, mirrored_image_height"
      )
      .eq("source_id", sourceId)
      .limit(1);

    query = externalId ? query.eq("external_id", externalId) : query.eq("checksum", checksum);

    const { data, error } = await query.single<SourceGigRow>();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }

      throw new Error(`Unable to look up source gig: ${error.message}`);
    }

    return data ? toSourceGigRecord(data, "") : null;
  }

  async findCanonicalGig(
    venueId: string,
    startsAt: string,
    normalizedTitle: string
  ): Promise<GigRecord | null> {
    const { data, error } = await this.client
      .from("gigs")
      .select("id, slug, title")
      .eq("venue_id", venueId)
      .eq("starts_at", startsAt);

    if (error) {
      throw new Error(`Unable to query canonical gigs: ${error.message}`);
    }

    const match = (data as GigRow[] | null)?.find(
      (gig) => normalizeTitleForMatch(gig.title) === normalizedTitle
    );

    return match
      ? {
          id: match.id,
          slug: match.slug,
          title: match.title
        }
      : null;
  }

  async saveGig(input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
  }): Promise<{ gig: GigRecord; inserted: boolean }> {
    const slug = buildGigSlug({
      venueSlug: input.gig.venue.slug,
      startsAt: input.gig.startsAt,
      title: input.gig.title
    });

    const payload = {
      venue_id: input.venueId,
      title: input.gig.title,
      description: input.gig.description,
      starts_at: input.gig.startsAt,
      ends_at: input.gig.endsAt,
      ticket_url: input.gig.ticketUrl,
      source_url: input.gig.sourceUrl,
      status: input.gig.status,
      slug
    };

    if (input.existingGigId) {
      const { data, error } = await this.client
        .from("gigs")
        .update(payload)
        .eq("id", input.existingGigId)
        .select("id, slug, title")
        .single<GigRow>();

      if (error || !data) {
        throw new Error(`Unable to update gig: ${error?.message ?? "unknown error"}`);
      }

      return {
        gig: {
          id: data.id,
          slug: data.slug,
          title: data.title
        },
        inserted: false
      };
    }

    const { data, error } = await this.client
      .from("gigs")
      .insert(payload)
      .select("id, slug, title")
      .single<GigRow>();

    if (error || !data) {
      throw new Error(`Unable to insert gig: ${error?.message ?? "unknown error"}`);
    }

    return {
      gig: {
        id: data.id,
        slug: data.slug,
        title: data.title
      },
      inserted: true
    };
  }

  async upsertSourceGig(input: {
    sourceId: string;
    gigId: string;
    gig: NormalizedGig;
  }): Promise<{
    inserted: boolean;
    sourceGig: SourceGigRecord;
    shouldMirror: boolean;
  }> {
    const existing = await this.findSourceGig(
      input.sourceId,
      input.gig.externalId,
      input.gig.checksum
    );

    const sourceImageUrl = input.gig.imageUrl;
    const unchangedReadyImage =
      Boolean(sourceImageUrl) &&
      existing?.sourceImageUrl === sourceImageUrl &&
      existing.imageMirrorStatus === "ready" &&
      Boolean(existing.mirroredImagePath) &&
      Boolean(existing.mirroredImageWidth) &&
      Boolean(existing.mirroredImageHeight);

    const imageMirrorStatus: ImageMirrorStatus = !sourceImageUrl
      ? "missing"
      : unchangedReadyImage
        ? "ready"
        : "pending";

    const { data, error } = await this.client
      .from("source_gigs")
      .upsert(
      {
        source_id: input.sourceId,
        gig_id: input.gigId,
        external_id: input.gig.externalId,
        source_url: input.gig.sourceUrl,
        source_image_url: sourceImageUrl,
        mirrored_image_path: unchangedReadyImage
          ? existing?.mirroredImagePath ?? null
          : null,
        mirrored_image_width: unchangedReadyImage
          ? existing?.mirroredImageWidth ?? null
          : null,
        mirrored_image_height: unchangedReadyImage
          ? existing?.mirroredImageHeight ?? null
          : null,
        image_mirror_status: imageMirrorStatus,
        image_mirror_error: null,
        image_mirrored_at: unchangedReadyImage
          ? existing?.imageMirroredAt ?? null
          : null,
        raw_payload: input.gig.rawPayload,
        checksum: input.gig.checksum,
        last_seen_at: new Date().toISOString()
      },
      {
        onConflict: "source_id,identity_key"
      }
    )
      .select(
        "id, source_id, gig_id, identity_key, source_image_url, mirrored_image_path, image_mirror_status, image_mirrored_at, mirrored_image_width, mirrored_image_height"
      )
      .single<SourceGigRow>();

    if (error || !data) {
      throw new Error(
        `Unable to upsert source gig: ${error?.message ?? "unknown error"}`
      );
    }

    return {
      inserted: !existing,
      sourceGig: toSourceGigRecord(data, input.gig.sourceSlug),
      shouldMirror: Boolean(sourceImageUrl) && !unchangedReadyImage
    };
  }

  async mirrorSourceGigImage(
    sourceGig: SourceGigRecord,
    fetchImpl: typeof fetch = fetch
  ): Promise<SourceGigImageMirrorResult> {
    const result = await mirrorSourceImage({
      sourceGig,
      fetchImpl,
      upload: async (path, bytes, options) => {
        const { error } = await this.client.storage
          .from("gig-images")
          .upload(path, bytes, {
            upsert: true,
            cacheControl: "31536000",
            contentType: options.contentType
          });

        return { error: error ? { message: error.message } : null };
      }
    });

    const nextStatus: ImageMirrorStatus =
      result.status === "ready"
        ? "ready"
        : sourceGig.sourceImageUrl
          ? "failed"
          : "missing";

    const payload =
      result.status === "ready"
        ? {
            mirrored_image_path: result.mirroredImagePath,
            mirrored_image_width: result.mirroredImageWidth,
            mirrored_image_height: result.mirroredImageHeight,
            image_mirror_status: "ready",
            image_mirror_error: null,
            image_mirrored_at: result.mirroredAt
          }
        : {
            mirrored_image_path: null,
            mirrored_image_width: null,
            mirrored_image_height: null,
            image_mirror_status: nextStatus,
            image_mirror_error: result.errorMessage,
            image_mirrored_at: null
          };

    const { error } = await this.client
      .from("source_gigs")
      .update(payload)
      .eq("id", sourceGig.id);

    if (error) {
      throw new Error(`Unable to update mirrored image state: ${error.message}`);
    }

    return {
      ...result,
      status: nextStatus
    };
  }

  async listSourceGigsNeedingImageMirror(force = false): Promise<SourceGigRecord[]> {
    const { data, error } = await this.client
      .from("source_gigs")
      .select(
        "id, source_id, gig_id, identity_key, source_image_url, mirrored_image_path, image_mirror_status, image_mirrored_at, mirrored_image_width, mirrored_image_height"
      )
      .not("source_image_url", "is", null)
      .order("last_seen_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to list source gigs needing image mirror: ${error.message}`);
    }

    const rows = (data as SourceGigRow[] | null) ?? [];
    const sourceIds = [...new Set(rows.map((row) => row.source_id))];

    if (sourceIds.length === 0) {
      return [];
    }

    const { data: sourceData, error: sourceError } = await this.client
      .from("sources")
      .select("id, slug")
      .in("id", sourceIds);

    if (sourceError) {
      throw new Error(`Unable to load source slugs for image mirroring: ${sourceError.message}`);
    }

    const sourceSlugById = new Map(
      ((sourceData as SourceGigSourceRow[] | null) ?? []).map((source) => [
        source.id,
        source.slug
      ])
    );

    const sourceGigs = rows.map((row) =>
      toSourceGigRecord(row, sourceSlugById.get(row.source_id) ?? "unknown-source")
    );

    return force ? sourceGigs : sourceGigs.filter(shouldMirrorImage);
  }

  async replaceGigArtists(gigId: string, artists: string[]): Promise<void> {
    const uniqueArtistsBySlug = new Map<string, string>();

    for (const artist of artists) {
      const normalizedArtist = artist.trim();

      if (!normalizedArtist) {
        continue;
      }

      const artistSlug = slugify(normalizedArtist);

      if (!artistSlug || uniqueArtistsBySlug.has(artistSlug)) {
        continue;
      }

      uniqueArtistsBySlug.set(artistSlug, normalizedArtist);
    }

    const { error: deleteError } = await this.client
      .from("gig_artists")
      .delete()
      .eq("gig_id", gigId);

    if (deleteError) {
      throw new Error(`Unable to clear gig artists: ${deleteError.message}`);
    }

    if (uniqueArtistsBySlug.size === 0) {
      return;
    }

    const artistRows: ArtistRow[] = [];

    for (const [artistSlug, artistName] of uniqueArtistsBySlug.entries()) {
      const { data, error } = await this.client
        .from("artists")
        .upsert(
          {
            name: artistName,
            slug: artistSlug
          },
          { onConflict: "slug" }
        )
        .select("id, name, slug")
        .single<ArtistRow>();

      if (error || !data) {
        throw new Error(`Unable to upsert artist: ${error?.message ?? "unknown error"}`);
      }

      artistRows.push(data);
    }

    const uniqueArtistRows = [...new Map(artistRows.map((artist) => [artist.id, artist])).values()];
    const { error: joinError } = await this.client.from("gig_artists").insert(
      uniqueArtistRows.map((artist) => ({
        gig_id: gigId,
        artist_id: artist.id
      }))
    );

    if (joinError) {
      throw new Error(`Unable to create gig artist rows: ${joinError.message}`);
    }
  }
}
