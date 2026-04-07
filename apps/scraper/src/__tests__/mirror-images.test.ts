import type { NormalizedGig } from "@perth-gig-finder/shared";
import { describe, expect, it } from "vitest";

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

  async findCanonicalGig(
    _venueId: string,
    _startsAt: string,
    _normalizedTitle: string
  ): Promise<GigRecord | null> {
    throw new Error("not implemented");
  }

  async saveGig(_input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
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
    shouldMirror: boolean;
  }> {
    throw new Error("not implemented");
  }

  async mirrorSourceGigImage(
    sourceGig: SourceGigRecord
  ): Promise<SourceGigImageMirrorResult> {
    const existing = this.sourceGigs.get(sourceGig.id);

    if (!existing) {
      throw new Error("source gig missing");
    }

    const readyRecord = {
      ...existing,
      mirroredImagePath: `${existing.sourceSlug}/${existing.identityKey}/mirrored.png`,
      imageMirrorStatus: "ready" as const,
      imageMirroredAt: "2026-04-06T09:00:00.000Z"
    };

    this.sourceGigs.set(sourceGig.id, readyRecord);

    return {
      status: "ready",
      mirroredImagePath: readyRecord.mirroredImagePath,
      errorMessage: null,
      mirroredAt: readyRecord.imageMirroredAt
    };
  }

  async listSourceGigsNeedingImageMirror(): Promise<SourceGigRecord[]> {
    return [...this.sourceGigs.values()].filter(
      (sourceGig) =>
        Boolean(sourceGig.sourceImageUrl) &&
        (sourceGig.imageMirrorStatus === "missing" ||
          sourceGig.imageMirrorStatus === "failed" ||
          !sourceGig.mirroredImagePath)
    );
  }

  async replaceGigArtists(_gigId: string, _artists: string[]): Promise<void> {
    throw new Error("not implemented");
  }
}

describe("mirrorPendingSourceGigImages", () => {
  it("backfills pending source gigs and marks them ready", async () => {
    const sourceGig: SourceGigRecord = {
      id: "source-gig-1",
      gigId: "gig-1",
      sourceSlug: "oztix-wa",
      identityKey: "doctor-jazz",
      sourceImageUrl: "https://assets.oztix.com.au/image/doctor-jazz.png",
      mirroredImagePath: null,
      imageMirrorStatus: "failed",
      imageMirroredAt: null
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
      mirroredImagePath: "oztix-wa/doctor-jazz/mirrored.png"
    });
  });
});
