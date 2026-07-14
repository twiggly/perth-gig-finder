import type { JsonValue, NormalizedGig } from "@perth-gig-finder/shared";
import { describe, expect, it } from "vitest";

import { shouldMirrorImage } from "../image-mirror";
import { mirrorPendingSourceGigImages } from "../mirror-images";
import type {
  GigRecord,
  GigStore,
  SourceGigImageMirrorResult,
  SourceGigRecord,
  SourceRecord,
  VenueRecord
} from "../types";

class MirrorOnlyStore implements GigStore {
  readonly sourceGigs = new Map<string, SourceGigRecord>();
  imageBucketEnsured = false;
  lastForceValue = false;
  mirrorDelayMs = 0;
  activeMirrors = 0;
  maxActiveMirrors = 0;
  readonly throwingMirrorIds = new Set<string>();
  readonly mirrorAttempts: string[] = [];

  constructor(sourceGigs: SourceGigRecord[]) {
    for (const sourceGig of sourceGigs) {
      this.sourceGigs.set(sourceGig.id, sourceGig);
    }
  }

  async ensureSource(_input: {
    slug: string;
    name: string;
    baseUrl: string;
    priority: number;
    isPublicListingSource: boolean;
  }): Promise<SourceRecord> {
    throw new Error("not implemented");
  }

  async ensureImageBucket(): Promise<void> {
    this.imageBucketEnsured = true;
  }

  async startScrapeRun(_sourceId: string, _startedAt: string): Promise<string> {
    throw new Error("not implemented");
  }

  async finishScrapeRun(
    _runId: string,
    _result: {
      status: "success" | "partial" | "failed" | "running";
      discoveredCount: number;
      insertedCount: number;
      updatedCount: number;
      failedCount: number;
      errorMessage: string | null;
      finishedAt: string;
    }
  ): Promise<void> {
    throw new Error("not implemented");
  }

  async preloadSourceRunState(_input: {
    sourceId: string;
    gigs: NormalizedGig[];
    now: string;
  }): Promise<void> {
    throw new Error("not implemented");
  }

  async loadSourceGigPayloads(
    _sourceId: string,
    _externalIds: string[]
  ): Promise<Map<string, JsonValue>> {
    throw new Error("not implemented");
  }

  async upsertVenue(_gig: NormalizedGig): Promise<VenueRecord> {
    throw new Error("not implemented");
  }

  async findSourceGig(
    _sourceId: string,
    _externalId: string | null,
    _checksum: string
  ): Promise<SourceGigRecord | null> {
    throw new Error("not implemented");
  }

  async tryReuseUnchangedSourceGig(_input: {
    sourceId: string;
    gig: NormalizedGig;
    venueId: string;
    sourcePriority: number;
  }): Promise<{ gigId: string; sourceGigId: string } | null> {
    throw new Error("not implemented");
  }

  async touchSourceGigsSeen(_sourceGigIds: string[], _seenAt: string): Promise<void> {
    throw new Error("not implemented");
  }

  async findCanonicalGig(
    _input: {
      venueId: string;
      startsAt: string;
      title: string;
    }
  ): Promise<GigRecord | null> {
    throw new Error("not implemented");
  }

