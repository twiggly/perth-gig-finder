import {
  areCanonicalTitlesCompatible,
  type ArtistExtractionKind,
  buildGigSlug,
  normalizeCanonicalTitleForMatch,
  normalizeTitleForMatch,
  slugify,
  slugifyVenueName,
  type GigStatus,
  type JsonValue,
  type NormalizedGig,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ensureImageBucket,
  mirrorSourceImage,
  shouldMirrorImage
} from "./image-mirror";
import {
  normalizeArtistNames,
  selectCanonicalArtistNames
} from "./artist-utils";
import type {
  GigRecord,
  GigStore,
  ImageMirrorStatus,
  SourceAdapter,
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

interface VenueCacheEntry extends VenueRecord {
  name: string;
  suburb: string | null;
  address: string | null;
  websiteUrl: string | null;
}

interface GigRow {
  id: string;
  slug: string;
  title: string;
}

interface GigStateRow extends GigRow {
  venue_id: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  ticket_url: string | null;
  source_url: string;
  status: GigStatus;
}

interface SourceGigRow {
  id: string;
  source_id: string;
  gig_id: string;
  identity_key: string;
  starts_at_precision: StartsAtPrecision;
  artist_names: string[];
  artist_extraction_kind: ArtistExtractionKind;
  source_image_url: string | null;
  mirrored_image_path: string | null;
  image_mirror_status: ImageMirrorStatus;
  image_mirrored_at: string | null;
  mirrored_image_width: number | null;
  mirrored_image_height: number | null;
}

interface GigAttachmentRow {
  id: string;
  source_id: string;
}

interface AttachedSourceGigRow extends SourceGigRow {
  last_seen_at: string;
  created_at: string;
}

interface SourceGigLookupRow extends AttachedSourceGigRow {
  external_id: string | null;
  checksum: string;
  source_url: string;
}

interface SourceGigCache {
  byChecksum: Map<string, SourceGigLookupRow>;
  byExternalId: Map<string, SourceGigLookupRow>;
  byGigId: Map<string, SourceGigLookupRow[]>;
  byId: Map<string, SourceGigLookupRow>;
}

interface PrunableSourceGigRow {
  id: string;
  gig_id: string;
  identity_key: string;
}

interface CanonicalGigSourceRow {
  source_id: string;
  source_url: string;
  starts_at_precision: StartsAtPrecision;
}

interface CanonicalGigArtistRow {
  gig_id: string;
  source_id: string;
  artist_names: string[] | null;
  artist_extraction_kind: ArtistExtractionKind;
  last_seen_at: string;
}

interface SourceGigSourceRow {
  id: string;
  slug?: string;
  priority?: number;
}

interface CanonicalGigSourceState {
  sourceId: string;
  sourceUrl: string;
  startsAtPrecision: StartsAtPrecision;
  priority: number;
}

interface RepairableSourceGigRow {
  id: string;
  gig_id: string;
  source_id: string;
  raw_payload: JsonValue;
  artist_names: string[] | null;
  artist_extraction_kind: ArtistExtractionKind;
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
    startsAtPrecision: row.starts_at_precision,
    artistNames: row.artist_names ?? [],
    artistExtractionKind: row.artist_extraction_kind,
    sourceImageUrl: row.source_image_url,
    mirroredImagePath: row.mirrored_image_path,
    imageMirrorStatus: row.image_mirror_status,
    imageMirroredAt: row.image_mirrored_at,
    mirroredImageWidth: row.mirrored_image_width,
    mirroredImageHeight: row.mirrored_image_height
  };
}

function isReadyMirroredSourceGig(row: SourceGigRow): boolean {
  return (
    row.image_mirror_status === "ready" &&
    Boolean(row.mirrored_image_path) &&
    Boolean(row.mirrored_image_width) &&
    Boolean(row.mirrored_image_height)
  );
}

const PERTH_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const QUERY_CHUNK_SIZE = 100;

