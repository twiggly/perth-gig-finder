import type {
  NormalizedGig,
  ScrapeRunResult,
  ScrapeRunStatus
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
}

export interface SourceRecord {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
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
    venueId: string,
    startsAt: string,
    normalizedTitle: string
  ): Promise<GigRecord | null>;
  saveGig(input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
  }): Promise<{ gig: GigRecord; inserted: boolean }>;
  upsertSourceGig(input: {
    sourceId: string;
    gigId: string;
    gig: NormalizedGig;
  }): Promise<{
    inserted: boolean;
    sourceGig: SourceGigRecord;
    shouldMirror: boolean;
  }>;
  mirrorSourceGigImage(
    sourceGig: SourceGigRecord,
    fetchImpl?: typeof fetch
  ): Promise<SourceGigImageMirrorResult>;
  listSourceGigsNeedingImageMirror(force?: boolean): Promise<SourceGigRecord[]>;
  replaceGigArtists(gigId: string, artists: string[]): Promise<void>;
}

export interface SourceExecutionResult extends ScrapeRunResult {
  sourceId: string;
  runId: string;
}