  async saveGig(_input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
    sourceId: string;
    sourcePriority: number;
  }): Promise<{ gig: GigRecord; inserted: boolean }> {
    throw new Error("not implemented");
  }

  async upsertSourceGig(_input: {
    sourceId: string;
    gigId: string;
    gig: NormalizedGig;
  }): Promise<{
    inserted: boolean;
    sourceGig: SourceGigRecord;
  }> {
    throw new Error("not implemented");
  }

  async prepareSourceGigReattachment(_input: {
    sourceGigId: string;
    currentGigId: string;
    targetGigId: string;
    sourceId: string;
  }): Promise<void> {
    throw new Error("not implemented");
  }

  async pruneStaleUpcomingSourceGigs(_input: {
    sourceId: string;
    retainedIdentityKeys: string[];
  }): Promise<void> {
    throw new Error("not implemented");
  }

  async mirrorSourceGigImage(
    sourceGig: SourceGigRecord
  ): Promise<SourceGigImageMirrorResult> {
    this.mirrorAttempts.push(sourceGig.id);
    this.activeMirrors += 1;
    this.maxActiveMirrors = Math.max(this.maxActiveMirrors, this.activeMirrors);

    if (this.mirrorDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.mirrorDelayMs));
    }

    if (this.throwingMirrorIds.has(sourceGig.id)) {
      this.activeMirrors -= 1;
      throw new Error(`mirror failed: ${sourceGig.id}`);
    }

    const existing = this.sourceGigs.get(sourceGig.id);

    if (!existing) {
      this.activeMirrors -= 1;
      throw new Error("source gig missing");
    }

    const readyRecord = {
      ...existing,
      mirroredImagePath: `${existing.sourceSlug}/${existing.identityKey}/mirrored.png`,
      imageMirrorStatus: "ready" as const,
      imageMirroredAt: "2026-04-06T09:00:00.000Z",
      mirroredImageWidth: 1200,
      mirroredImageHeight: 600
    };

    this.sourceGigs.set(sourceGig.id, readyRecord);
    this.activeMirrors -= 1;

    return {
      status: "ready",
      mirroredImagePath: readyRecord.mirroredImagePath,
      errorMessage: null,
      mirroredAt: readyRecord.imageMirroredAt,
      mirroredImageWidth: readyRecord.mirroredImageWidth,
      mirroredImageHeight: readyRecord.mirroredImageHeight
    };
  }

  async listSourceGigsNeedingImageMirror(force = false): Promise<SourceGigRecord[]> {
    this.lastForceValue = force;
    return force
      ? [...this.sourceGigs.values()].filter((sourceGig) => Boolean(sourceGig.sourceImageUrl))
      : [...this.sourceGigs.values()].filter(shouldMirrorImage);
  }

  async syncGigArtistsFromSourceGigs(_gigIds: string[]): Promise<void> {
    throw new Error("not implemented");
  }
}