function getPerthDayBounds(startsAt: string): { startsAtGte: string; startsAtLt: string } {
  const utcDate = new Date(startsAt);
  const perthDate = new Date(utcDate.getTime() + PERTH_UTC_OFFSET_MS);
  const dayStartUtcMs =
    Date.UTC(
      perthDate.getUTCFullYear(),
      perthDate.getUTCMonth(),
      perthDate.getUTCDate()
    ) - PERTH_UTC_OFFSET_MS;

  return {
    startsAtGte: new Date(dayStartUtcMs).toISOString(),
    startsAtLt: new Date(dayStartUtcMs + DAY_IN_MS).toISOString()
  };
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function chooseCanonicalTextField(
  existingValue: string | null,
  incomingValue: string | null,
  canReplaceCanonical: boolean
): string | null {
  if (!existingValue) {
    return incomingValue;
  }

  if (!incomingValue) {
    return existingValue;
  }

  return canReplaceCanonical ? incomingValue : existingValue;
}

function chooseCanonicalStatus(
  existingStatus: GigStatus,
  incomingStatus: GigStatus,
  canReplaceCanonical: boolean
): GigStatus {
  return canReplaceCanonical ? incomingStatus : existingStatus;
}

function compareAttachedSourceGigRows(
  left: Pick<AttachedSourceGigRow, "last_seen_at" | "created_at">,
  right: Pick<AttachedSourceGigRow, "last_seen_at" | "created_at">
): number {
  if (left.last_seen_at !== right.last_seen_at) {
    return right.last_seen_at.localeCompare(left.last_seen_at);
  }

  return right.created_at.localeCompare(left.created_at);
}

function determineCanonicalOwner(
  existingGig: GigStateRow,
  canonicalSources: CanonicalGigSourceState[]
): CanonicalGigSourceState | null {
  return (
    canonicalSources.find((source) => source.sourceUrl === existingGig.source_url) ??
    canonicalSources
      .slice()
      .sort((left, right) => right.priority - left.priority)[0] ??
    null
  );
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
  private readonly venueCache = new Map<string, VenueCacheEntry>();
  private readonly sourceGigCaches = new Map<string, SourceGigCache>();
  private readonly gigStateCache = new Map<string, GigStateRow>();
  private readonly canonicalGigSourceCache = new Map<string, CanonicalGigSourceState[]>();
  private readonly sourcePriorityCache = new Map<string, number>();

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

  private buildSourceGigCache(rows: SourceGigLookupRow[]): SourceGigCache {
    const cache: SourceGigCache = {
      byChecksum: new Map(),
      byExternalId: new Map(),
      byGigId: new Map(),
      byId: new Map()
    };

    for (const row of rows) {
      this.cacheSourceGigRow(cache, row);
    }

    return cache;
  }

  private cacheSourceGigRow(cache: SourceGigCache, row: SourceGigLookupRow): void {
    const existingRow = cache.byId.get(row.id);

    if (existingRow) {
      this.removeSourceGigRowFromCache(cache, existingRow);
    }

    cache.byId.set(row.id, row);
    cache.byChecksum.set(row.checksum, row);

    if (row.external_id) {
      cache.byExternalId.set(row.external_id, row);
    }

    const existingRows = cache.byGigId.get(row.gig_id) ?? [];
    const nextRows = [
      ...existingRows.filter((existingRow) => existingRow.id !== row.id),
      row
    ].sort(compareAttachedSourceGigRows);

    cache.byGigId.set(row.gig_id, nextRows);
  }

  private removeSourceGigRowFromCache(cache: SourceGigCache, row: SourceGigLookupRow): void {
    cache.byId.delete(row.id);
    cache.byChecksum.delete(row.checksum);

    if (row.external_id) {
      cache.byExternalId.delete(row.external_id);
    }

    const existingRows = cache.byGigId.get(row.gig_id) ?? [];
    const nextRows = existingRows.filter((existingRow) => existingRow.id !== row.id);

    if (nextRows.length === 0) {
      cache.byGigId.delete(row.gig_id);
      return;
    }

    cache.byGigId.set(row.gig_id, nextRows);
  }

  private async getSourceGigCache(sourceId: string): Promise<SourceGigCache> {
    const cached = this.sourceGigCaches.get(sourceId);

    if (cached) {
      return cached;
    }

    const { data, error } = await this.client
      .from("source_gigs")
      .select(
        "id, source_id, gig_id, identity_key, starts_at_precision, artist_names, artist_extraction_kind, source_image_url, mirrored_image_path, image_mirror_status, image_mirrored_at, mirrored_image_width, mirrored_image_height, external_id, checksum, source_url, last_seen_at, created_at"
      )
      .eq("source_id", sourceId);

    if (error) {
      throw new Error(
        `Unable to load source gigs for cache: ${error.message ?? "unknown error"}`
      );
    }

    const cache = this.buildSourceGigCache(
      (data as SourceGigLookupRow[] | null) ?? []
    );
    this.sourceGigCaches.set(sourceId, cache);

    await this.hydrateGigCaches([...new Set(
      [...cache.byId.values()].map((row) => row.gig_id)
    )]);

    return cache;
  }

  private async hydrateGigCaches(gigIds: string[]): Promise<void> {
    const uncachedGigIds = [...new Set(gigIds)].filter(
      (gigId) =>
        !this.gigStateCache.has(gigId) || !this.canonicalGigSourceCache.has(gigId)
    );

    if (uncachedGigIds.length === 0) {
      return;
    }

    const gigRows: GigStateRow[] = [];

    for (const gigIdChunk of chunkValues(uncachedGigIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("gigs")
        .select(
          "id, slug, title, venue_id, description, starts_at, ends_at, ticket_url, source_url, status"
        )
        .in("id", gigIdChunk);

      if (error) {
        throw new Error(
          `Unable to preload canonical gig state: ${error.message ?? "unknown error"}`
        );
      }

      gigRows.push(...(((data as GigStateRow[] | null) ?? [])));
    }

    for (const gigRow of gigRows) {
      this.gigStateCache.set(gigRow.id, gigRow);
    }

    const sourceRows: Array<CanonicalGigSourceRow & { gig_id: string }> = [];

    for (const gigIdChunk of chunkValues(uncachedGigIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select("gig_id, source_id, source_url, starts_at_precision")
        .in("gig_id", gigIdChunk);

      if (error) {
        throw new Error(
          `Unable to preload canonical gig sources: ${error.message ?? "unknown error"}`
        );
      }

      sourceRows.push(
        ...(((data as Array<CanonicalGigSourceRow & { gig_id: string }> | null) ?? []))
      );
    }

    const sourcePriorityById = await this.buildSourcePriorityById(
      [...new Set(sourceRows.map((row) => row.source_id))]
    );
    const rowsByGigId = new Map<string, CanonicalGigSourceState[]>();

    for (const row of sourceRows) {
      const existing = rowsByGigId.get(row.gig_id) ?? [];
      existing.push({
        sourceId: row.source_id,
        sourceUrl: row.source_url,
        startsAtPrecision: row.starts_at_precision,
        priority: sourcePriorityById.get(row.source_id) ?? 0
      });
      rowsByGigId.set(row.gig_id, existing);
    }

    for (const gigId of uncachedGigIds) {
      this.canonicalGigSourceCache.set(gigId, rowsByGigId.get(gigId) ?? []);
    }
  }

  private async getGigState(gigId: string): Promise<GigStateRow> {
    const cached = this.gigStateCache.get(gigId);

    if (cached) {
      return cached;
    }

    const { data, error } = await this.client
      .from("gigs")
      .select(
        "id, slug, title, venue_id, description, starts_at, ends_at, ticket_url, source_url, status"
      )
      .eq("id", gigId)
      .single<GigStateRow>();

    if (error || !data) {
      throw new Error(`Unable to load canonical gig: ${error?.message ?? "unknown error"}`);
    }

    this.gigStateCache.set(gigId, data);

    return data;
  }

  private async listCanonicalGigSources(gigId: string): Promise<CanonicalGigSourceState[]> {
    const cached = this.canonicalGigSourceCache.get(gigId);

    if (cached) {
      return cached;
    }

    const { data, error } = await this.client
      .from("source_gigs")
      .select("source_id, source_url, starts_at_precision")
      .eq("gig_id", gigId);

    if (error) {
      throw new Error(
        `Unable to load canonical gig sources: ${error.message ?? "unknown error"}`
      );
    }

    const rows = (data as CanonicalGigSourceRow[] | null) ?? [];
    const sourceIds = [...new Set(rows.map((row) => row.source_id))];

    if (sourceIds.length === 0) {
      return [];
    }

    const { data: sourceData, error: sourceError } = await this.client
      .from("sources")
      .select("id, priority")
      .in("id", sourceIds);

    if (sourceError) {
      throw new Error(
        `Unable to load canonical source priorities: ${sourceError.message ?? "unknown error"}`
      );
    }

    const priorityById = new Map(
      ((sourceData as SourceGigSourceRow[] | null) ?? []).map((source) => [
        source.id,
        source.priority ?? 0
      ])
    );

    const canonicalSources = rows.map((row) => ({
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      startsAtPrecision: row.starts_at_precision,
      priority: priorityById.get(row.source_id) ?? 0
    }));

    this.canonicalGigSourceCache.set(gigId, canonicalSources);

    return canonicalSources;
  }

  private async listCanonicalGigArtistCandidatesByGigId(
    gigIds: string[]
  ): Promise<Map<string, CanonicalGigArtistRow[]>> {
    const uniqueGigIds = [...new Set(gigIds)];

    if (uniqueGigIds.length === 0) {
      return new Map();
    }

    const rows: CanonicalGigArtistRow[] = [];

    for (const gigIdChunk of chunkValues(uniqueGigIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select("gig_id, source_id, artist_names, artist_extraction_kind, last_seen_at")
        .in("gig_id", gigIdChunk);

      if (error) {
        throw new Error(
          `Unable to load canonical gig artist candidates: ${error.message ?? "unknown error"}`
        );
      }

      rows.push(...(((data as CanonicalGigArtistRow[] | null) ?? [])));
    }

    const grouped = new Map<string, CanonicalGigArtistRow[]>();

    for (const row of rows) {
      const existing = grouped.get(row.gig_id) ?? [];
      existing.push(row);
      grouped.set(row.gig_id, existing);
    }

    return grouped;
  }

  private async buildSourcePriorityById(
    sourceIds: string[]
  ): Promise<Map<string, number>> {
    const uniqueSourceIds = [...new Set(sourceIds)];

    if (uniqueSourceIds.length === 0) {
      return new Map();
    }

    const sourceRows: SourceGigSourceRow[] = [];

    for (const sourceIdChunk of chunkValues(uniqueSourceIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("sources")
        .select("id, priority")
        .in("id", sourceIdChunk);

      if (error) {
        throw new Error(
          `Unable to load source priorities for artist sync: ${error.message ?? "unknown error"}`
        );
      }

      sourceRows.push(...(((data as SourceGigSourceRow[] | null) ?? [])));
    }

    return new Map(
      sourceRows.map((source) => {
        const priority = source.priority ?? 0;
        this.sourcePriorityCache.set(source.id, priority);
        return [source.id, priority];
      })
    );
  }

  async findSourceGig(
    sourceId: string,
    externalId: string | null,
    checksum: string
  ): Promise<SourceGigRecord | null> {
    const cache = await this.getSourceGigCache(sourceId);
    const row = externalId
      ? cache.byExternalId.get(externalId) ?? null
      : cache.byChecksum.get(checksum) ?? null;

    return row ? toSourceGigRecord(row, "") : null;
  }

  private async listSourceGigsForSourceAndGig(
    sourceId: string,
    gigId: string
  ): Promise<AttachedSourceGigRow[]> {
    const cache = await this.getSourceGigCache(sourceId);
    return [...(cache.byGigId.get(gigId) ?? [])];
  }

  private pickAttachedSourceGigKeeper(
    rows: AttachedSourceGigRow[],
    preferredIdentityKey: string
  ): AttachedSourceGigRow | null {
    const matchingIdentityRow = rows.find(
      (row) => row.identity_key === preferredIdentityKey
    );

    if (matchingIdentityRow) {
      return matchingIdentityRow;
    }

    const readyMirroredRow = rows.find(isReadyMirroredSourceGig);

    if (readyMirroredRow) {
      return readyMirroredRow;
    }

    return rows[0] ?? null;
  }

  private async deleteSourceGigsById(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const rowsByCache = [...this.sourceGigCaches.values()].map((cache) => ({
      cache,
      rows: ids
        .map((id) => cache.byId.get(id) ?? null)
        .filter((row): row is SourceGigLookupRow => Boolean(row))
    }));

    const { error } = await this.client.from("source_gigs").delete().in("id", ids);

    if (error) {
      throw new Error(`Unable to remove duplicate source gigs: ${error.message}`);
    }

    for (const { cache, rows } of rowsByCache) {
      for (const row of rows) {
        this.removeSourceGigRowFromCache(cache, row);
        this.canonicalGigSourceCache.delete(row.gig_id);
      }
    }
  }

  private async deleteGigsById(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const { error } = await this.client.from("gigs").delete().in("id", ids);

    if (error) {
      throw new Error(`Unable to delete orphaned gigs: ${error.message}`);
    }

    for (const id of ids) {
      this.gigStateCache.delete(id);
      this.canonicalGigSourceCache.delete(id);
    }
  }

  async findCanonicalGig(
    input: {
      venueId: string;
      startsAt: string;
      title: string;
      excludeGigId?: string | null;
    }
  ): Promise<GigRecord | null> {
    const exactNormalizedTitle = normalizeTitleForMatch(input.title);
    const canonicalTitle = normalizeCanonicalTitleForMatch(input.title);
    const { data, error } = await this.client
      .from("gigs")
      .select("id, slug, title")
      .eq("venue_id", input.venueId)
      .eq("starts_at", input.startsAt);

    if (error) {
      throw new Error(`Unable to query canonical gigs: ${error.message}`);
    }

    const exactCandidates = ((data as GigRow[] | null) ?? []).filter(
      (gig) => gig.id !== input.excludeGigId
    );
    const exactCandidate = exactCandidates.find(
      (gig) => normalizeTitleForMatch(gig.title) === exactNormalizedTitle
    );

    if (exactCandidate) {
      return {
        id: exactCandidate.id,
        slug: exactCandidate.slug,
        title: exactCandidate.title
      };
    }

    const { startsAtGte, startsAtLt } = getPerthDayBounds(input.startsAt);
    const { data: dayData, error: dayError } = await this.client
      .from("gigs")
      .select("id, slug, title")
      .eq("venue_id", input.venueId)
      .gte("starts_at", startsAtGte)
      .lt("starts_at", startsAtLt);

    if (dayError) {
      throw new Error(`Unable to query canonical gigs by Perth day: ${dayError.message}`);
    }

    const dayMatches = ((dayData as GigRow[] | null) ?? []).filter(
      (gig) => gig.id !== input.excludeGigId
    );
    const exactCanonicalMatches = dayMatches.filter(
      (gig) => normalizeCanonicalTitleForMatch(gig.title) === canonicalTitle
    );

    if (exactCanonicalMatches.length === 1) {
      const [match] = exactCanonicalMatches;
      return {
        id: match.id,
        slug: match.slug,
        title: match.title
      };
    }

    if (exactCanonicalMatches.length > 1) {
      return null;
    }

    const fuzzyMatches = dayMatches.filter((gig) =>
      areCanonicalTitlesCompatible(gig.title, input.title)
    );

    if (fuzzyMatches.length !== 1) {
      return null;
    }

    const [match] = fuzzyMatches;

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
    sourceId: string;
    sourcePriority: number;
  }): Promise<{ gig: GigRecord; inserted: boolean }> {
    if (input.existingGigId) {
      const existingGig = await this.getGigState(input.existingGigId);
      const canonicalSources = await this.listCanonicalGigSources(input.existingGigId);
      const ownerSource = determineCanonicalOwner(existingGig, canonicalSources);
      const canReplaceCanonical =
        !ownerSource ||
        ownerSource.sourceId === input.sourceId ||
        input.sourcePriority > ownerSource.priority;
      const hasAttachedExactTime = canonicalSources.some(
        (source) => source.startsAtPrecision === "exact"
      );
      const ownerStartsAtPrecision = ownerSource?.startsAtPrecision ?? "exact";
      const shouldUpgradeStartsAt =
        input.gig.startsAtPrecision === "exact" &&
        ownerStartsAtPrecision === "date" &&
        existingGig.starts_at !== input.gig.startsAt;
      const shouldPreserveExactStartsAt =
        input.gig.startsAtPrecision === "date" &&
        (ownerStartsAtPrecision === "exact" || hasAttachedExactTime);
      const startsAt =
        shouldUpgradeStartsAt ||
        (canReplaceCanonical && !shouldPreserveExactStartsAt)
          ? input.gig.startsAt
          : existingGig.starts_at;
      const title = chooseCanonicalTextField(
        existingGig.title,
        input.gig.title,
        canReplaceCanonical
      ) ?? input.gig.title;
      const description = chooseCanonicalTextField(
        existingGig.description,
        input.gig.description,
        canReplaceCanonical
      );
      const endsAt = chooseCanonicalTextField(
        existingGig.ends_at,
        input.gig.endsAt,
        canReplaceCanonical
      );
      const ticketUrl = chooseCanonicalTextField(
        existingGig.ticket_url,
        input.gig.ticketUrl,
        canReplaceCanonical
      );
      const sourceUrl = chooseCanonicalTextField(
        existingGig.source_url,
        input.gig.sourceUrl,
        canReplaceCanonical
      ) ?? input.gig.sourceUrl;
      const status = chooseCanonicalStatus(
        existingGig.status,
        input.gig.status,
        canReplaceCanonical
      );
      const slug = buildGigSlug({
        venueSlug: input.gig.venue.slug,
        startsAt,
        title
      });
      const payload = {
        venue_id: input.venueId,
        title,
        description,
        starts_at: startsAt,
        ends_at: endsAt,
        ticket_url: ticketUrl,
        source_url: sourceUrl,
        status,
        slug
      };
      const { data, error } = await this.client
        .from("gigs")
        .update(payload)
        .eq("id", input.existingGigId)
        .select("id, slug, title")
        .single<GigRow>();

      if (error || !data) {
        throw new Error(`Unable to update gig: ${error?.message ?? "unknown error"}`);
      }

      this.gigStateCache.set(input.existingGigId, {
        id: data.id,
        slug: data.slug,
        title: data.title,
        venue_id: input.venueId,
        description,
        starts_at: startsAt,
        ends_at: endsAt,
        ticket_url: ticketUrl,
        source_url: sourceUrl,
        status
      });

      return {
        gig: {
          id: data.id,
          slug: data.slug,
          title: data.title
        },
        inserted: false
      };
    }

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

    const { data, error } = await this.client
      .from("gigs")
      .insert(payload)
      .select("id, slug, title")
      .single<GigRow>();

    if (error || !data) {
      throw new Error(`Unable to insert gig: ${error?.message ?? "unknown error"}`);
    }

    this.gigStateCache.set(data.id, {
      id: data.id,
      slug: data.slug,
      title: data.title,
      venue_id: input.venueId,
      description: input.gig.description,
      starts_at: input.gig.startsAt,
      ends_at: input.gig.endsAt,
      ticket_url: input.gig.ticketUrl,
      source_url: input.gig.sourceUrl,
      status: input.gig.status
    });
    this.canonicalGigSourceCache.set(data.id, []);

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
  }> {
    const preferredIdentityKey = input.gig.externalId ?? input.gig.checksum;
    const existingByIdentity = await this.findSourceGig(
      input.sourceId,
      input.gig.externalId,
      input.gig.checksum
    );
    const attachedSourceGigs = await this.listSourceGigsForSourceAndGig(
      input.sourceId,
      input.gigId
    );
    const reusableAttachedSourceGig = this.pickAttachedSourceGigKeeper(
      attachedSourceGigs,
      preferredIdentityKey
    );
    const existing =
      existingByIdentity ??
      (reusableAttachedSourceGig
        ? toSourceGigRecord(reusableAttachedSourceGig, input.gig.sourceSlug)
        : null);

    if (existing) {
      const duplicateSourceGigIds = attachedSourceGigs
        .filter((row) => row.id !== existing.id)
        .map((row) => row.id);

      await this.deleteSourceGigsById(duplicateSourceGigIds);
    }

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

    const payload = {
      source_id: input.sourceId,
      gig_id: input.gigId,
      external_id: input.gig.externalId,
      source_url: input.gig.sourceUrl,
      starts_at_precision: input.gig.startsAtPrecision,
      artist_names: normalizeArtistNames(input.gig.artists),
      artist_extraction_kind: input.gig.artistExtractionKind,
      source_image_url: sourceImageUrl,
      mirrored_image_path: unchangedReadyImage ? existing?.mirroredImagePath ?? null : null,
      mirrored_image_width: unchangedReadyImage
        ? existing?.mirroredImageWidth ?? null
        : null,
      mirrored_image_height: unchangedReadyImage
        ? existing?.mirroredImageHeight ?? null
        : null,
      image_mirror_status: imageMirrorStatus,
      image_mirror_error: null,
      image_mirrored_at: unchangedReadyImage ? existing?.imageMirroredAt ?? null : null,
      raw_payload: input.gig.rawPayload,
      checksum: input.gig.checksum,
      last_seen_at: new Date().toISOString()
    };
    const mutation = existing
      ? this.client
          .from("source_gigs")
          .update(payload)
          .eq("id", existing.id)
      : this.client.from("source_gigs").insert(payload);
    const { data, error } = await mutation
      .select(
        "id, source_id, gig_id, identity_key, starts_at_precision, artist_names, artist_extraction_kind, source_image_url, mirrored_image_path, image_mirror_status, image_mirrored_at, mirrored_image_width, mirrored_image_height, external_id, checksum, source_url, last_seen_at, created_at"
      )
      .single<SourceGigLookupRow>();

    if (error || !data) {
      throw new Error(
        `Unable to upsert source gig: ${error?.message ?? "unknown error"}`
      );
    }

    const cache = await this.getSourceGigCache(input.sourceId);
    this.cacheSourceGigRow(cache, data);
    const sourcePriority = this.sourcePriorityCache.get(input.sourceId) ?? 0;
    const existingCanonicalSources = this.canonicalGigSourceCache.get(input.gigId) ?? [];
    const nextCanonicalSources = [
      ...existingCanonicalSources.filter(
        (source) => source.sourceId !== input.sourceId
      ),
      {
        sourceId: input.sourceId,
        sourceUrl: data.source_url,
        startsAtPrecision: data.starts_at_precision,
        priority: sourcePriority
      }
    ];
    this.canonicalGigSourceCache.set(input.gigId, nextCanonicalSources);

    return {
      inserted: !existing,
      sourceGig: toSourceGigRecord(data, input.gig.sourceSlug)
    };
  }

  async prepareSourceGigReattachment(input: {
    sourceGigId: string;
    currentGigId: string;
    targetGigId: string;
    sourceId: string;
  }): Promise<void> {
    if (input.currentGigId === input.targetGigId) {
      return;
    }

    const { data, error } = await this.client
      .from("source_gigs")
      .select("id, source_id")
      .eq("gig_id", input.currentGigId)
      .returns<GigAttachmentRow[]>();

    if (error) {
      throw new Error(
        `Unable to inspect source gig reattachment state: ${error.message}`
      );
    }

    const attachedSourceGigs = data ?? [];

    if (
      attachedSourceGigs.length !== 1 ||
      attachedSourceGigs[0]?.id !== input.sourceGigId ||
      attachedSourceGigs[0]?.source_id !== input.sourceId
    ) {
      return;
    }

    await this.deleteSourceGigsById([input.sourceGigId]);
    await this.deleteGigsById([input.currentGigId]);
  }

  async pruneStaleUpcomingSourceGigs(input: {
    sourceId: string;
    retainedIdentityKeys: string[];
  }): Promise<void> {
    const { data: sourceGigData, error: sourceGigError } = await this.client
      .from("source_gigs")
      .select("id, gig_id, identity_key")
      .eq("source_id", input.sourceId);

    if (sourceGigError) {
      throw new Error(
        `Unable to load source gigs for pruning: ${sourceGigError.message ?? "unknown error"}`
      );
    }

    const sourceGigRows = (sourceGigData as PrunableSourceGigRow[] | null) ?? [];

    if (sourceGigRows.length === 0) {
      return;
    }

    const gigIds = [...new Set(sourceGigRows.map((row) => row.gig_id))];
    const gigRows: Array<{ id: string; status: GigStatus; starts_at: string }> = [];

    for (const gigIdChunk of chunkValues(gigIds, QUERY_CHUNK_SIZE)) {
      const { data: gigData, error: gigError } = await this.client
        .from("gigs")
        .select("id, status, starts_at")
        .in("id", gigIdChunk);

      if (gigError) {
        throw new Error(
          `Unable to load gigs for pruning stale source gigs: ${gigError.message ?? "unknown error"}`
        );
      }

      gigRows.push(
        ...(((gigData as Array<{ id: string; status: GigStatus; starts_at: string }> | null) ??
          []))
      );
    }

    const nowIsoValue = new Date().toISOString();
    const activeUpcomingGigIds = new Set(
      gigRows
        .filter((gig) => gig.status === "active" && gig.starts_at >= nowIsoValue)
        .map((gig) => gig.id)
    );
    const retainedIdentityKeys = new Set(input.retainedIdentityKeys);
    const staleSourceGigRows = sourceGigRows.filter(
      (row) =>
        activeUpcomingGigIds.has(row.gig_id) &&
        !retainedIdentityKeys.has(row.identity_key)
    );
    const staleSourceGigIds = staleSourceGigRows.map((row) => row.id);

    await this.deleteSourceGigsById(staleSourceGigIds);
    await this.syncGigArtistsFromSourceGigs(
      [...new Set(staleSourceGigRows.map((row) => row.gig_id))]
    );
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
        "id, source_id, gig_id, identity_key, starts_at_precision, artist_names, artist_extraction_kind, source_image_url, mirrored_image_path, image_mirror_status, image_mirrored_at, mirrored_image_width, mirrored_image_height"
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

  private async writeGigArtists(gigId: string, artists: string[]): Promise<void> {
    const normalizedArtists = normalizeArtistNames(artists);
    const uniqueArtistsBySlug = new Map<string, string>();

    for (const artist of normalizedArtists) {
      const artistSlug = slugify(artist);

      if (!artistSlug || uniqueArtistsBySlug.has(artistSlug)) {
        continue;
      }

      uniqueArtistsBySlug.set(artistSlug, artist);
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

  async syncGigArtistsFromSourceGigs(gigIds: string[]): Promise<void> {
    const uniqueGigIds = [...new Set(gigIds)];

    if (uniqueGigIds.length === 0) {
      return;
    }

    const candidatesByGigId = await this.listCanonicalGigArtistCandidatesByGigId(uniqueGigIds);
    const sourcePriorityById = await this.buildSourcePriorityById(
      [...new Set(
        [...candidatesByGigId.values()]
          .flat()
          .map((candidate) => candidate.source_id)
      )]
    );

    for (const gigId of uniqueGigIds) {
      const candidates = (candidatesByGigId.get(gigId) ?? []).map((candidate) => ({
        artists: candidate.artist_names ?? [],
        artistExtractionKind: candidate.artist_extraction_kind,
        priority: sourcePriorityById.get(candidate.source_id) ?? 0,
        lastSeenAt: candidate.last_seen_at
      }));

      await this.writeGigArtists(gigId, selectCanonicalArtistNames(candidates));
    }
  }

  async repairActiveUpcomingSourceGigArtists(
    sources: readonly SourceAdapter[]
  ): Promise<
    Array<{
      sourceSlug: string;
      status: "success" | "partial" | "failed";
      discoveredCount: number;
      updatedCount: number;
      failedCount: number;
    }>
  > {
    const sourceRecords = await Promise.all(
      sources.map((source) =>
        this.ensureSource({
          slug: source.slug,
          name: source.name,
          baseUrl: source.baseUrl,
          priority: source.priority,
          isPublicListingSource: source.isPublicListingSource
        })
      )
    );
    const sourceById = new Map(
      sourceRecords.map((record) => [record.id, sources.find((source) => source.slug === record.slug)!])
    );
    const nowIsoValue = new Date().toISOString();
    const { data: activeGigData, error: activeGigError } = await this.client
      .from("gigs")
      .select("id")
      .eq("status", "active")
      .gte("starts_at", nowIsoValue);

    if (activeGigError) {
      throw new Error(
        `Unable to load active gigs for artist repair: ${activeGigError.message ?? "unknown error"}`
      );
    }

    const activeGigIds = ((activeGigData as Array<{ id: string }> | null) ?? []).map(
      (gig) => gig.id
    );

    if (activeGigIds.length === 0) {
      return sources.map((source) => ({
        sourceSlug: source.slug,
        status: "success",
        discoveredCount: 0,
        updatedCount: 0,
        failedCount: 0
      }));
    }

    const sourceIds = sourceRecords.map((record) => record.id);
    const repairableRows: RepairableSourceGigRow[] = [];

    for (const gigIdChunk of chunkValues(activeGigIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select(
          "id, gig_id, source_id, raw_payload, artist_names, artist_extraction_kind"
        )
        .in("gig_id", gigIdChunk)
        .in("source_id", sourceIds);

      if (error) {
        throw new Error(
          `Unable to load source gigs for artist repair: ${error.message ?? "unknown error"}`
        );
      }

      repairableRows.push(...(((data as RepairableSourceGigRow[] | null) ?? [])));
    }

    const resultsBySlug = new Map<
      string,
      {
        sourceSlug: string;
        discoveredCount: number;
        updatedCount: number;
        failedCount: number;
      }
    >(
      sources.map((source) => [
        source.slug,
        {
          sourceSlug: source.slug,
          discoveredCount: 0,
          updatedCount: 0,
          failedCount: 0
        }
      ])
    );
    const touchedGigIds = new Set<string>();

    for (const row of repairableRows) {
      const source = sourceById.get(row.source_id);

      if (!source) {
        continue;
      }

      const result = resultsBySlug.get(source.slug)!;
      result.discoveredCount += 1;

      try {
        const extraction = source.repairArtists
          ? source.repairArtists(row.raw_payload)
          : {
              artists: [],
              artistExtractionKind: "unknown" as const
            };
        const normalizedArtists = normalizeArtistNames(extraction.artists);
        const nextKind =
          normalizedArtists.length === 0 ? "unknown" : extraction.artistExtractionKind;
        const currentArtists = normalizeArtistNames(row.artist_names ?? []);

        if (
          nextKind === row.artist_extraction_kind &&
          currentArtists.length === normalizedArtists.length &&
          currentArtists.every((artist, index) => artist === normalizedArtists[index])
        ) {
          touchedGigIds.add(row.gig_id);
          continue;
        }

        const { error } = await this.client
          .from("source_gigs")
          .update({
            artist_names: normalizedArtists,
            artist_extraction_kind: nextKind
          })
          .eq("id", row.id);

        if (error) {
          throw new Error(error.message);
        }

        result.updatedCount += 1;
        touchedGigIds.add(row.gig_id);
      } catch {
        result.failedCount += 1;
      }
    }

    await this.syncGigArtistsFromSourceGigs([...touchedGigIds]);

    return [...resultsBySlug.values()].map((result) => ({
      ...result,
      status:
        result.updatedCount === 0 && result.failedCount > 0
          ? "failed"
          : result.failedCount > 0
            ? "partial"
            : "success"
    }));
  }
}
