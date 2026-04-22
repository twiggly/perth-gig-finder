import type {
  ArtistExtractionKind,
  JsonValue,
  NormalizedGig,
  ScrapeRunResult,
  ScrapeRunStatus,
  StartsAtPrecision
} from "@perth-gig-finder/shared";

export interface SourceAdapterResult {
  gigs: NormalizedGig[];
  failedCount: number;
}

export interface SourceAdapter {
  slug: string;
  name: string;
  baseUrl: string;
  priority: number;
  isPublicListingSource: boolean;
  fetchListings(fetchImpl?: typeof fetch): Promise<SourceAdapterResult>;
  repairArtists?(rawPayload: JsonValue): {
    artists: string[];
    artistExtractionKind: ArtistExtractionKind;
  };
}

export interface SourceRecord {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  priority: number;
  isPublicListingSource: boolean;
}

export interface VenueRecord {
  id: string;
  slug: string;
}

export interface GigRecord {
  id: string;
  slug: string;
  title: string;
}

export type ImageMirrorStatus = "missing" | "pending" | "ready" | "failed";

export interface SourceGigRecord {
  id: string;
  gigId: string;
  sourceSlug: string;
  identityKey: string;
  startsAtPrecision: StartsAtPrecision;
  artistNames: string[];
  artistExtractionKind: ArtistExtractionKind;
  sourceImageUrl: string | null;
  mirroredImagePath: string | null;
  imageMirrorStatus: ImageMirrorStatus;
  imageMirroredAt: string | null;
  mirroredImageWidth: number | null;
  mirroredImageHeight: number | null;
}

export interface SourceGigImageMirrorResult {
  status: ImageMirrorStatus;
  mirroredImagePath: string | null;
  errorMessage: string | null;
  mirroredAt: string | null;
  mirroredImageWidth: number | null;
  mirroredImageHeight: number | null;
}

export interface GigStore {
  ensureSource(input: {
    slug: string;
    name: string;
    baseUrl: string;
    priority: number;
    isPublicListingSource: boolean;
  }): Promise<SourceRecord>;
  ensureImageBucket(): Promise<void>;
  startScrapeRun(sourceId: string, startedAt: string): Promise<string>;
  finishScrapeRun(
    runId: string,
    result: {
      status: ScrapeRunStatus;
      discoveredCount: number;
      insertedCount: number;
      updatedCount: number;
      failedCount: number;
      errorMessage: string | null;
      finishedAt: string;
    }
  ): Promise<void>;
  upsertVenue(gig: NormalizedGig): Promise<VenueRecord>;
  findSourceGig(
    sourceId: string,
    externalId: string | null,
    checksum: string
  ): Promise<SourceGigRecord | null>;
  findCanonicalGig(
    input: {
      venueId: string;
      startsAt: string;
      title: string;
      excludeGigId?: string | null;
    }
  ): Promise<GigRecord | null>;
  saveGig(input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
    sourceId: string;
    sourcePriority: number;
  }): Promise<{ gig: GigRecord; inserted: boolean }>;
  upsertSourceGig(input: {
    sourceId: string;
    gigId: string;
    gig: NormalizedGig;
  }): Promise<{
    inserted: boolean;
    sourceGig: SourceGigRecord;
  }>;
  prepareSourceGigReattachment(input: {
    sourceGigId: string;
    currentGigId: string;
    targetGigId: string;
    sourceId: string;
  }): Promise<void>;
  pruneStaleUpcomingSourceGigs(input: {
    sourceId: string;
    retainedIdentityKeys: string[];
  }): Promise<void>;
  mirrorSourceGigImage(
    sourceGig: SourceGigRecord,
    fetchImpl?: typeof fetch
  ): Promise<SourceGigImageMirrorResult>;
  listSourceGigsNeedingImageMirror(force?: boolean): Promise<SourceGigRecord[]>;
  syncGigArtistsFromSourceGigs(gigIds: string[]): Promise<void>;
}

export interface SourceExecutionResult extends ScrapeRunResult {
  sourceId: string;
  runId: string;
}