describe("mirrorPendingSourceGigImages", () => {
  it("backfills pending source gigs and marks them ready", async () => {
    const sourceGig: SourceGigRecord = {
      id: "source-gig-1",
      gigId: "gig-1",
      sourceSlug: "oztix-wa",
      externalId: "doctor-jazz",
      identityKey: "doctor-jazz",
      checksum: "doctor-jazz-checksum",
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz",
      startsAtPrecision: "exact",
      artistNames: [],
      artistExtractionKind: "unknown",
      sourceImageUrl: "https://assets.oztix.com.au/image/doctor-jazz.png",
      mirroredImagePath: null,
      imageMirrorStatus: "failed",
      imageMirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null
    };
    const store = new MirrorOnlyStore([sourceGig]);

    const result = await mirrorPendingSourceGigImages(store);

    expect(result).toEqual({
      discoveredCount: 1,
      mirroredCount: 1,
      failedCount: 0
    });
    expect(store.imageBucketEnsured).toBe(true);
    expect(store.sourceGigs.get("source-gig-1")).toMatchObject({
      imageMirrorStatus: "ready",
      mirroredImagePath: "oztix-wa/doctor-jazz/mirrored.png",
      mirroredImageWidth: 1200,
      mirroredImageHeight: 600
    });
  });

  it("backfills ready mirrored rows that are missing stored dimensions", async () => {
    const store = new MirrorOnlyStore([
      {
        id: "source-gig-2",
        gigId: "gig-2",
        sourceSlug: "oztix-wa",
        externalId: "portrait-night",
        identityKey: "portrait-night",
        checksum: "portrait-night-checksum",
        sourceUrl: "https://tickets.oztix.com.au/outlet/event/portrait-night",
        startsAtPrecision: "exact",
        artistNames: [],
        artistExtractionKind: "unknown",
        sourceImageUrl: "https://assets.oztix.com.au/image/portrait-night.png",
        mirroredImagePath: "oztix-wa/portrait-night/mirrored.png",
        imageMirrorStatus: "ready",
        imageMirroredAt: "2026-04-06T09:00:00.000Z",
        mirroredImageWidth: null,
        mirroredImageHeight: null
      }
    ]);

    const result = await mirrorPendingSourceGigImages(store);

    expect(result).toEqual({
      discoveredCount: 1,
      mirroredCount: 1,
      failedCount: 0
    });
    expect(store.sourceGigs.get("source-gig-2")).toMatchObject({
      imageMirrorStatus: "ready",
      mirroredImageWidth: 1200,
      mirroredImageHeight: 600
    });
  });

  it("force-remirrors already ready rows", async () => {
    const store = new MirrorOnlyStore([
      {
        id: "source-gig-3",
        gigId: "gig-3",
        sourceSlug: "oztix-wa",
        externalId: "michael-vdelli",
        identityKey: "michael-vdelli",
        checksum: "michael-vdelli-checksum",
        sourceUrl: "https://tickets.oztix.com.au/outlet/event/michael-vdelli",
        startsAtPrecision: "exact",
        artistNames: [],
        artistExtractionKind: "unknown",
        sourceImageUrl: "https://assets.oztix.com.au/image/michael-vdelli.png",
        mirroredImagePath: "oztix-wa/michael-vdelli/mirrored.png",
        imageMirrorStatus: "ready",
        imageMirroredAt: "2026-04-06T09:00:00.000Z",
        mirroredImageWidth: 1836,
        mirroredImageHeight: 918
      }
    ]);

    const result = await mirrorPendingSourceGigImages(store, fetch, { force: true });

    expect(result).toEqual({
      discoveredCount: 1,
      mirroredCount: 1,
      failedCount: 0
    });
    expect(store.lastForceValue).toBe(true);
  });

  it("mirrors at most two source images concurrently by default", async () => {
    const sourceGigs = Array.from({ length: 3 }, (_, index) => ({
      id: `source-gig-${index}`,
      gigId: `gig-${index}`,
      sourceSlug: "oztix-wa",
      externalId: `event-${index}`,
      identityKey: `event-${index}`,
      checksum: `checksum-${index}`,
      sourceUrl: `https://tickets.example.test/event-${index}`,
      startsAtPrecision: "exact" as const,
      artistNames: [],
      artistExtractionKind: "unknown" as const,
      sourceImageUrl: `https://images.example.test/event-${index}.jpg`,
      mirroredImagePath: null,
      imageMirrorStatus: "pending" as const,
      imageMirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null
    }));
    const store = new MirrorOnlyStore(sourceGigs);
    store.mirrorDelayMs = 5;

    const result = await mirrorPendingSourceGigImages(store);

    expect(result).toEqual({ discoveredCount: 3, mirroredCount: 3, failedCount: 0 });
    expect(store.maxActiveMirrors).toBe(2);
  });

  it("does not start later image batches after a thrown error", async () => {
    const sourceGigs = Array.from({ length: 4 }, (_, index) => ({
      id: `source-gig-${index}`,
      gigId: `gig-${index}`,
      sourceSlug: "oztix-wa",
      externalId: `event-${index}`,
      identityKey: `event-${index}`,
      checksum: `checksum-${index}`,
      sourceUrl: `https://tickets.example.test/event-${index}`,
      startsAtPrecision: "exact" as const,
      artistNames: [],
      artistExtractionKind: "unknown" as const,
      sourceImageUrl: `https://images.example.test/event-${index}.jpg`,
      mirroredImagePath: null,
      imageMirrorStatus: "pending" as const,
      imageMirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null
    }));
    const store = new MirrorOnlyStore(sourceGigs);
    store.throwingMirrorIds.add("source-gig-0");
    store.mirrorDelayMs = 5;

    await expect(mirrorPendingSourceGigImages(store)).rejects.toThrow(
      "mirror failed: source-gig-0"
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(store.mirrorAttempts).toEqual(["source-gig-0", "source-gig-1"]);
  });
});
